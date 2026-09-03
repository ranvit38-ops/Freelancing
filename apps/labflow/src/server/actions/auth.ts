'use server';

import { redirect } from 'next/navigation';
import { randomBytes, createHash } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { passwordResetTokens, users, workspaceMembers, workspaces } from '@/db/schema';
import { hashPassword, verifyPassword } from '@/lib/password';
import { normaliseEmail, slugify } from '@/lib/normalise';
import { loginSchema, signupSchema } from '@/lib/validation';
import { createSession, destroySession } from '../auth';
import { fieldErrorsFrom, formObject, type ActionState } from './types';

/** Computed once; its only job is to make an unknown-email login cost the same. */
const decoyHash = hashPassword('labflow-decoy-password-never-matches');

export async function signupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signupSchema.safeParse(formObject(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const email = normaliseEmail(parsed.data.email);
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return { fieldErrors: { email: 'An account with this email already exists' } };
  }

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

  await createSession(userId);
  redirect('/dashboard');
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
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
 * SETUP REQUIRED: no email provider is wired up yet, so the reset link is
 * written to the server log rather than delivered. Add a mailer before this is
 * used by real people.
 */
export async function requestPasswordResetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
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
  console.info(`[labflow] password reset link for ${email}: /reset-password?token=${token}`);
  return confirmation;
}

export async function resetPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
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
