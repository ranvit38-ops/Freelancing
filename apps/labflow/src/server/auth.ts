import { cache } from 'react';
import { cookies } from 'next/headers';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
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
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  role: 'owner' | 'admin' | 'member';
};

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ tokenHash: hashToken(token), userId, expiresAt });
  cookies().set(env().SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = cookies();
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
 * as data outside a workspace in LabFlow.
 */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const token = cookies().get(env().SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const rows = await db
    .select({
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
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
  const selected = cookies().get(WORKSPACE_COOKIE)?.value;
  return rows.find((row) => row.workspaceId === selected) ?? rows[0]!;
});

/** Every workspace the signed-in user belongs to, for the switcher. */
export const listMyWorkspaces = cache(
  async (): Promise<{ id: string; name: string; role: string }[]> => {
    const token = cookies().get(env().SESSION_COOKIE_NAME)?.value;
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
