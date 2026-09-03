/**
 * Runs against a real Postgres when DATABASE_URL is set (CI provides one).
 *
 * The point of this file is one claim: a session for workspace A cannot read
 * or write workspace B's records, no matter what id it presents.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

type Ctx = Awaited<ReturnType<typeof setup>>;

async function setup() {
  const { db, pool } = await import('@/db');
  const schema = await import('@/db/schema');
  const q = await import('./queries');
  const { NotFoundInWorkspaceError } = await import('./not-found');

  const suffix = randomUUID().slice(0, 8);
  const [userA] = await db
    .insert(schema.users)
    .values({ email: `a-${suffix}@test.local`, name: 'Ada A', passwordHash: 'x' })
    .returning({ id: schema.users.id });
  const [userB] = await db
    .insert(schema.users)
    .values({ email: `b-${suffix}@test.local`, name: 'Ben B', passwordHash: 'x' })
    .returning({ id: schema.users.id });
  const [wsA] = await db
    .insert(schema.workspaces)
    .values({ name: 'Lab A', slug: `lab-a-${suffix}` })
    .returning({ id: schema.workspaces.id });
  const [wsB] = await db
    .insert(schema.workspaces)
    .values({ name: 'Lab B', slug: `lab-b-${suffix}` })
    .returning({ id: schema.workspaces.id });

  if (!userA || !userB || !wsA || !wsB) throw new Error('fixture setup failed');

  await db.insert(schema.workspaceMembers).values([
    { workspaceId: wsA.id, userId: userA.id, role: 'owner' },
    { workspaceId: wsB.id, userId: userB.id, role: 'owner' },
  ]);

  const sessionA = {
    userId: userA.id,
    userName: 'Ada A',
    userEmail: `a-${suffix}@test.local`,
    workspaceId: wsA.id,
    workspaceName: 'Lab A',
    workspaceSlug: `lab-a-${suffix}`,
    role: 'owner' as const,
  };
  const sessionB = { ...sessionA, userId: userB.id, workspaceId: wsB.id, workspaceName: 'Lab B' };

  return { db, pool, schema, q, NotFoundInWorkspaceError, sessionA, sessionB, wsA, wsB };
}

suite('workspace isolation', () => {
  let ctx: Ctx;
  let projectA: string;
  let experimentA: string;

  beforeAll(async () => {
    ctx = await setup();
    projectA = await ctx.q.createProject(ctx.sessionA, {
      name: 'Lab A project',
      description: null,
      researchQuestion: 'Private question',
      status: 'active',
      tags: [],
    });
    experimentA = await ctx.q.createExperiment(ctx.sessionA, projectA, {
      title: 'Lab A experiment',
      objective: 'Private objective',
      hypothesis: null,
      performedOn: null,
      status: 'completed',
      protocolVersionId: null,
      protocolNotes: null,
      repeatsExperimentId: null,
    });
  });

  afterAll(async () => {
    // Delete only this run's fixtures — an unscoped delete here would wipe
    // whatever else lives in the developer's database.
    const { inArray } = await import('drizzle-orm');
    await ctx.db
      .delete(ctx.schema.workspaces)
      .where(inArray(ctx.schema.workspaces.id, [ctx.wsA.id, ctx.wsB.id]));
    await ctx.db
      .delete(ctx.schema.users)
      .where(inArray(ctx.schema.users.id, [ctx.sessionA.userId, ctx.sessionB.userId]));
    await ctx.pool.end();
  });

  it('lets the owning workspace read its own records', async () => {
    expect((await ctx.q.getProject(ctx.sessionA, projectA)).name).toBe('Lab A project');
    expect((await ctx.q.getExperiment(ctx.sessionA, experimentA)).title).toBe('Lab A experiment');
  });

  it('refuses a project read from another workspace', async () => {
    await expect(ctx.q.getProject(ctx.sessionB, projectA)).rejects.toBeInstanceOf(
      ctx.NotFoundInWorkspaceError,
    );
  });

  it('refuses an experiment read from another workspace', async () => {
    await expect(ctx.q.getExperiment(ctx.sessionB, experimentA)).rejects.toBeInstanceOf(
      ctx.NotFoundInWorkspaceError,
    );
    await expect(ctx.q.getExperimentRecord(ctx.sessionB, experimentA)).rejects.toBeInstanceOf(
      ctx.NotFoundInWorkspaceError,
    );
  });

  it('refuses writes from another workspace', async () => {
    await expect(
      ctx.q.updateExperiment(ctx.sessionB, experimentA, { title: 'hijacked' }),
    ).rejects.toBeInstanceOf(ctx.NotFoundInWorkspaceError);
    await expect(ctx.q.addNote(ctx.sessionB, experimentA, 'hijacked')).rejects.toBeInstanceOf(
      ctx.NotFoundInWorkspaceError,
    );
    await expect(ctx.q.deleteExperiment(ctx.sessionB, experimentA)).rejects.toBeInstanceOf(
      ctx.NotFoundInWorkspaceError,
    );
    // …and the record is untouched.
    expect((await ctx.q.getExperiment(ctx.sessionA, experimentA)).title).toBe('Lab A experiment');
  });

  it('refuses to create an experiment inside another workspace project', async () => {
    await expect(
      ctx.q.createExperiment(ctx.sessionB, projectA, {
        title: 'smuggled',
        objective: null,
        hypothesis: null,
        performedOn: null,
        status: 'planned',
        protocolVersionId: null,
        protocolNotes: null,
        repeatsExperimentId: null,
      }),
    ).rejects.toBeInstanceOf(ctx.NotFoundInWorkspaceError);
  });

  it('keeps listings, search and comparison scoped to the caller', async () => {
    expect(await ctx.q.listProjects(ctx.sessionB)).toHaveLength(0);
    expect(await ctx.q.listExperiments(ctx.sessionB)).toHaveLength(0);
    expect(await ctx.q.search(ctx.sessionB, 'Private')).toHaveLength(0);
    expect(await ctx.q.getComparableExperiments(ctx.sessionB, [experimentA])).toHaveLength(0);
    expect(await ctx.q.search(ctx.sessionA, 'Private')).not.toHaveLength(0);
  });

  it('reports which project each comparable experiment belongs to', async () => {
    const rows = await ctx.q.getComparableExperiments(ctx.sessionA, [experimentA]);
    expect(rows[0]?.projectId).toBe(projectA);
  });

  it('numbers experiments per project, starting at 1', async () => {
    const second = await ctx.q.createExperiment(ctx.sessionA, projectA, {
      title: 'Second run',
      objective: null,
      hypothesis: null,
      performedOn: null,
      status: 'planned',
      protocolVersionId: null,
      protocolNotes: null,
      repeatsExperimentId: null,
    });
    expect((await ctx.q.getExperiment(ctx.sessionA, second)).number).toBe(2);
  });

  it('creates missing samples once and reuses them on the second call', async () => {
    const first = await ctx.q.ensureSamples(ctx.sessionA, ['S-900', 'S-901'], projectA);
    const again = await ctx.q.ensureSamples(ctx.sessionA, ['S-900', 'S-901'], projectA);
    expect(first).toHaveLength(2);
    expect(again.sort()).toEqual(first.sort());
  });
});
