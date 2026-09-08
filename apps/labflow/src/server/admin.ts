import { count, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/db';
import { users, workspaceMembers, workspaces, workspaceSubscriptions } from '@/db/schema';
import { isPlanId, monthlyTotal } from '@/lib/plans';
import { NotTheOwnerError, requireOwner } from './owner';
import type { SessionContext } from './auth';

/**
 * The owner's view across every workspace.
 *
 * This is the one module that reads workspace data without scoping to
 * session.workspaceId, and it exists because running the business needs a
 * question answered that no tenant can answer: who signed up, who is paying,
 * who churned. Every export here calls requireOwner first, and requireOwner
 * has no argument that a request can influence: it compares the signed-in
 * address against LABFLOW_OWNER_EMAIL, which is set on the server.
 *
 * Nothing here returns a tenant's research content. Names, addresses, plan
 * state and counts only. Reading a customer's experiments is not something
 * the owner needs, so the capability is not built.
 */

const DAY = 86_400_000;

export type OwnerSummary = Awaited<ReturnType<typeof ownerSummary>>;

export async function ownerSummary(session: SessionContext) {
  requireOwner(session);
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY);

  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      createdAt: workspaces.createdAt,
      plan: workspaceSubscriptions.plan,
      status: workspaceSubscriptions.status,
      extraSeats: workspaceSubscriptions.extraSeats,
      trialEndsAt: workspaceSubscriptions.trialEndsAt,
      currentPeriodEnd: workspaceSubscriptions.currentPeriodEnd,
      stripeCustomerId: workspaceSubscriptions.stripeCustomerId,
      members: sql<number>`(
        select count(*)::int from "workspace_members" m where m.workspace_id = workspaces.id
      )`,
      projectCount: sql<number>`(
        select count(*)::int from "projects" p where p.workspace_id = workspaces.id
      )`,
      experimentCount: sql<number>`(
        select count(*)::int from "experiments" e where e.workspace_id = workspaces.id
      )`,
      aiThisMonth: sql<number>`(
        select count(*)::int from "ai_generations" g
        where g.workspace_id = workspaces.id
          and g.created_at >= date_trunc('month', now())
      )`,
      lastActiveAt: sql<Date | null>`(
        select max(s.created_at) from "sessions" s
        join "workspace_members" m on m.user_id = s.user_id
        where m.workspace_id = workspaces.id
      )`,
    })
    .from(workspaces)
    .leftJoin(workspaceSubscriptions, eq(workspaceSubscriptions.workspaceId, workspaces.id))
    .orderBy(desc(workspaces.createdAt));

  const paying = rows.filter((r) => r.status === 'active' || r.status === 'past_due');
  const monthlyRevenue = paying.reduce(
    (sum, r) => sum + (r.plan && isPlanId(r.plan) ? monthlyTotal(r.plan, r.extraSeats ?? 0) : 0),
    0,
  );

  const userRows = await db.select({ total: count() }).from(users);
  const newUserRows = await db
    .select({ total: count() })
    .from(users)
    .where(gte(users.createdAt, thirtyDaysAgo));
  const newWorkspaceRows = await db
    .select({ total: count() })
    .from(workspaces)
    .where(gte(workspaces.createdAt, thirtyDaysAgo));

  return {
    workspaces: rows,
    totals: {
      workspaces: rows.length,
      users: userRows[0]?.total ?? 0,
      newUsersThisMonth: newUserRows[0]?.total ?? 0,
      newWorkspacesThisMonth: newWorkspaceRows[0]?.total ?? 0,
      trialing: rows.filter((r) => r.status === 'trialing').length,
      active: rows.filter((r) => r.status === 'active').length,
      pastDue: rows.filter((r) => r.status === 'past_due').length,
      canceled: rows.filter((r) => r.status === 'canceled').length,
      free: rows.filter((r) => !r.status || r.status === 'none').length,
      monthlyRevenue,
      /** Stripe is connected only if at least one workspace has a customer id. */
      stripeLinked: rows.filter((r) => Boolean(r.stripeCustomerId)).length,
    },
  };
}

/** Recent signups, newest first, with the workspace each belongs to. */
export async function ownerSignups(
  session: SessionContext,
  limit = 100,
) {
  requireOwner(session);
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
      workspaceName: workspaces.name,
      workspaceId: workspaces.id,
      role: workspaceMembers.role,
      lastSignInAt: sql<Date | null>`(
        select max(s.created_at) from "sessions" s where s.user_id = users.id
      )`,
      /** Google accounts carry a hash nothing can produce, so this is exact. */
      viaGoogle: sql<boolean>`users.password_hash = 'google-oauth-no-password'`,
    })
    .from(users)
    .leftJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
    .leftJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .orderBy(desc(users.createdAt))
    .limit(Math.min(Math.max(limit, 1), 500));
}

export { NotTheOwnerError, requireOwner };
