import { seedExampleProject } from '@/server/example-project';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users, workspaceMembers, workspaces } from '@/db/schema';
import { statesMatch } from '@/lib/oauth';
import { normaliseEmail, slugify } from '@/lib/normalise';
import { randomToken } from '@/lib/oauth';
import { TRIAL_DAYS } from '@/lib/plans';
import { createSession, selectWorkspace } from '@/server/auth';
import { absoluteUrl } from '@/server/mailer';
import { joinedLabEmail, sendConfirmation, welcomeEmail } from '@/server/account-emails';
import { joinByCode, joinWouldBeRefused } from '@/server/join';
import {
  GoogleAuthError,
  GoogleNotConfiguredError,
  exchangeGoogleCode,
  isOwnerEmail,
} from '@/server/google';
import {
  acceptInvite,
  applySubscriptionEvent,
  findInviteByToken,
  findWorkspaceByJoinCode,
  startTrial,
} from '@/server/queries';

export const runtime = 'nodejs';
// Never prerendered. Every path through this route reads per-request state or
// the deployment's own public URL, neither of which exists at build time, and
// a build that tried would fail on a deployment URL it cannot know yet.
export const dynamic = 'force-dynamic';

/**
 * Google's callback.
 *
 * Signs the user in, creating the account and a workspace the first time. An
 * account that already exists is matched on the verified email, so a person can
 * use a password one day and Google the next.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const jar = cookies();
  // absoluteUrl, not request.url. Behind a proxy the incoming URL carries the
  // address the server is bound to (0.0.0.0:10000 on a typical host), so a
  // redirect built from it sends the browser somewhere that does not exist.
  const back = (error: string) => NextResponse.redirect(absoluteUrl(`/login?error=${error}`));

  // Clear the one-shot cookies whichever way this goes.
  const state = jar.get('g_state')?.value;
  const verifier = jar.get('g_verifier')?.value;
  const inviteToken = jar.get('g_invite')?.value;
  const joinCode = jar.get('g_join')?.value;
  for (const name of ['g_state', 'g_verifier', 'g_invite', 'g_join']) jar.delete(name);

  if (url.searchParams.get('error')) return back('google_cancelled');
  if (!statesMatch(state, url.searchParams.get('state') ?? undefined)) return back('google_state');

  const code = url.searchParams.get('code');
  if (!code || !verifier) return back('google_state');

  let profile;
  try {
    profile = await exchangeGoogleCode(code, verifier);
  } catch (error) {
    if (error instanceof GoogleNotConfiguredError) return back('google_unconfigured');
    if (error instanceof GoogleAuthError) return back('google_failed');
    throw error;
  }

  const email = normaliseEmail(profile.email);
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);

  // Resolved before the account is created, because it decides whether a
  // workspace is created at all. Someone who followed a link into a lab and
  // then also got their own empty "Alex's Lab" lands in the wrong one and
  // concludes the link did not work.
  const invite = inviteToken
    ? await findInviteByToken(createHash('sha256').update(inviteToken).digest('hex'))
    : null;
  const joinTarget = !invite && joinCode ? await findWorkspaceByJoinCode(joinCode) : null;

  // Checked here rather than after the account is created: a new account that
  // is then refused a seat has no workspace at all, and nothing on the sign-in
  // screen can get it one.
  if (joinTarget && !existing[0] && (await joinWouldBeRefused(joinTarget.id))) {
    return back('google_join_full');
  }

  let userId = existing[0]?.id;
  const isNewAccount = !userId;
  let ownLabName = '';
  if (!userId) {
    // No password is set: this account signs in with Google until it sets one
    // through the reset flow. The column is not nullable, so it holds a value
    // no password can ever hash to.
    const created = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email, name: profile.name, passwordHash: 'google-oauth-no-password' })
        .returning({ id: users.id });
      if (!user) throw new Error('Could not create the account');

      // Joining a lab that already exists: no second workspace, and no trial
      // or example project, both of which belong to the lab they are joining.
      if (invite || joinTarget) return { userId: user.id, workspaceId: '' };

      const workspaceName = `${profile.name.split(' ')[0]}'s Lab`;
      ownLabName = workspaceName;
      const [workspace] = await tx
        .insert(workspaces)
        .values({ name: workspaceName, slug: `${slugify(workspaceName)}-${randomToken(3)}` })
        .returning({ id: workspaces.id });
      if (!workspace) throw new Error('Could not create the workspace');

      await tx
        .insert(workspaceMembers)
        .values({ workspaceId: workspace.id, userId: user.id, role: 'owner' });
      return { userId: user.id, workspaceId: workspace.id };
    });
    userId = created.userId;
    if (created.workspaceId) {
      await startTrial(created.workspaceId, TRIAL_DAYS, email);
      try {
        await seedExampleProject(created.workspaceId, created.userId);
      } catch {
        // As above: an empty workspace is a worse first run, not a broken one.
      }
    }
  }

  // The lab the link named is where they land, even if they had one already.
  let landIn: string | null = null;
  let joinedLab: string | null = null;
  if (invite) {
    await acceptInvite(invite.id, invite.workspaceId, userId, invite.role);
    landIn = invite.workspaceId;
    joinedLab = invite.workspaceName;
  } else if (joinTarget) {
    const outcome = await joinByCode(joinCode!, userId);
    if (outcome.status === 'joined' || outcome.status === 'already') landIn = outcome.workspaceId;
    if (outcome.status === 'joined') joinedLab = outcome.workspaceName;
  }

  // Not awaited: signing in must not wait on, or fail because of, email.
  if (isNewAccount) {
    const joined = Boolean(joinedLab);
    sendConfirmation(email, joined ? '/start' : '/dashboard', (link) =>
      welcomeEmail({ name: profile.name, labName: joinedLab ?? (ownLabName || 'your lab'), joined, link }),
    );
  } else if (joinedLab) {
    const lab = joinedLab;
    sendConfirmation(email, '/start', (link) => joinedLabEmail({ name: profile.name, labName: lab, link }));
  }

  // The deployment owner is comped rather than trialled. Checked on every
  // sign-in and not only the first, because the owner is likely to have made
  // the account with a password before Google was ever configured, and that
  // account would otherwise never be recognised.
  if (isOwnerEmail(email)) {
    // Oldest membership first, which is the same workspace getSession will
    // land them in.
    const [home] = await db
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, userId))
      .orderBy(workspaceMembers.createdAt)
      .limit(1);
    if (home) {
      await applySubscriptionEvent({
        workspaceId: home.workspaceId,
        plan: 'department',
        status: 'active',
        currentPeriodEnd: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      });
      console.info(`[labflow] owner account signed in, workspace comped: ${email}`);
    }
  }

  await createSession(userId);
  if (landIn) {
    selectWorkspace(landIn);
    return NextResponse.redirect(absoluteUrl('/start?joined=1'));
  }
  // A link that brought them here but could not add them (the lab filled up
  // while they were signing in): back to it, where the reason is spelled out.
  if (joinTarget) return NextResponse.redirect(absoluteUrl(`/join?code=${encodeURIComponent(joinCode!)}`));
  return NextResponse.redirect(absoluteUrl('/dashboard'));
}
