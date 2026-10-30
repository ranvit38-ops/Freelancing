/**
 * Runs against a real Postgres when DATABASE_URL is set (CI provides one).
 *
 * The point of this file is one claim: a session for workspace A cannot read
 * or write workspace B's records, no matter what id it presents.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { SessionContext } from './auth';

const hasDb = Boolean(process.env.DATABASE_URL);
const suite = hasDb ? describe : describe.skip;

// One shared connection pool for the file; each suite cleans up only its own rows.
afterAll(async () => {
  if (!hasDb) return;
  const { pool } = await import('@/db');
  await pool.end();
});

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
    emailVerified: true,
    workspaceId: wsA.id,
    workspaceName: 'Lab A',
    workspaceSlug: `lab-a-${suffix}`,
    role: 'owner' as const,
  };
  const sessionB = { ...sessionA, userId: userB.id, workspaceId: wsB.id, workspaceName: 'Lab B' };

  const { eq, sql } = await import('drizzle-orm');
  return { db, pool, schema, q, eq, sql, NotFoundInWorkspaceError, sessionA, sessionB, wsA, wsB };
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
    // Delete only this run's fixtures, an unscoped delete here would wipe
    // whatever else lives in the developer's database.
    const { inArray } = await import('drizzle-orm');
    await ctx.db
      .delete(ctx.schema.workspaces)
      .where(inArray(ctx.schema.workspaces.id, [ctx.wsA.id, ctx.wsB.id]));
    await ctx.db
      .delete(ctx.schema.users)
      .where(inArray(ctx.schema.users.id, [ctx.sessionA.userId, ctx.sessionB.userId]));
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

  it('checks records lab-wide for the caller only, skipping planned runs', async () => {
    const planned = await ctx.q.createExperiment(ctx.sessionA, projectA, {
      title: 'Not started',
      objective: null,
      hypothesis: null,
      performedOn: null,
      status: 'planned',
      protocolVersionId: null,
      protocolNotes: null,
      repeatsExperimentId: null,
    });
    await ctx.q.updateExperiment(ctx.sessionA, experimentA, {
      dataLocation: 'Lab NAS /raw/lab-a/run1/',
    });
    const rows = await ctx.q.listRecordChecks(ctx.sessionA);
    expect(rows.map((r) => r.id)).toEqual([experimentA]);
    expect(rows[0]).toMatchObject({
      researcherName: 'Ada A',
      dataLocation: 'Lab NAS /raw/lab-a/run1/',
      conditionCount: 0,
      fileCount: 0,
      noteCount: 0,
    });
    expect(await ctx.q.listRecordChecks(ctx.sessionB)).toHaveLength(0);
    await ctx.q.deleteExperiment(ctx.sessionA, planned);
  });

  it('lets only a note author, or whoever runs the lab, delete a note', async () => {
    await ctx.q.addNote(ctx.sessionA, experimentA, 'Wells B3 and B4 dried out.');
    const noteId = (await ctx.q.getExperimentRecord(ctx.sessionA, experimentA)).notes[0]!.id;
    const colleague = { ...ctx.sessionA, userId: ctx.sessionB.userId, role: 'member' as const };
    await ctx.q.deleteNote(colleague, experimentA, noteId);
    expect((await ctx.q.getExperimentRecord(ctx.sessionA, experimentA)).notes).toHaveLength(1);
    const admin = { ...colleague, role: 'admin' as const };
    await ctx.q.deleteNote(admin, experimentA, noteId);
    expect((await ctx.q.getExperimentRecord(ctx.sessionA, experimentA)).notes).toHaveLength(0);
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

/**
 * Exercises the whole AI path, retrieval, prompt assembly, JSON extraction,
 * schema validation, evidence filtering and persistence, against a stubbed
 * transport. Only the network call itself is left uncovered.
 */
suite('AI analysis pipeline', () => {
  let ctx: Ctx;
  let projectId: string;
  let experimentId: string;
  let sent: { system: string; prompt: string } | null = null;

  const stub = (body: string): typeof fetch =>
    (async (_url: string, init: RequestInit) => {
      const parsedBody = JSON.parse(String(init.body)) as {
        system: string;
        messages: { content: string }[];
      };
      sent = { system: parsedBody.system, prompt: parsedBody.messages[0]!.content };
      return new Response(JSON.stringify({ content: [{ type: 'text', text: body }] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

  beforeAll(async () => {
    ctx = await setup();
    process.env.ANTHROPIC_API_KEY = 'test-key-not-used-by-the-stub';
    projectId = await ctx.q.createProject(ctx.sessionA, {
      name: 'AI Project',
      description: null,
      researchQuestion: 'Does the sorbent hold up?',
      status: 'active',
      tags: [],
    });
    experimentId = await ctx.q.createExperiment(ctx.sessionA, projectId, {
      title: 'Run under test',
      objective: 'Measure breakthrough.',
      hypothesis: null,
      performedOn: null,
      status: 'completed',
      protocolVersionId: null,
      protocolNotes: null,
      repeatsExperimentId: null,
    });
  });

  afterAll(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { inArray } = await import('drizzle-orm');
    await ctx.db
      .delete(ctx.schema.workspaces)
      .where(inArray(ctx.schema.workspaces.id, [ctx.wsA.id, ctx.wsB.id]));
    await ctx.db
      .delete(ctx.schema.users)
      .where(inArray(ctx.schema.users.id, [ctx.sessionA.userId, ctx.sessionB.userId]));
  });

  it('sends the record as context and returns a validated analysis', async () => {
    const { analyseExperiment } = await import('./ai/analysis');
    const result = await analyseExperiment(
      ctx.sessionA,
      experimentId,
      stub(
        '```json\n' +
          JSON.stringify({
            summary: 'The run completed and recorded a breakthrough measurement.',
            observations: ['EXP-001 records an objective but no conditions.'],
            possibleIssues: ['No conditions are documented, so nothing can be compared.'],
            missingInformation: ['Experimental conditions', 'Raw data'],
            comparison: 'No previous experiments were supplied.',
            suggestedQuestions: ['What conditions were held constant?'],
          }) +
          '\n```',
      ),
    );

    expect(result.analysis.summary).toContain('breakthrough');
    expect(result.analysis.missingInformation).toContain('Raw data');
    expect(result.evidence[0]?.label).toContain('EXP-001');
    // The prompt must carry the record, and the safety rules must be present.
    expect(sent?.prompt).toContain('Run under test');
    expect(sent?.prompt).toContain('Measure breakthrough.');
    expect(sent?.system).toContain('NEVER invent experimental results');
  });

  it('persists the analysis with the evidence it was given', async () => {
    const { eq } = await import('drizzle-orm');
    const rows = await ctx.db
      .select()
      .from(ctx.schema.aiGenerations)
      .where(eq(ctx.schema.aiGenerations.experimentId, experimentId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('experiment_analysis');
    expect(rows[0]?.evidence?.[0]?.id).toBe(experimentId);
  });

  it('rejects a malformed analysis instead of showing a partial one', async () => {
    const { analyseExperiment, AiOutputError } = await import('./ai/analysis');
    await expect(
      analyseExperiment(ctx.sessionA, experimentId, stub('{"summary": 42}')),
    ).rejects.toBeInstanceOf(AiOutputError);
  });

  it('cites only the experiments the model actually named', async () => {
    const { askProject } = await import('./ai/analysis');
    const result = await askProject(
      ctx.sessionA,
      projectId,
      'What have we run so far?',
      stub(
        JSON.stringify({
          answer: 'One experiment is recorded.',
          observations: ['EXP-001 is marked completed.'],
          uncertainties: ['No conditions are documented.'],
          usedExperiments: ['EXP-001'],
          literature: [],
          usedPmids: [],
          suggestions: ['Record the conditions before repeating.'],
          whoToAsk: ['Ada A ran EXP-001, the run under test'],
          whereToLook: ['Timeline', 'Not A Real Page'],
        }),
      ),
    );
    expect(result.answer.answer).toContain('One experiment');
    expect(result.evidence).toHaveLength(1);
    expect(result.retrievedCount).toBe(1);
    expect(result.answer.suggestions[0]).toContain('Record the conditions');
    expect(result.answer.whoToAsk[0]).toContain('Ada A');
  });

  it('tells the model who ran what, so "who to ask" is not guesswork', async () => {
    const { askProject } = await import('./ai/analysis');
    await askProject(
      ctx.sessionA,
      projectId,
      'Who should I talk to?',
      stub(
        JSON.stringify({
          answer: 'x',
          observations: [],
          uncertainties: [],
          usedExperiments: [],
          literature: [],
          usedPmids: [],
          suggestions: [],
          whoToAsk: [],
          whereToLook: [],
        }),
      ),
    );
    expect(sent?.prompt).toContain('PEOPLE (the only names you may suggest asking)');
    expect(sent?.prompt).toContain('Ada A ran EXP-001');
  });

  it('refuses another workspace even with a working transport', async () => {
    const { analyseExperiment } = await import('./ai/analysis');
    await expect(
      analyseExperiment(ctx.sessionB, experimentId, stub('{}')),
    ).rejects.toBeInstanceOf(ctx.NotFoundInWorkspaceError);
  });
});

/**
 * Tasks carry two risks the other records do not: a task can be pointed at a
 * person, and its thread shares a table with every other conversation. Both
 * are ways for one lab's work to surface in another's.
 */
suite('tasks', () => {
  let ctx: Ctx;
  let taskA: string;

  beforeAll(async () => {
    ctx = await setup();
    taskA = await ctx.q.createTask(ctx.sessionA, {
      title: 'Lab A task',
      detail: 'Private detail',
      assignedTo: ctx.sessionA.userId,
      projectId: null,
      dueOn: null,
    });
  });

  afterAll(async () => {
    const { inArray } = await import('drizzle-orm');
    await ctx.db
      .delete(ctx.schema.workspaces)
      .where(inArray(ctx.schema.workspaces.id, [ctx.wsA.id, ctx.wsB.id]));
    await ctx.db
      .delete(ctx.schema.users)
      .where(inArray(ctx.schema.users.id, [ctx.sessionA.userId, ctx.sessionB.userId]));
  });

  it('lists and reads its own', async () => {
    expect((await ctx.q.getTask(ctx.sessionA, taskA)).title).toBe('Lab A task');
    expect((await ctx.q.listTasks(ctx.sessionA)).map((t) => t.id)).toContain(taskA);
  });

  it('refuses a read, an update and a delete from another workspace', async () => {
    await expect(ctx.q.getTask(ctx.sessionB, taskA)).rejects.toBeInstanceOf(
      ctx.NotFoundInWorkspaceError,
    );
    await expect(
      ctx.q.updateTask(ctx.sessionB, taskA, { status: 'done' }),
    ).rejects.toBeInstanceOf(ctx.NotFoundInWorkspaceError);
    await expect(ctx.q.deleteTask(ctx.sessionB, taskA)).rejects.toBeInstanceOf(
      ctx.NotFoundInWorkspaceError,
    );
    expect((await ctx.q.listTasks(ctx.sessionB)).map((t) => t.id)).not.toContain(taskA);
  });

  it('refuses to assign work to somebody outside the lab', async () => {
    // Otherwise a crafted form points a task at any user id in the database,
    // and that person's name is rendered inside a lab they never joined.
    await expect(
      ctx.q.createTask(ctx.sessionA, {
        title: 'x',
        detail: null,
        assignedTo: ctx.sessionB.userId,
        projectId: null,
        dueOn: null,
      }),
    ).rejects.toBeInstanceOf(ctx.NotFoundInWorkspaceError);

    await expect(
      ctx.q.updateTask(ctx.sessionA, taskA, { assignedTo: ctx.sessionB.userId }),
    ).rejects.toBeInstanceOf(ctx.NotFoundInWorkspaceError);
  });

  it('keeps a task thread out of the lab channel', async () => {
    // The lab channel selects messages attached to no project and no
    // experiment. A task message matches both of those, so without the third
    // clause every progress note would appear in the whole lab's feed.
    await ctx.q.postMessage(ctx.sessionA, {
      taskId: taskA,
      parentId: null,
      body: 'Progress on the task only',
    });

    const onTask = await ctx.q.listDiscussion(ctx.sessionA, { taskId: taskA });
    expect(onTask.map((m) => m.body)).toContain('Progress on the task only');

    const channel = await ctx.q.listDiscussion(ctx.sessionA, { workspace: true });
    expect(channel.map((m) => m.body)).not.toContain('Progress on the task only');
  });

  it('refuses to post onto another workspace task', async () => {
    await expect(
      ctx.q.postMessage(ctx.sessionB, { taskId: taskA, parentId: null, body: 'nope' }),
    ).rejects.toBeInstanceOf(ctx.NotFoundInWorkspaceError);
  });
});

/**
 * A private file is private from the rest of the same lab, which is the case
 * workspace scoping alone does not cover: both people pass the workspace
 * check, so every read has to ask about the uploader too.
 */
suite('private files', () => {
  let ctx: Ctx;
  let colleague: { userId: string; userName: string; userEmail: string; emailVerified: boolean; workspaceId: string; workspaceName: string; workspaceSlug: string; role: 'member' };
  let privateId: string;
  let sharedId: string;

  beforeAll(async () => {
    ctx = await setup();
    const { randomUUID } = await import('node:crypto');
    const [user] = await ctx.db
      .insert(ctx.schema.users)
      .values({ email: `c-${randomUUID().slice(0, 8)}@test.local`, name: 'Cole C', passwordHash: 'x' })
      .returning({ id: ctx.schema.users.id, email: ctx.schema.users.email });
    await ctx.db.insert(ctx.schema.workspaceMembers).values({ workspaceId: ctx.wsA.id, userId: user!.id, role: 'member' });
    colleague = { ...ctx.sessionA, userId: user!.id, userName: 'Cole C', userEmail: user!.email, role: 'member' };

    const base = { contentType: 'text/plain', byteSize: 1, storageKey: `k-${randomUUID()}` };
    privateId = await ctx.q.recordFile(ctx.sessionA, { ...base, filename: 'draft.txt', private: true });
    sharedId = await ctx.q.recordFile(ctx.sessionA, { ...base, filename: 'slides.txt' });
  });

  afterAll(async () => {
    const { inArray } = await import('drizzle-orm');
    await ctx.db.delete(ctx.schema.workspaces).where(inArray(ctx.schema.workspaces.id, [ctx.wsA.id, ctx.wsB.id]));
    await ctx.db
      .delete(ctx.schema.users)
      .where(inArray(ctx.schema.users.id, [ctx.sessionA.userId, ctx.sessionB.userId, colleague.userId]));
  });

  it('lets the uploader see and open their own private file', async () => {
    expect((await ctx.q.listFiles(ctx.sessionA)).map((f) => f.id)).toContain(privateId);
    expect((await ctx.q.getFileForDownload(ctx.sessionA, privateId)).filename).toBe('draft.txt');
  });

  it('hides it from a colleague in the same lab: list, download, search and delete', async () => {
    expect((await ctx.q.listFiles(colleague)).map((f) => f.id)).not.toContain(privateId);
    await expect(ctx.q.getFileForDownload(colleague, privateId)).rejects.toBeInstanceOf(ctx.NotFoundInWorkspaceError);
    await expect(ctx.q.deleteFile(colleague, privateId)).rejects.toBeInstanceOf(ctx.NotFoundInWorkspaceError);
    const results = await ctx.q.search(colleague, 'draft');
    expect(results.map((r) => r.id)).not.toContain(privateId);
  });

  it('still shares everything else with the lab', async () => {
    expect((await ctx.q.listFiles(colleague)).map((f) => f.id)).toContain(sharedId);
  });

  it('refuses to post a private file into a conversation others would read', async () => {
    await expect(
      ctx.q.postMessage(ctx.sessionA, { workspace: true, parentId: null, body: 'see this', fileId: privateId }),
    ).rejects.toBeInstanceOf(ctx.NotFoundInWorkspaceError);
  });
  it('files a shared file into a project folder, a protocol and a run, never a private one', async () => {
    const projectId = await ctx.q.createProject(ctx.sessionA, {
      name: 'Infiltration', description: null, researchQuestion: null, status: 'active', tags: [],
    });
    const runId = await ctx.q.createExperiment(ctx.sessionA, projectId, {
      title: 'Run 1', objective: null, hypothesis: null, performedOn: null, status: 'in_progress',
      protocolVersionId: null, protocolNotes: null, repeatsExperimentId: null,
    });
    const protocolId = await ctx.q.createProtocol(ctx.sessionA, {
      name: 'Particle size', description: null, projectId: null, body: null,
    });

    await ctx.q.addFileToProject(colleague, projectId, sharedId, 'Raw data');
    expect((await ctx.q.listProjectFiles(colleague, projectId)).map((f) => [f.filename, f.folder])).toEqual([
      ['slides.txt', 'Raw data'],
    ]);
    // Filing it again moves it between folders rather than duplicating it.
    await ctx.q.addFileToProject(colleague, projectId, sharedId, 'Pictures');
    expect((await ctx.q.listProjectFiles(colleague, projectId)).map((f) => f.folder)).toEqual(['Pictures']);

    await ctx.q.addFileToProtocol(colleague, protocolId, sharedId);
    expect((await ctx.q.listProtocolFiles(ctx.sessionA, protocolId)).map((f) => f.filename)).toEqual(['slides.txt']);
    await ctx.q.addFileToExperiment(colleague, runId, sharedId);
    const homes = await ctx.q.fileHomes(ctx.sessionA);
    expect(homes.get(sharedId)?.map((h) => h.label)).toEqual(['Infiltration / Pictures', 'Protocol: Particle size']);

    await expect(ctx.q.addFileToProject(ctx.sessionA, projectId, privateId, null)).rejects.toBeInstanceOf(
      ctx.q.PrivateFileError,
    );
    await expect(ctx.q.addFileToExperiment(ctx.sessionB, runId, sharedId)).rejects.toBeInstanceOf(
      ctx.NotFoundInWorkspaceError,
    );
    await expect(ctx.q.listProjectFiles(ctx.sessionB, projectId)).rejects.toBeInstanceOf(ctx.NotFoundInWorkspaceError);

    await ctx.q.removeFileFromProject(ctx.sessionA, projectId, sharedId);
    expect(await ctx.q.listProjectFiles(ctx.sessionA, projectId)).toEqual([]);
  });

  it('turns a shared PDF into a protocol, and a revised file into v2, but never a private one', async () => {
    const id = await ctx.q.createProtocol(ctx.sessionA, {
      name: 'Tensiometer', description: null, projectId: null, body: null, fileId: sharedId,
    });
    await ctx.q.addProtocolVersion(ctx.sessionA, id, { body: null, changeNote: 'New ring', fileId: sharedId });
    const { versions } = await ctx.q.getProtocolWithVersions(colleague, id);
    expect(versions.map((v) => [v.version, v.filename])).toEqual([[2, 'slides.txt'], [1, 'slides.txt']]);
    await expect(
      ctx.q.createProtocol(ctx.sessionA, { name: 'Draft', description: null, projectId: null, body: null, fileId: privateId }),
    ).rejects.toBeInstanceOf(ctx.q.PrivateProtocolFileError);
    await expect(
      ctx.q.createProtocol(ctx.sessionB, { name: 'Theirs', description: null, projectId: null, body: null, fileId: sharedId }),
    ).rejects.toBeInstanceOf(ctx.NotFoundInWorkspaceError);
  });
});

/**
 * Sharing with chosen people, and direct messages. Three people in one lab
 * (Ada, Cole, Dee) and one outsider (Ben, in Lab B): what Ada shares with
 * Cole must reach Cole and nobody else, and a DM is readable by its two
 * people only, never by the third colleague and never in #lab.
 */
suite('sharing with chosen people, and direct messages', () => {
  let ctx: Ctx;
  let cole: SessionContext;
  let dee: SessionContext;
  let fileId: string;

  beforeAll(async () => {
    ctx = await setup();
    const { randomUUID } = await import('node:crypto');
    const make = async (name: string) => {
      const [user] = await ctx.db
        .insert(ctx.schema.users)
        .values({ email: `${name.toLowerCase()}-${randomUUID().slice(0, 8)}@test.local`, name, passwordHash: 'x' })
        .returning({ id: ctx.schema.users.id, email: ctx.schema.users.email });
      await ctx.db.insert(ctx.schema.workspaceMembers).values({ workspaceId: ctx.wsA.id, userId: user!.id, role: 'member' });
      return { ...ctx.sessionA, userId: user!.id, userName: name, userEmail: user!.email, role: 'member' as const };
    };
    cole = await make('Cole');
    dee = await make('Dee');
    fileId = await ctx.q.recordFile(ctx.sessionA, {
      filename: 'for-cole.txt',
      contentType: 'text/plain',
      byteSize: 1,
      storageKey: `k-${randomUUID()}`,
      private: true,
    });
  });

  afterAll(async () => {
    const { inArray } = await import('drizzle-orm');
    await ctx.db.delete(ctx.schema.workspaces).where(inArray(ctx.schema.workspaces.id, [ctx.wsA.id, ctx.wsB.id]));
    await ctx.db
      .delete(ctx.schema.users)
      .where(inArray(ctx.schema.users.id, [ctx.sessionA.userId, ctx.sessionB.userId, cole.userId, dee.userId]));
  });

  it('shares a file with exactly the chosen people, and ignores outsiders', async () => {
    const shared = await ctx.q.setFileSharing(ctx.sessionA, fileId, {
      everyone: false,
      userIds: [cole.userId, ctx.sessionB.userId],
    });
    expect(shared).toEqual([cole.userId]);
    expect((await ctx.q.getFileForDownload(cole, fileId)).filename).toBe('for-cole.txt');
    await expect(ctx.q.getFileForDownload(dee, fileId)).rejects.toBeInstanceOf(ctx.NotFoundInWorkspaceError);
    await expect(ctx.q.getFileForDownload(ctx.sessionB, fileId)).rejects.toBeInstanceOf(ctx.NotFoundInWorkspaceError);
  });

  it('lets only the uploader change who a file is for', async () => {
    await expect(ctx.q.setFileSharing(cole, fileId, { everyone: true })).rejects.toBeInstanceOf(
      ctx.NotFoundInWorkspaceError,
    );
  });

  it('keeps a DM between its two people', async () => {
    const { dmKey } = await import('@/lib/dm');
    const key = dmKey([ctx.sessionA.userId, cole.userId]);
    await ctx.q.postMessage(ctx.sessionA, { dmKey: key, parentId: null, body: 'here you go', fileId });

    expect((await ctx.q.listDiscussion(cole, { dmKey: key })).map((m) => m.body)).toEqual(['here you go']);
    expect(await ctx.q.listDiscussion(dee, { dmKey: key })).toEqual([]);
    expect((await ctx.q.listDiscussion(dee, { workspace: true })).map((m) => m.body)).not.toContain('here you go');
    await expect(ctx.q.postMessage(dee, { dmKey: key, parentId: null, body: 'let me in' })).rejects.toBeInstanceOf(
      ctx.NotFoundInWorkspaceError,
    );
  });


  it('shows LabBot only the DMs and files the asker could open themselves', async () => {
    const { buildLabContext } = await import('./ai/labbot');
    // The DM above (Ada to Cole, with the private file) and a lab message.
    await ctx.q.postMessage(dee, { workspace: true, parentId: null, body: 'lab-wide note about the centrifuge' });

    const forCole = (await buildLabContext(cole, 'centrifuge here you go')).text;
    expect(forCole).toContain('here you go');
    expect(forCole).toContain('for-cole.txt');
    expect(forCole).toContain('lab-wide note about the centrifuge');

    const forDee = (await buildLabContext(dee, 'centrifuge here you go')).text;
    expect(forDee).toContain('lab-wide note about the centrifuge');
    expect(forDee).not.toContain('here you go');
    expect(forDee).not.toContain('for-cole.txt');
  });
  it('refuses a DM with someone outside the lab', async () => {
    const { dmKey } = await import('@/lib/dm');
    await expect(
      ctx.q.postMessage(ctx.sessionA, { dmKey: dmKey([ctx.sessionA.userId, ctx.sessionB.userId]), parentId: null, body: 'hi' }),
    ).rejects.toBeInstanceOf(ctx.NotFoundInWorkspaceError);
  });

  it('refuses to put a file in a DM with someone who cannot open it', async () => {
    const { dmKey } = await import('@/lib/dm');
    await expect(
      ctx.q.postMessage(ctx.sessionA, { dmKey: dmKey([ctx.sessionA.userId, dee.userId]), parentId: null, body: 'x', fileId }),
    ).rejects.toBeInstanceOf(ctx.NotFoundInWorkspaceError);
  });

  it('marks a DM unread for the recipient until they open it', async () => {
    const [thread] = await ctx.q.listDmThreads(cole);
    expect(thread?.unread).toBe(true);
    await ctx.q.markChannelRead(cole, `dm:${thread!.dmKey}`);
    expect((await ctx.q.listDmThreads(cole))[0]?.unread).toBe(false);
    // The sender's own message is never unread to them.
    expect((await ctx.q.listDmThreads(ctx.sessionA))[0]?.unread).toBe(false);
    expect(await ctx.q.listDmThreads(dee)).toEqual([]);
  });

  it('gives each person a private calendar address for their lab', async () => {
    await ctx.q.setCalendarToken(cole, 'a'.repeat(32));
    const feed = await ctx.q.calendarFeed('a'.repeat(32), '2026-09-25');
    expect(feed?.workspaceName).toBe('Lab A');
    expect(await ctx.q.calendarFeed('b'.repeat(32), '2026-09-25')).toBeNull();
  });
});

suite('who is in the lab, and deleting it', () => {
  let ctx: Ctx;
  let cy: SessionContext;
  let dot: SessionContext;

  beforeAll(async () => {
    ctx = await setup();
    const make = async (name: string, role: 'admin' | 'member') => {
      const [user] = await ctx.db
        .insert(ctx.schema.users)
        .values({ email: `${name.toLowerCase()}-${randomUUID().slice(0, 8)}@test.local`, name, passwordHash: 'x' })
        .returning({ id: ctx.schema.users.id, email: ctx.schema.users.email });
      await ctx.db.insert(ctx.schema.workspaceMembers).values({ workspaceId: ctx.wsA.id, userId: user!.id, role });
      return { ...ctx.sessionA, userId: user!.id, userName: name, userEmail: user!.email, role };
    };
    cy = await make('Cy', 'admin');
    dot = await make('Dot', 'member');
  });

  afterAll(async () => {
    const { inArray } = await import('drizzle-orm');
    await ctx.db.delete(ctx.schema.workspaces).where(inArray(ctx.schema.workspaces.id, [ctx.wsA.id, ctx.wsB.id]));
    await ctx.db
      .delete(ctx.schema.users)
      .where(inArray(ctx.schema.users.id, [ctx.sessionA.userId, ctx.sessionB.userId, cy.userId, dot.userId]));
  });

  it('never lets a lab lose its last owner', async () => {
    await expect(ctx.q.setMemberRole(ctx.sessionA, ctx.sessionA.userId, 'admin')).rejects.toBeInstanceOf(
      ctx.q.MembershipRefusedError,
    );
    await expect(ctx.q.leaveWorkspace(ctx.sessionA)).rejects.toBeInstanceOf(ctx.q.MembershipRefusedError);
  });

  it('lets only an owner change roles, and an admin remove members but not owners', async () => {
    await expect(ctx.q.setMemberRole(cy, dot.userId, 'admin')).rejects.toBeInstanceOf(ctx.q.MembershipRefusedError);
    await expect(ctx.q.removeMember(cy, ctx.sessionA.userId)).rejects.toBeInstanceOf(ctx.q.MembershipRefusedError);
    await ctx.q.setMemberRole(ctx.sessionA, cy.userId, 'owner');
    // Two owners now: the first may step down.
    await ctx.q.setMemberRole(ctx.sessionA, ctx.sessionA.userId, 'admin');
    await ctx.q.setMemberRole({ ...cy, role: 'owner' }, ctx.sessionA.userId, 'owner');
    await ctx.q.removeMember(cy, dot.userId);
    const left = (await ctx.q.listWorkspaceMembers(ctx.sessionA)).map((m) => m.id);
    expect(left).not.toContain(dot.userId);
  });

  it('refuses a membership change aimed at another lab', async () => {
    await expect(ctx.q.removeMember(ctx.sessionA, ctx.sessionB.userId)).rejects.toBeInstanceOf(ctx.q.MembershipRefusedError);
  });

  it('deletes a lab with its records and stored files, only when its name is typed', async () => {
    const { putFile, getFile, removeWorkspaceFiles, FileGoneError } = await import('./storage');
    const projectId = await ctx.q.createProject(ctx.sessionB, {
      name: 'To be deleted',
      description: null,
      researchQuestion: null,
      status: 'active',
      tags: [],
    });
    const key = await putFile(ctx.wsB.id, 'notes.txt', Buffer.from('bye'));
    await expect(ctx.q.deleteWorkspace(ctx.sessionB, 'Lab b')).rejects.toBeInstanceOf(ctx.q.MembershipRefusedError);
    await ctx.q.deleteWorkspace(ctx.sessionB, 'Lab B');
    await removeWorkspaceFiles(ctx.wsB.id);
    const { eq } = await import('drizzle-orm');
    expect(await ctx.db.select().from(ctx.schema.projects).where(eq(ctx.schema.projects.id, projectId))).toEqual([]);
    await expect(getFile(key)).rejects.toBeInstanceOf(FileGoneError);
  });
});

suite('importing from Google Drive', () => {
  let ctx: Ctx;
  beforeAll(async () => {
    ctx = await setup();
  });
  afterAll(async () => {
    const { inArray } = await import('drizzle-orm');
    await ctx.db.delete(ctx.schema.workspaces).where(inArray(ctx.schema.workspaces.id, [ctx.wsA.id, ctx.wsB.id]));
    await ctx.db.delete(ctx.schema.users).where(inArray(ctx.schema.users.id, [ctx.sessionA.userId, ctx.sessionB.userId]));
  });

  it('copies picked files in, exporting Google formats, and explains what it could not take', async () => {
    const { importDriveFiles } = await import('./drive-import');
    const requested: string[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      requested.push(`${url} ${(init.headers as Record<string, string>).authorization}`);
      if (url.includes('/nope1234567')) return new Response('no', { status: 403 });
      // A real (minimal) workbook, as Google exports it: uploads are checked.
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      zip.file('[Content_Types].xml', '<Types/>');
      zip.file('xl/workbook.xml', '<workbook/>');
      return new Response(new Uint8Array(await zip.generateAsync({ type: 'nodebuffer' })), { status: 200 });
    }) as unknown as typeof fetch;

    const results = await importDriveFiles(
      ctx.sessionA,
      'token-abc',
      [
        { id: 'sheet123456', name: 'Plate run 4', mimeType: 'application/vnd.google-apps.spreadsheet' },
        { id: 'nope1234567', name: 'secret.pdf', mimeType: 'application/pdf' },
        { id: 'folder12345', name: 'Everything', mimeType: 'application/vnd.google-apps.folder' },
      ],
      { kind: 'everyone' },
      fake,
    );

    expect(results[0]).toMatchObject({ name: 'Plate run 4.xlsx' });
    expect(results[0]!.fileId).toBeTruthy();
    expect(results[1]!.error).toMatch(/did not let Labquill read/);
    expect(results[2]!.error).toMatch(/Folders/);
    expect(requested[0]).toContain('/export?mimeType=application%2Fvnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(requested[0]).toContain('Bearer token-abc');
    const listed = await ctx.q.listFiles(ctx.sessionA);
    expect(listed.map((f) => f.filename)).toContain('Plate run 4.xlsx');
  });
});

suite('activity log', () => {
  let ctx: Ctx;

  beforeAll(async () => {
    ctx = await setup();
  });

  afterAll(async () => {
    const { inArray } = await import('drizzle-orm');
    await ctx.db.delete(ctx.schema.workspaces).where(inArray(ctx.schema.workspaces.id, [ctx.wsA.id, ctx.wsB.id]));
    await ctx.db
      .delete(ctx.schema.users)
      .where(inArray(ctx.schema.users.id, [ctx.sessionA.userId, ctx.sessionB.userId]));
  });

  it('records who created, edited, noted and deleted what, folding one save into one entry', async () => {
    const projectId = await ctx.q.createProject(ctx.sessionA, {
      name: 'Biofilm',
      description: null,
      researchQuestion: null,
      status: 'active',
      tags: [],
    });
    const experimentId = await ctx.q.createExperiment(ctx.sessionA, projectId, {
      title: 'Crystal violet',
      objective: null,
      hypothesis: null,
      performedOn: null,
      status: 'in_progress',
      protocolVersionId: null,
      protocolNotes: null,
      repeatsExperimentId: null,
    });
    // Filling in the detail right after creating is part of creating it.
    await ctx.q.replaceConditions(ctx.sessionA, experimentId, [{ name: 'T', value: '37', unit: '°C' }]);

    // A later save touching three tables reads as one edit.
    await ctx.db
      .update(ctx.schema.activity)
      .set({ createdAt: ctx.sql`${ctx.schema.activity.createdAt} - interval '5 minutes'` })
      .where(ctx.eq(ctx.schema.activity.workspaceId, ctx.wsA.id));
    await ctx.q.updateExperiment(ctx.sessionA, experimentId, { objective: 'Quantify biomass', status: 'completed' });
    await ctx.q.replaceConditions(ctx.sessionA, experimentId, [{ name: 'T', value: '30', unit: '°C' }]);
    await ctx.q.upsertResult(ctx.sessionA, experimentId, {
      summary: 'OD590 doubled',
      observations: null,
      conclusion: null,
      nextSteps: null,
    });
    // Saving again with nothing changed adds nothing.
    await ctx.q.updateExperiment(ctx.sessionA, experimentId, { objective: 'Quantify biomass' });

    await ctx.q.addNote(ctx.sessionA, experimentId, 'Wells B3 and B4 dried out.');
    const noteId = (await ctx.q.getExperimentRecord(ctx.sessionA, experimentId)).notes[0]!.id;
    await ctx.q.deleteNote(ctx.sessionA, experimentId, noteId);
    await ctx.q.recordFile(ctx.sessionA, { filename: 'secret.csv', contentType: 'text/csv', byteSize: 1, storageKey: 'k1', private: true });
    await ctx.q.recordFile(ctx.sessionA, { filename: 'plate.csv', contentType: 'text/csv', byteSize: 1, storageKey: 'k2' });

    const log = await ctx.q.listActivity(ctx.sessionA);
    const lines = log.map((r) => `${r.actorName} ${r.action} ${r.subjectType} ${r.label} | ${r.detail ?? ''}`).reverse();
    expect(lines).toEqual([
      'Ada A created project Biofilm | ',
      'Ada A created experiment EXP-001 Crystal violet | ',
      'Ada A edited experiment EXP-001 Crystal violet | objective, status In progress → Completed, conditions, result summary',
      'Ada A added note EXP-001 Crystal violet | Wells B3 and B4 dried out.',
      'Ada A deleted note EXP-001 Crystal violet | Wells B3 and B4 dried out.',
      'Ada A uploaded file plate.csv | ',
    ]);
  });

  it('gives whoever runs the lab one row per person, counted from the records', async () => {
    const rows = await ctx.q.labPulse(ctx.sessionA);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: ctx.sessionA.userId, runsThisWeek: 1, notesThisWeek: 0 });
    expect(rows[0]!.lastActive).toBeInstanceOf(Date);
    await expect(ctx.q.labPulse({ ...ctx.sessionA, role: 'member' as const })).rejects.toBeInstanceOf(
      ctx.q.MembershipRefusedError,
    );
  });

  it('is for owners and admins of the lab, and never crosses labs', async () => {
    await expect(
      ctx.q.listActivity({ ...ctx.sessionA, role: 'member' as const }),
    ).rejects.toBeInstanceOf(ctx.q.MembershipRefusedError);
    expect(await ctx.q.listActivity({ ...ctx.sessionA, role: 'admin' as const })).not.toHaveLength(0);
    expect(await ctx.q.listActivity(ctx.sessionB)).toHaveLength(0);
    expect(await ctx.q.listActivity(ctx.sessionA, { actorId: ctx.sessionB.userId })).toHaveLength(0);
  });
});

/**
 * A link into another of your labs. The lookup crosses workspaces on purpose,
 * so what it must never do matters more than what it does.
 */
suite('links into another of your labs', () => {
  let ctx: Ctx;
  let projectA: string;

  beforeAll(async () => {
    ctx = await setup();
    projectA = await ctx.q.createProject(ctx.sessionA, {
      name: 'Sediment cores',
      description: null,
      researchQuestion: null,
      status: 'active',
      tags: [],
    });
  });

  afterAll(async () => {
    const { inArray } = await import('drizzle-orm');
    await ctx.db.delete(ctx.schema.workspaces).where(inArray(ctx.schema.workspaces.id, [ctx.wsA.id, ctx.wsB.id]));
    await ctx.db
      .delete(ctx.schema.users)
      .where(inArray(ctx.schema.users.id, [ctx.sessionA.userId, ctx.sessionB.userId]));
  });

  it('names nothing to someone who is not in the lab that holds the record', async () => {
    expect(await ctx.q.findLinkInMyOtherLabs(ctx.sessionB, `/projects/${projectA}`)).toBeNull();
  });

  it('names the lab when the reader is a member of it but looking at another', async () => {
    await ctx.db.insert(ctx.schema.workspaceMembers).values({ workspaceId: ctx.wsA.id, userId: ctx.sessionB.userId, role: 'member' });
    expect(await ctx.q.findLinkInMyOtherLabs(ctx.sessionB, `/projects/${projectA}/timeline`)).toEqual({
      workspaceId: ctx.wsA.id,
      workspaceName: 'Lab A',
    });
  });

  it('says nothing when the record is in the lab already open, or the link has no id', async () => {
    expect(await ctx.q.findLinkInMyOtherLabs(ctx.sessionA, `/projects/${projectA}`)).toBeNull();
    expect(await ctx.q.findLinkInMyOtherLabs(ctx.sessionB, '/projects/not-an-id')).toBeNull();
  });
});

suite('AI allowance and a lab\'s own key', () => {
  let ctx: Ctx;
  beforeAll(async () => {
    process.env.LABFLOW_ENCRYPTION_KEY = 'integration-test-key';
    ctx = await setup();
  });
  afterAll(async () => {
    const { inArray } = await import('drizzle-orm');
    await ctx.db.delete(ctx.schema.workspaces).where(inArray(ctx.schema.workspaces.id, [ctx.wsA.id, ctx.wsB.id]));
    await ctx.db
      .delete(ctx.schema.users)
      .where(inArray(ctx.schema.users.id, [ctx.sessionA.userId, ctx.sessionB.userId]));
    delete process.env.LABFLOW_ENCRYPTION_KEY;
  });

  it('counts every feature on the plan, but not requests on the lab\'s own key', async () => {
    await ctx.q.recordAiUse(ctx.sessionA, 'labbot', false);
    await ctx.q.recordAiUse(ctx.sessionA, 'fill_record', false);
    await ctx.q.recordAiUse(ctx.sessionA, 'revise', true);
    expect((await ctx.q.usageCounts(ctx.sessionA)).aiThisMonth).toBe(2);
    expect((await ctx.q.usageCounts(ctx.sessionB)).aiThisMonth).toBe(0);
  });

  it('stores the key encrypted, reads it back only for its own lab, and removes it', async () => {
    const key = 'sk-ant-api03-' + 'k'.repeat(40) + 'WXYZ';
    await ctx.q.setLabAiKey(ctx.sessionA, key);
    const [row] = await ctx.db
      .select({ enc: ctx.schema.workspaces.anthropicKeyEnc })
      .from(ctx.schema.workspaces)
      .where(ctx.eq(ctx.schema.workspaces.id, ctx.wsA.id));
    expect(row?.enc).not.toContain('sk-ant');
    expect(await ctx.q.getLabAiKey(ctx.sessionA)).toBe(key);
    expect(await ctx.q.labAiKeyStatus(ctx.sessionA)).toEqual({ hint: 'WXYZ', readable: true });
    expect(await ctx.q.getLabAiKey(ctx.sessionB)).toBeNull();
    await ctx.q.setLabAiKey(ctx.sessionA, null);
    expect(await ctx.q.getLabAiKey(ctx.sessionA)).toBeNull();
  });

  it('refuses a member changing the key', async () => {
    await expect(ctx.q.setLabAiKey({ ...ctx.sessionA, role: 'member' }, 'sk-ant-x')).rejects.toBeInstanceOf(
      ctx.q.MembershipRefusedError,
    );
  });
});

suite('billing notices are sent once', () => {
  let ctx: Ctx;
  beforeAll(async () => {
    ctx = await setup();
  });
  afterAll(async () => {
    const { inArray } = await import('drizzle-orm');
    await ctx.db.delete(ctx.schema.workspaces).where(inArray(ctx.schema.workspaces.id, [ctx.wsA.id, ctx.wsB.id]));
    await ctx.db
      .delete(ctx.schema.users)
      .where(inArray(ctx.schema.users.id, [ctx.sessionA.userId, ctx.sessionB.userId]));
  });

  it('claims a confirmation once per subscription and state', async () => {
    await ctx.q.applySubscriptionEvent({
      workspaceId: ctx.wsA.id,
      plan: 'lab',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      paypalSubscriptionId: 'I-TESTSUB0001',
      billingInterval: 'month',
    });
    expect(await ctx.q.claimBillingNotice(ctx.wsA.id, 'I-TESTSUB0001:active')).toBe(true);
    expect(await ctx.q.claimBillingNotice(ctx.wsA.id, 'I-TESTSUB0001:active')).toBe(false);
    expect(await ctx.q.claimBillingNotice(ctx.wsA.id, 'I-TESTSUB0001:canceled')).toBe(true);
    expect((await ctx.q.billingContacts(ctx.wsA.id)).map((c) => c.email)).toEqual([ctx.sessionA.userEmail]);
  });

  it('reminds a yearly plan once, a month before it renews, and never a monthly one', async () => {
    const soon = new Date(Date.now() + 30 * 86_400_000);
    await ctx.q.applySubscriptionEvent({
      workspaceId: ctx.wsB.id,
      plan: 'group',
      status: 'active',
      currentPeriodEnd: soon,
      paypalSubscriptionId: 'I-TESTSUB0002',
      billingInterval: 'year',
    });
    const first = (await ctx.q.claimDueRenewalReminders()).map((r) => r.workspaceId);
    expect(first).toContain(ctx.wsB.id);
    expect(first).not.toContain(ctx.wsA.id);
    expect((await ctx.q.claimDueRenewalReminders()).map((r) => r.workspaceId)).not.toContain(ctx.wsB.id);
  });
});
