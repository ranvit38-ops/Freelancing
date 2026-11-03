import { cache } from 'react';
import { cookies } from 'next/headers';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { sessions, users, workspaceMembers, workspaces } from '@/db/schema';
import { env } from '@/lib/env';

const SESSION_DAYS = 30;

/** Remembers which workspace a multi-lab user last worked in. */
export const WORKSPACE_COOKIE = 'labflow_workspace';

/**
 * Only the hash of the session token is stored, so a database leak does not
 * hand out live sessions.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type SessionContext = {
  userId: string;
  userName: string;
  userEmail: string;
  /** Whether this person has proved they own userEmail. See migration 0022. */
  emailVerified: boolean;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  role: 'owner' | 'admin' | 'member';
};

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ tokenHash: hashToken(token), userId, expiresAt });
  (await cookies()).set(env().SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

/**
 * Makes one lab the one the browser is looking at.
 *
 * Joining a second lab must also land you in it. Without this, someone who
 * already had a lab of their own joins, is taken to the dashboard, sees their
 * old lab, and reasonably concludes the link did nothing. Only callable where
 * cookies can be written: server actions and route handlers, not page renders.
 * getSession still re-checks membership, so this grants nothing by itself.
 */
export async function selectWorkspace(workspaceId: string) {
  (await cookies()).set(WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(env().SESSION_COOKIE_NAME)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  jar.delete(env().SESSION_COOKIE_NAME);
  jar.delete(WORKSPACE_COOKIE);
}

/**
 * Resolves the signed-in user and their current workspace. Cached per request
 * so the many server components on a page share one round trip.
 *
 * A user with no workspace membership resolves to null: there is no such thing
 * as data outside a workspace in Labquill.
 */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const token = (await cookies()).get(env().SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const rows = await db
    .select({
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      workspaceSlug: workspaces.slug,
      role: workspaceMembers.role,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .orderBy(workspaceMembers.createdAt);

  if (rows.length === 0) return null;

  // Honour the selected workspace only if the user is still a member of it,
  // so a stale or forged cookie cannot reach another lab's records.
  const selected = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const { emailVerifiedAt, ...row } = rows.find((r) => r.workspaceId === selected) ?? rows[0]!;
  return { ...row, emailVerified: emailVerifiedAt !== null };
});

/** Every workspace the signed-in user belongs to, for the switcher. */
export const listMyWorkspaces = cache(
  async (): Promise<{ id: string; name: string; role: string }[]> => {
    const token = (await cookies()).get(env().SESSION_COOKIE_NAME)?.value;
    if (!token) return [];
    return db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        role: workspaceMembers.role,
      })
      .from(sessions)
      .innerJoin(workspaceMembers, eq(workspaceMembers.userId, sessions.userId))
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
      .orderBy(workspaceMembers.createdAt);
  },
);

/**
 * Records that this account has proved it owns its address. Called where a
 * message sent to that address was followed: an emailed invite, a reset link,
 * or Google, which verified it. See migration 0022 for why it matters.
 */
export async function markEmailVerified(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)));
}

/** Stored for accounts with no password, so no password can ever match it. */
export const NO_PASSWORD = 'google-oauth-no-password';

/**
 * Google has just verified that the person signing in owns this address.
 *
 * If the account was registered with a password and never verified, whoever
 * chose that password may not be this person: anyone can sign up with someone
 * else's address and wait for them to arrive. So the password is cleared and
 * every other session ended before the real owner is let in. They can set a
 * password again with "Forgot password", which goes to their own inbox.
 *
 * Returns true when it did that, so the caller can say so.
 */
export async function claimWithVerifiedEmail(userId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ verifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!row || row.verifiedAt) return false;
    await tx
      .update(users)
      .set({ passwordHash: NO_PASSWORD, emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    return true;
  });
}

