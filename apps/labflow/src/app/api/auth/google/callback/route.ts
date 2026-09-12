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
import { createSession } from '@/server/auth';
import { absoluteUrl } from '@/server/mailer';
import {
  GoogleAuthError,
  GoogleNotConfiguredError,
  exchangeGoogleCode,
  isOwnerEmail,
} from '@/server/google';
import { acceptInvite, applySubscriptionEvent, findInviteByToken, startTrial } from '@/server/queries';

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
  for (const name of ['g_state', 'g_verifier', 'g_invite']) jar.delete(name);

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

  let userId = existing[0]?.id;
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

      const workspaceName = `${profile.name.split(' ')[0]}'s Lab`;
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
    await startTrial(created.workspaceId, TRIAL_DAYS, email);
    try {
      await seedExampleProject(created.workspaceId, created.userId);
    } catch {
      // As above: an empty workspace is a worse first run, not a broken one.
    }
  }

  if (inviteToken) {
    const invite = await findInviteByToken(createHash('sha256').update(inviteToken).digest('hex'));
    if (invite) await acceptInvite(invite.id, invite.workspaceId, userId, invite.role);
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
  return NextResponse.redirect(absoluteUrl('/dashboard'));
}
