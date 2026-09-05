'use server';

import { redirect } from 'next/navigation';
import { randomBytes, createHash } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { passwordResetTokens, users, workspaceMembers, workspaces } from '@/db/schema';
import { hashPassword, verifyPassword } from '@/lib/password';
import { normaliseEmail, slugify } from '@/lib/normalise';
import { loginSchema, signupSchema } from '@/lib/validation';
import { acceptInvite, findInviteByToken } from '../queries';
import { createSession, destroySession } from '../auth';
import { MailNotConfiguredError, absoluteUrl, mailConfigured, sendEmail } from '../mailer';
import { headers } from 'next/headers';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { fieldErrorsFrom, formObject, type ActionState } from './types';

/**
 * Credential endpoints are throttled per client IP. Without this, login is an
 * unbounded password oracle — scrypt makes each guess expensive for us too,
 * so the cost of not limiting is denial of service as well as brute force.
 */
function throttle(bucket: string, limit: number): ActionState | null {
  const ip = clientIp(headers());
  const { ok, retryAfterSec } = rateLimit(`${bucket}:${ip}`, { limit, windowMs: 60_000 });
  if (ok) return null;
  return { error: `Too many attempts. Try again in ${retryAfterSec} seconds.` };
}

/** Computed once; its only job is to make an unknown-email login cost the same. */
const decoyHash = hashPassword('labflow-decoy-password-never-matches');

export async function signupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const limited = throttle('signup', 5);
  if (limited) return limited;

  const parsed = signupSchema.safeParse(formObject(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const email = normaliseEmail(parsed.data.email);
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return { fieldErrors: { email: 'An account with this email already exists' } };
  }

  // An invite link may have carried them here; joining that workspace is then
  // the whole point, and creating a second empty one would be wrong.
  const inviteToken = String(formData.get('inviteToken') ?? '');
  const invite = inviteToken
    ? await findInviteByToken(createHash('sha256').update(inviteToken).digest('hex'))
    : null;

  const passwordHash = await hashPassword(parsed.data.password);
  const userId = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email, name: parsed.data.name, passwordHash })
      .returning({ id: users.id });
    if (!user) throw new Error('Could not create the account');

    // Slug collisions are rare; a short suffix is cheaper than a retry loop.
    const slug = `${slugify(parsed.data.workspaceName)}-${randomBytes(3).toString('hex')}`;
    const [workspace] = await tx
      .insert(workspaces)
      .values({ name: parsed.data.workspaceName, slug, institution: parsed.data.institution })
      .returning({ id: workspaces.id });
    if (!workspace) throw new Error('Could not create the workspace');

    await tx
      .insert(workspaceMembers)
      .values({ workspaceId: workspace.id, userId: user.id, role: 'owner' });
    return user.id;
  });

  if (invite) await acceptInvite(invite.id, invite.workspaceId, userId, invite.role);
  await createSession(userId);
  redirect('/dashboard');
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const limited = throttle('login', 10);
  if (limited) return limited;

  const parsed = loginSchema.safeParse(formObject(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const email = normaliseEmail(parsed.data.email);
  const rows = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // Verify against a decoy hash when the account is unknown, so response time
  // does not reveal which addresses are registered.
  const user = rows[0];
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? (await decoyHash));
  if (!user || !ok) return { error: 'Email or password is incorrect' };

  const membership = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, user.id))
    .limit(1);
  if (membership.length === 0) {
    return { error: 'This account is not a member of any workspace. Ask a lab owner to invite you.' };
  }

  const inviteToken = String(formData.get('inviteToken') ?? '');
  if (inviteToken) {
    const invite = await findInviteByToken(
      createHash('sha256').update(inviteToken).digest('hex'),
    );
    if (invite) await acceptInvite(invite.id, invite.workspaceId, user.id, invite.role);
  }

  await createSession(user.id);
  redirect('/dashboard');
}

export async function logoutAction() {
  await destroySession();
  redirect('/');
}

/**
 * Always reports the same thing whether or not the address exists, so the form
 * cannot be used to enumerate accounts.
 *
 * When no email provider is configured the link is written to the server log
 * instead, and the caller is told plainly that delivery is unavailable.
 */
export async function requestPasswordResetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const limited = throttle('reset', 5);
  if (limited) return limited;

  const email = normaliseEmail(String(formData.get('email') ?? ''));
  const confirmation = {
    ok: true as const,
    message: 'If an account exists for that address, a reset link is on its way.',
  };
  if (!email.includes('@')) return { fieldErrors: { email: 'Enter a valid email address' } };

  const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  if (!user) return confirmation;

  const token = randomBytes(32).toString('base64url');
  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  const link = absoluteUrl(`/reset-password?token=${token}`);
  if (!mailConfigured()) {
    console.info(`[labflow] email not configured — reset link for ${email}: ${link}`);
    return {
      ok: true,
      message:
        'Email delivery is not configured on this deployment, so no message was sent. The reset link was written to the server log.',
    };
  }

  try {
    await sendEmail({
      to: email,
      subject: 'Reset your LabFlow password',
      text: [
        'Someone asked to reset the password for your LabFlow account.',
        '',
        `Open this link to choose a new one (it expires in one hour):`,
        link,
        '',
        'If this was not you, you can ignore this message — nothing has changed.',
      ].join('\n'),
    });
  } catch (error) {
    if (error instanceof MailNotConfiguredError) {
      console.info(`[labflow] reset link for ${email}: ${link}`);
      return { ok: true, message: error.message };
    }
    // Never leak whether the address exists, even when sending fails.
    console.error('[labflow] password reset email failed', error);
    return confirmation;
  }

  return confirmation;
}

export async function resetPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const limited = throttle('reset-confirm', 10);
  if (limited) return limited;

  const token = String(formData.get('token') ?? '');
  const password = String(formData.get('password') ?? '');
  if (password.length < 10) return { fieldErrors: { password: 'Use at least 10 characters' } };

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const rows = await db
    .select({ id: passwordResetTokens.id, userId: passwordResetTokens.userId })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        gt(passwordResetTokens.expiresAt, new Date()),
        isNull(passwordResetTokens.usedAt),
      ),
    )
    .limit(1);

  const reset = rows[0];
  if (!reset) return { error: 'This reset link is invalid or has expired. Request a new one.' };

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), updatedAt: new Date() })
    .where(eq(users.id, reset.userId));
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, reset.id));

  return { ok: true, message: 'Password updated. You can log in now.' };
}
