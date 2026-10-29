import { and, count, desc, eq, gt, ilike, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/db';
import { normaliseEmail } from '@/lib/trial-eligibility';
import {
  activity,
  aiGenerations,
  aiUsage,
  datasetColumns as datasetColumnsTable,
  datasets,
  discussions,
  experimentConditions,
  experimentFiles,
  experimentNotes,
  experimentResults,
  experimentSamples,
  experiments,
  files,
  literatureRefs,
  projects,
  protocolVersions,
  processedStripeEvents,
  protocols,
  researchUpdates,
  samples,
  users,
  workspaceInvites,
  workspaceMembers,
  workspaceSubscriptions,
  workspaces,
  inventoryItems,
  inventoryLots,
  experimentLots,
  trialGrants,
  pilotFeedback,
  tasks,
  events,
  fileShares,
  chatReads,
  projectFiles,
  protocolFiles,
} from '@/db/schema';
import type { SessionContext } from './auth';
import { dmParticipants } from '@/lib/dm';
import { changedFields, excerpt } from '@/lib/activity';
import { experimentCode, experimentStatusLabel } from '@/lib/display';
import { InUseError, NotFoundInWorkspaceError, assertFound, assertId } from './not-found';
import { open as openSecret, seal } from '@/lib/secret-box';

/*
 * Every function here takes the caller's SessionContext and filters on
 * s.workspaceId. There is no "get by id" that skips that predicate, that is
 * what keeps one lab's records invisible to another.
 */

/* ── projects ───────────────────────────────────────────────────────────── */

export async function listProjects(s: SessionContext) {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      researchQuestion: projects.researchQuestion,
      status: projects.status,
      tags: projects.tags,
      isExample: projects.isExample,
      updatedAt: projects.updatedAt,
      experimentCount: sql<number>`(
        select count(*)::int from "experiments" e where e.project_id = projects.id
      )`,
    })
    .from(projects)
    .where(eq(projects.workspaceId, s.workspaceId))
    .orderBy(desc(projects.updatedAt));
}

export async function getProject(s: SessionContext, projectId: string) {
  assertId(projectId, 'Project');
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      researchQuestion: projects.researchQuestion,
      status: projects.status,
      tags: projects.tags,
      ownerId: projects.ownerId,
      ownerName: users.name,
      isExample: projects.isExample,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .leftJoin(users, eq(users.id, projects.ownerId))
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, s.workspaceId)))
    .limit(1);
  return assertFound(rows[0], 'Project');
}

export async function createProject(
  s: SessionContext,
  input: {
    name: string;
    description: string | null;
    researchQuestion: string | null;
    status: 'planning' | 'active' | 'on_hold' | 'completed' | 'archived';
    tags: string[];
  },
) {
  const rows = await db
    .insert(projects)
    .values({ ...input, workspaceId: s.workspaceId, ownerId: s.userId })
    .returning({ id: projects.id });
  const projectId = assertFound(rows[0], 'Project').id;
  await logActivity(s, { action: 'created', subjectType: 'project', subjectId: projectId, label: input.name, href: `/projects/${projectId}` });
  return projectId;
}

export async function updateProject(
  s: SessionContext,
  projectId: string,
  input: Partial<{
    name: string;
    description: string | null;
    researchQuestion: string | null;
    status: 'planning' | 'active' | 'on_hold' | 'completed' | 'archived';
    tags: string[];
  }>,
) {
  assertId(projectId, 'Project');
  const rows = await db
    .update(projects)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, s.workspaceId)))
    .returning({ id: projects.id });
  assertFound(rows[0], 'Project');
}

export async function deleteProject(s: SessionContext, projectId: string) {
  assertId(projectId, 'Project');
  const rows = await db
    .delete(projects)
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, s.workspaceId)))
    .returning({ id: projects.id, name: projects.name });
  const row = assertFound(rows[0], 'Project');
  await logActivity(s, { action: 'deleted', subjectType: 'project', subjectId: row.id, label: row.name, detail: 'with all its experiments' });
}

/* ── activity ───────────────────────────────────────────────────────────── */

type ActivityEntry = {
  action: 'created' | 'edited' | 'deleted' | 'added' | 'uploaded' | 'changed' | 'removed' | 'filed';
  subjectType: string;
  subjectId?: string | null;
  label: string;
  detail?: string | null;
  href?: string | null;
};

/** Edits by one person to one record within this window read as one entry. */
const EDIT_WINDOW_MS = 10 * 60 * 1000;
/** Edits this soon after creating a record are part of creating it. */
const CREATE_WINDOW_MS = 60 * 1000;

/**
 * Writes one line of the lab's activity log, in the same code path as the
 * change. A save touches several tables and a document saves as it is typed,
 * so repeated edits by the same person to the same record within ten minutes
 * fold into the latest entry, with the changed fields added to it.
 */
async function logActivity(s: SessionContext, entry: ActivityEntry) {
  if (entry.action === 'edited' && entry.subjectId) {
    const recent = await db
      .select({ id: activity.id, action: activity.action, detail: activity.detail, createdAt: activity.createdAt })
      .from(activity)
      .where(
        and(
          eq(activity.workspaceId, s.workspaceId),
          eq(activity.actorId, s.userId),
          eq(activity.subjectId, entry.subjectId),
          gt(activity.createdAt, new Date(Date.now() - EDIT_WINDOW_MS)),
        ),
      )
      .orderBy(desc(activity.createdAt))
      .limit(1);
    const last = recent[0];
    if (last?.action === 'created' && Date.now() - last.createdAt.getTime() < CREATE_WINDOW_MS) return;
    if (last?.action === 'edited') {
      const parts = new Set([...(last.detail ?? '').split(', '), ...(entry.detail ?? '').split(', ')].filter(Boolean));
      await db
        .update(activity)
        .set({ detail: [...parts].join(', ') || null, label: entry.label, createdAt: new Date() })
        .where(eq(activity.id, last.id));
      return;
    }
  }
  await db.insert(activity).values({
    workspaceId: s.workspaceId,
    actorId: s.userId,
    action: entry.action,
    subjectType: entry.subjectType,
    subjectId: entry.subjectId ?? null,
    label: entry.label,
    detail: entry.detail ?? null,
    href: entry.href ?? null,
  });
}

/**
 * The lab's activity, newest first: who put in or changed what. For whoever
 * runs the lab. Private files and direct messages are never logged, so this
 * shows nothing a member could not already open.
 */
export async function listActivity(
  s: SessionContext,
  opts: { actorId?: string; before?: Date; limit?: number } = {},
) {
  if (s.role === 'member') throw new MembershipRefusedError('Only owners and admins can see the activity log.');
  const where = [eq(activity.workspaceId, s.workspaceId)];
  if (opts.actorId && /^[0-9a-f-]{36}$/i.test(opts.actorId)) where.push(eq(activity.actorId, opts.actorId));
  if (opts.before) where.push(sql`${activity.createdAt} < ${opts.before}`);
  return db
    .select({
      id: activity.id,
      createdAt: activity.createdAt,
      actorId: activity.actorId,
      actorName: users.name,
      action: activity.action,
      subjectType: activity.subjectType,
      label: activity.label,
      detail: activity.detail,
      href: activity.href,
    })
    .from(activity)
    .leftJoin(users, eq(users.id, activity.actorId))
    .where(and(...where))
    .orderBy(desc(activity.createdAt))
    .limit(Math.min(opts.limit ?? 200, 5000));
}

const EXPERIMENT_FIELDS = {
  title: 'name',
  objective: 'objective',
  hypothesis: 'hypothesis',
  dataLocation: 'original data location',
  performedOn: 'date',
  status: 'status',
  protocolVersionId: 'protocol',
  protocolNotes: 'protocol deviations',
  repeatsExperimentId: 'repeat link',
} as const;

const RESULT_FIELDS = {
  summary: 'result summary',
  observations: 'observations',
  conclusion: 'conclusion',
  nextSteps: 'next steps',
} as const;

function experimentLabel(e: { number: number; title: string }) {
  return `${experimentCode(e.number)} ${e.title}`;
}

/* ── experiments ────────────────────────────────────────────────────────── */

export type ExperimentListRow = Awaited<ReturnType<typeof listExperiments>>[number];

export async function listExperiments(
  s: SessionContext,
  opts: { projectId?: string; limit?: number } = {},
) {
  const where = opts.projectId
    ? and(eq(experiments.workspaceId, s.workspaceId), eq(experiments.projectId, opts.projectId))
    : eq(experiments.workspaceId, s.workspaceId);

  const q = db
    .select({
      id: experiments.id,
      number: experiments.number,
      title: experiments.title,
      status: experiments.status,
      objective: experiments.objective,
      performedOn: experiments.performedOn,
      updatedAt: experiments.updatedAt,
      projectId: experiments.projectId,
      projectName: projects.name,
      researcherName: users.name,
      repeatsExperimentId: experiments.repeatsExperimentId,
      protocolName: protocols.name,
      protocolVersion: protocolVersions.version,
    })
    .from(experiments)
    .innerJoin(projects, eq(projects.id, experiments.projectId))
    .leftJoin(users, eq(users.id, experiments.researcherId))
    .leftJoin(protocolVersions, eq(protocolVersions.id, experiments.protocolVersionId))
    .leftJoin(protocols, eq(protocols.id, protocolVersions.protocolId))
    .where(where)
    .orderBy(desc(experiments.performedOn), desc(experiments.number));

  return opts.limit ? q.limit(opts.limit) : q;
}

/** Next free experiment number within a project (001, 002 …). */
export async function nextExperimentNumber(s: SessionContext, projectId: string) {
  assertId(projectId, 'Project');
  const rows = await db
    .select({ max: sql<number | null>`max(${experiments.number})` })
    .from(experiments)
    .where(and(eq(experiments.projectId, projectId), eq(experiments.workspaceId, s.workspaceId)));
  return (rows[0]?.max ?? 0) + 1;
}

export async function getExperiment(s: SessionContext, experimentId: string) {
  assertId(experimentId, 'Experiment');
  const rows = await db
    .select({
      id: experiments.id,
      number: experiments.number,
      title: experiments.title,
      status: experiments.status,
      objective: experiments.objective,
      hypothesis: experiments.hypothesis,
      dataLocation: experiments.dataLocation,
      performedOn: experiments.performedOn,
      protocolNotes: experiments.protocolNotes,
      protocolVersionId: experiments.protocolVersionId,
      protocolVersion: protocolVersions.version,
      protocolId: protocols.id,
      protocolName: protocols.name,
      repeatsExperimentId: experiments.repeatsExperimentId,
      researcherId: experiments.researcherId,
      researcherName: users.name,
      projectId: experiments.projectId,
      projectName: projects.name,
      projectIsExample: projects.isExample,
      researchQuestion: projects.researchQuestion,
      createdAt: experiments.createdAt,
      updatedAt: experiments.updatedAt,
    })
    .from(experiments)
    .innerJoin(projects, eq(projects.id, experiments.projectId))
    .leftJoin(users, eq(users.id, experiments.researcherId))
    .leftJoin(protocolVersions, eq(protocolVersions.id, experiments.protocolVersionId))
    .leftJoin(protocols, eq(protocols.id, protocolVersions.protocolId))
    .where(and(eq(experiments.id, experimentId), eq(experiments.workspaceId, s.workspaceId)))
    .limit(1);
  return assertFound(rows[0], 'Experiment');
}

/** Everything the detail page, the checker and the comparison view need. */
export async function getExperimentRecord(s: SessionContext, experimentId: string) {
  assertId(experimentId, 'Experiment');
  const experiment = await getExperiment(s, experimentId);
  const [conditions, attachedSamples, result, notes, attachedFiles, dataSets] = await Promise.all([
    db
      .select()
      .from(experimentConditions)
      .where(eq(experimentConditions.experimentId, experimentId))
      .orderBy(experimentConditions.position),
    db
      .select({ id: samples.id, code: samples.code, description: samples.description })
      .from(experimentSamples)
      .innerJoin(samples, eq(samples.id, experimentSamples.sampleId))
      .where(eq(experimentSamples.experimentId, experimentId))
      .orderBy(samples.code),
    db
      .select()
      .from(experimentResults)
      .where(eq(experimentResults.experimentId, experimentId))
      .limit(1),
    db
      .select({
        id: experimentNotes.id,
        body: experimentNotes.body,
        createdAt: experimentNotes.createdAt,
        authorId: experimentNotes.authorId,
        authorName: users.name,
      })
      .from(experimentNotes)
      .leftJoin(users, eq(users.id, experimentNotes.authorId))
      .where(eq(experimentNotes.experimentId, experimentId))
      .orderBy(desc(experimentNotes.createdAt)),
    db
      .select({
        id: files.id,
        filename: files.filename,
        contentType: files.contentType,
        byteSize: files.byteSize,
        sourceUrl: files.sourceUrl,
        provider: files.provider,
        driveFileId: files.driveFileId,
        driveSyncedAt: files.driveSyncedAt,
        createdAt: files.createdAt,
      })
      .from(experimentFiles)
      .innerJoin(files, eq(files.id, experimentFiles.fileId))
      .where(eq(experimentFiles.experimentId, experimentId))
      .orderBy(desc(files.createdAt)),
    db
      .select({ id: datasets.id, name: datasets.name, rowCount: datasets.rowCount })
      .from(datasets)
      .where(eq(datasets.experimentId, experimentId))
      .orderBy(desc(datasets.createdAt)),
  ]);

  return {
    experiment,
    conditions,
    samples: attachedSamples,
    result: result[0] ?? null,
    notes,
    files: attachedFiles,
    datasets: dataSets,
  };
}

export type ExperimentRecord = Awaited<ReturnType<typeof getExperimentRecord>>;

export async function createExperiment(
  s: SessionContext,
  projectId: string,
  input: {
    title: string;
    objective: string | null;
    hypothesis: string | null;
    dataLocation?: string | null;
    performedOn: Date | null;
    status: 'planned' | 'in_progress' | 'completed' | 'repeated' | 'needs_investigation';
    protocolVersionId: string | null;
    protocolNotes: string | null;
    repeatsExperimentId: string | null;
  },
) {
  assertId(projectId, 'Project');
  // Confirms the project is in the caller's workspace before anything is written.
  await getProject(s, projectId);
  const number = await nextExperimentNumber(s, projectId);
  const rows = await db
    .insert(experiments)
    .values({
      ...input,
      number,
      projectId,
      workspaceId: s.workspaceId,
      researcherId: s.userId,
    })
    .returning({ id: experiments.id });
  const experimentId = assertFound(rows[0], 'Experiment').id;
  await logActivity(s, {
    action: 'created',
    subjectType: 'experiment',
    subjectId: experimentId,
    label: experimentLabel({ number, title: input.title }),
    href: `/experiments/${experimentId}`,
  });
  return experimentId;
}

export async function updateExperiment(
  s: SessionContext,
  experimentId: string,
  input: Partial<{
    title: string;
    objective: string | null;
    hypothesis: string | null;
    dataLocation: string | null;
    performedOn: Date | null;
    status: 'planned' | 'in_progress' | 'completed' | 'repeated' | 'needs_investigation';
    protocolVersionId: string | null;
    protocolNotes: string | null;
    repeatsExperimentId: string | null;
  }>,
) {
  assertId(experimentId, 'Experiment');
  const before = await getExperiment(s, experimentId);
  const rows = await db
    .update(experiments)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(experiments.id, experimentId), eq(experiments.workspaceId, s.workspaceId)))
    .returning({ id: experiments.id });
  assertFound(rows[0], 'Experiment');
  const changed = changedFields(before, input, EXPERIMENT_FIELDS).map((field) =>
    field === 'status' && input.status
      ? `status ${experimentStatusLabel[before.status]} → ${experimentStatusLabel[input.status]}`
      : field,
  );
  if (changed.length > 0) {
    await logActivity(s, {
      action: 'edited',
      subjectType: 'experiment',
      subjectId: experimentId,
      label: experimentLabel({ number: before.number, title: input.title ?? before.title }),
      detail: changed.join(', '),
      href: `/experiments/${experimentId}`,
    });
  }
}

export async function deleteExperiment(s: SessionContext, experimentId: string) {
  assertId(experimentId, 'Experiment');
  const rows = await db
    .delete(experiments)
    .where(and(eq(experiments.id, experimentId), eq(experiments.workspaceId, s.workspaceId)))
    .returning({ id: experiments.id, number: experiments.number, title: experiments.title });
  const row = assertFound(rows[0], 'Experiment');
  await logActivity(s, { action: 'deleted', subjectType: 'experiment', subjectId: row.id, label: experimentLabel(row) });
}

export async function replaceConditions(
  s: SessionContext,
  experimentId: string,
  rows: { name: string; value: string; unit: string | null }[],
) {
  assertId(experimentId, 'Experiment');
  const experiment = await getExperiment(s, experimentId);
  const old = await db
    .select({ name: experimentConditions.name, value: experimentConditions.value, unit: experimentConditions.unit })
    .from(experimentConditions)
    .where(eq(experimentConditions.experimentId, experimentId))
    .orderBy(experimentConditions.position);
  await db.delete(experimentConditions).where(eq(experimentConditions.experimentId, experimentId));
  if (rows.length > 0) {
    await db
      .insert(experimentConditions)
      .values(rows.map((r, i) => ({ ...r, experimentId, position: i })));
  }
  const key = (list: { name: string; value: string; unit: string | null }[]) =>
    JSON.stringify(list.map((c) => [c.name, c.value, c.unit ?? '']));
  if (key(old) !== key(rows)) {
    await logActivity(s, {
      action: 'edited',
      subjectType: 'experiment',
      subjectId: experimentId,
      label: experimentLabel(experiment),
      detail: 'conditions',
      href: `/experiments/${experimentId}`,
    });
  }
}

export async function upsertResult(
  s: SessionContext,
  experimentId: string,
  input: {
    summary: string | null;
    observations: string | null;
    conclusion: string | null;
    nextSteps: string | null;
  },
) {
  assertId(experimentId, 'Experiment');
  const experiment = await getExperiment(s, experimentId);
  const previous = await db
    .select()
    .from(experimentResults)
    .where(eq(experimentResults.experimentId, experimentId))
    .limit(1);
  await db
    .insert(experimentResults)
    .values({ experimentId, ...input })
    .onConflictDoUpdate({
      target: experimentResults.experimentId,
      set: { ...input, updatedAt: new Date() },
    });
  const changed = changedFields(previous[0] ?? {}, input, RESULT_FIELDS);
  if (changed.length > 0) {
    await logActivity(s, {
      action: 'edited',
      subjectType: 'experiment',
      subjectId: experimentId,
      label: experimentLabel(experiment),
      detail: changed.join(', '),
      href: `/experiments/${experimentId}`,
    });
  }
}

export async function addNote(s: SessionContext, experimentId: string, body: string) {
  assertId(experimentId, 'Experiment');
  const experiment = await getExperiment(s, experimentId);
  await db.insert(experimentNotes).values({ experimentId, body, authorId: s.userId });
  await logActivity(s, {
    action: 'added',
    subjectType: 'note',
    subjectId: experimentId,
    label: experimentLabel(experiment),
    detail: excerpt(body),
    href: `/experiments/${experimentId}`,
  });
}

export async function deleteNote(s: SessionContext, experimentId: string, noteId: string) {
  assertId(experimentId, 'Experiment');
  const experiment = await getExperiment(s, experimentId);
  // A notebook entry is its author's. Anyone else in the lab can read it and
  // reply, but only the author, or whoever runs the lab, can take it back.
  const canModerate = s.role === 'owner' || s.role === 'admin';
  const removed = await db
    .delete(experimentNotes)
    .where(
      and(
        eq(experimentNotes.id, noteId),
        eq(experimentNotes.experimentId, experimentId),
        canModerate ? undefined : eq(experimentNotes.authorId, s.userId),
      ),
    )
    .returning({ body: experimentNotes.body });
  if (removed[0]) {
    // The deleted text is kept here on purpose: a lab record that can vanish
    // without trace is not a record.
    await logActivity(s, {
      action: 'deleted',
      subjectType: 'note',
      subjectId: experimentId,
      label: experimentLabel(experiment),
      detail: excerpt(removed[0].body, 500),
      href: `/experiments/${experimentId}`,
    });
  }
}

/* ── samples ────────────────────────────────────────────────────────────── */

export async function listSamples(s: SessionContext, opts: { projectId?: string } = {}) {
  const where = opts.projectId
    ? and(eq(samples.workspaceId, s.workspaceId), eq(samples.projectId, opts.projectId))
    : eq(samples.workspaceId, s.workspaceId);
  return db
    .select({
      id: samples.id,
      code: samples.code,
      description: samples.description,
      notes: samples.notes,
      projectId: samples.projectId,
      projectName: projects.name,
      parentSampleId: samples.parentSampleId,
      createdAt: samples.createdAt,
      experimentCount: sql<number>`(
        select count(*)::int from "experiment_samples" es where es.sample_id = samples.id
      )`,
    })
    .from(samples)
    .leftJoin(projects, eq(projects.id, samples.projectId))
    .where(where)
    .orderBy(samples.code);
}

export async function getSample(s: SessionContext, sampleId: string) {
  assertId(sampleId, 'Sample');
  const rows = await db
    .select()
    .from(samples)
    .where(and(eq(samples.id, sampleId), eq(samples.workspaceId, s.workspaceId)))
    .limit(1);
  return assertFound(rows[0], 'Sample');
}

export async function createSample(
  s: SessionContext,
  input: {
    code: string;
    description: string | null;
    notes: string | null;
    projectId: string | null;
    parentSampleId: string | null;
  },
) {
  const rows = await db
    .insert(samples)
    .values({ ...input, workspaceId: s.workspaceId })
    .onConflictDoNothing({ target: [samples.workspaceId, samples.code] })
    .returning({ id: samples.id });
  if (rows[0]) return rows[0].id;
  const existing = await db
    .select({ id: samples.id })
    .from(samples)
    .where(and(eq(samples.workspaceId, s.workspaceId), eq(samples.code, input.code)))
    .limit(1);
  return assertFound(existing[0], 'Sample').id;
}

/** Creates any sample codes that don't exist yet, then returns all their ids. */
export async function ensureSamples(
  s: SessionContext,
  codes: string[],
  projectId: string | null,
): Promise<string[]> {
  if (codes.length === 0) return [];
  await db
    .insert(samples)
    .values(codes.map((code) => ({ code, workspaceId: s.workspaceId, projectId })))
    .onConflictDoNothing({ target: [samples.workspaceId, samples.code] });
  const rows = await db
    .select({ id: samples.id })
    .from(samples)
    .where(and(eq(samples.workspaceId, s.workspaceId), inArray(samples.code, codes)));
  return rows.map((r) => r.id);
}

export async function setExperimentSamples(
  s: SessionContext,
  experimentId: string,
  sampleIds: string[],
) {
  assertId(experimentId, 'Experiment');
  const experiment = await getExperiment(s, experimentId);
  const old = await db
    .select({ id: experimentSamples.sampleId })
    .from(experimentSamples)
    .where(eq(experimentSamples.experimentId, experimentId));
  await db.delete(experimentSamples).where(eq(experimentSamples.experimentId, experimentId));
  if (sampleIds.length > 0) {
    await db
      .insert(experimentSamples)
      .values(sampleIds.map((sampleId) => ({ experimentId, sampleId })))
      .onConflictDoNothing();
  }
  const key = (ids: string[]) => [...new Set(ids)].sort().join(',');
  if (key(old.map((r) => r.id)) !== key(sampleIds)) {
    await logActivity(s, {
      action: 'edited',
      subjectType: 'experiment',
      subjectId: experimentId,
      label: experimentLabel(experiment),
      detail: 'samples',
      href: `/experiments/${experimentId}`,
    });
  }
}

export async function experimentsForSample(s: SessionContext, sampleId: string) {
  assertId(sampleId, 'Sample');
  return db
    .select({
      id: experiments.id,
      number: experiments.number,
      title: experiments.title,
      status: experiments.status,
      projectId: experiments.projectId,
      projectName: projects.name,
    })
    .from(experimentSamples)
    .innerJoin(experiments, eq(experiments.id, experimentSamples.experimentId))
    .innerJoin(projects, eq(projects.id, experiments.projectId))
    .where(
      and(eq(experimentSamples.sampleId, sampleId), eq(experiments.workspaceId, s.workspaceId)),
    )
    .orderBy(desc(experiments.number));
}

/* ── protocols ──────────────────────────────────────────────────────────── */

/** A protocol file only its uploader can open would leave the lab with a dead link. */
export class PrivateProtocolFileError extends Error {
  constructor() {
    super('This file is private. Share it with the lab first, so everyone following the protocol can open it.');
    this.name = 'PrivateProtocolFileError';
  }
}

export async function listProtocols(s: SessionContext, opts: { projectId?: string } = {}) {
  const where = opts.projectId
    ? and(
        eq(protocols.workspaceId, s.workspaceId),
        or(eq(protocols.projectId, opts.projectId), isNull(protocols.projectId)),
      )
    : eq(protocols.workspaceId, s.workspaceId);
  return db
    .select({
      id: protocols.id,
      name: protocols.name,
      description: protocols.description,
      projectId: protocols.projectId,
      projectName: projects.name,
      latestVersion: sql<number | null>`(
        select max(pv.version) from "protocol_versions" pv where pv.protocol_id = protocols.id
      )`,
    })
    .from(protocols)
    .leftJoin(projects, eq(projects.id, protocols.projectId))
    .where(where)
    .orderBy(protocols.name);
}

export async function getProtocolWithVersions(s: SessionContext, protocolId: string) {
  assertId(protocolId, 'Protocol');
  const rows = await db
    .select()
    .from(protocols)
    .where(and(eq(protocols.id, protocolId), eq(protocols.workspaceId, s.workspaceId)))
    .limit(1);
  const protocol = assertFound(rows[0], 'Protocol');
  const versions = await db
    .select({
      id: protocolVersions.id,
      version: protocolVersions.version,
      changeNote: protocolVersions.changeNote,
      body: protocolVersions.body,
      createdAt: protocolVersions.createdAt,
      authorName: users.name,
      fileId: files.id,
      filename: files.filename,
      fileIsDocument: files.isDocument,
    })
    .from(protocolVersions)
    .leftJoin(users, eq(users.id, protocolVersions.createdById))
    .leftJoin(files, and(eq(files.id, protocolVersions.fileId), eq(files.workspaceId, s.workspaceId)))
    .where(eq(protocolVersions.protocolId, protocolId))
    .orderBy(desc(protocolVersions.version));
  return { protocol, versions };
}

/** Protocol versions selectable from an experiment form, newest first. */
export async function listProtocolVersionOptions(s: SessionContext) {
  return db
    .select({
      id: protocolVersions.id,
      version: protocolVersions.version,
      protocolName: protocols.name,
    })
    .from(protocolVersions)
    .innerJoin(protocols, eq(protocols.id, protocolVersions.protocolId))
    .where(eq(protocols.workspaceId, s.workspaceId))
    .orderBy(protocols.name, desc(protocolVersions.version));
}

export async function createProtocol(
  s: SessionContext,
  input: {
    name: string;
    description: string | null;
    projectId: string | null;
    body: string | null;
    fileId?: string | null;
  },
) {
  if (input.fileId) {
    // Everyone who follows the protocol must be able to open it.
    const file = await getFileForDownload(s, input.fileId);
    if (file.private) throw new PrivateProtocolFileError();
  }
  const rows = await db
    .insert(protocols)
    .values({
      name: input.name,
      description: input.description,
      projectId: input.projectId,
      workspaceId: s.workspaceId,
    })
    .returning({ id: protocols.id });
  const protocolId = assertFound(rows[0], 'Protocol').id;
  await db.insert(protocolVersions).values({
    protocolId,
    version: 1,
    body: input.body,
    fileId: input.fileId ?? null,
    changeNote: 'Initial version',
    createdById: s.userId,
  });
  await logActivity(s, { action: 'created', subjectType: 'protocol', subjectId: protocolId, label: input.name, href: `/protocols/${protocolId}` });
  return protocolId;
}

export async function addProtocolVersion(
  s: SessionContext,
  protocolId: string,
  input: { body: string | null; changeNote: string; fileId?: string | null },
) {
  assertId(protocolId, 'Protocol');
  const { protocol, versions } = await getProtocolWithVersions(s, protocolId);
  if (input.fileId) {
    const file = await getFileForDownload(s, input.fileId);
    if (file.private) throw new PrivateProtocolFileError();
  }
  const next = (versions[0]?.version ?? 0) + 1;
  await db.insert(protocolVersions).values({
    protocolId,
    version: next,
    body: input.body,
    fileId: input.fileId ?? null,
    changeNote: input.changeNote,
    createdById: s.userId,
  });
  await logActivity(s, {
    action: 'added',
    subjectType: 'protocol version',
    subjectId: protocolId,
    label: `${protocol.name} v${next}`,
    detail: input.changeNote,
    href: `/protocols/${protocolId}`,
  });
  return next;
}

/* ── files ──────────────────────────────────────────────────────────────── */

/** A file only its uploader can open cannot belong to something the whole lab reads. */
export class PrivateFileError extends Error {
  constructor(where: string) {
    super(`This file is private. Share it with the lab first, so everyone working on the ${where} can open it.`);
    this.name = 'PrivateFileError';
  }
}

/** A file this person can see, refused when it is private to someone. */
async function sharedFile(s: SessionContext, fileId: string, where: string) {
  const file = await getFileForDownload(s, fileId);
  if (file.private) throw new PrivateFileError(where);
  return file;
}

/**
 * Files a project's folder: raw data, code, pictures, metadata, whatever
 * names the lab uses. Filing an already-filed file just moves its folder.
 */
export async function addFileToProject(s: SessionContext, projectId: string, fileId: string, folder: string | null) {
  const project = await getProject(s, projectId);
  const file = await sharedFile(s, fileId, 'project');
  const name = folder?.trim().slice(0, 80) || null;
  await db
    .insert(projectFiles)
    .values({ projectId: project.id, fileId: file.id, folder: name })
    .onConflictDoUpdate({ target: [projectFiles.projectId, projectFiles.fileId], set: { folder: name } });
  await logActivity(s, {
    action: 'filed',
    subjectType: 'file',
    subjectId: file.id,
    label: file.filename,
    detail: `in ${project.name}${name ? ` / ${name}` : ''}`,
    href: `/projects/${project.id}`,
  });
}

export async function removeFileFromProject(s: SessionContext, projectId: string, fileId: string) {
  const project = await getProject(s, projectId);
  assertId(fileId, 'File');
  await db.delete(projectFiles).where(and(eq(projectFiles.projectId, project.id), eq(projectFiles.fileId, fileId)));
}

/** A project's folder, as this person may see it, grouped by the folder names the lab chose. */
export async function listProjectFiles(s: SessionContext, projectId: string) {
  const project = await getProject(s, projectId);
  return db
    .select({
      id: files.id,
      filename: files.filename,
      folder: projectFiles.folder,
      byteSize: files.byteSize,
      sourceUrl: files.sourceUrl,
      isDocument: files.isDocument,
      createdAt: files.createdAt,
      uploadedById: files.uploadedById,
      uploaderName: users.name,
    })
    .from(projectFiles)
    .innerJoin(files, eq(files.id, projectFiles.fileId))
    .leftJoin(users, eq(users.id, files.uploadedById))
    .where(and(eq(projectFiles.projectId, project.id), fileVisibleTo(s)))
    .orderBy(sql`${projectFiles.folder} nulls first`, files.filename);
}

/** Everything that goes with a protocol, beyond the method itself. */
export async function addFileToProtocol(s: SessionContext, protocolId: string, fileId: string) {
  const { protocol } = await getProtocolWithVersions(s, protocolId);
  const file = await sharedFile(s, fileId, 'protocol');
  await db.insert(protocolFiles).values({ protocolId: protocol.id, fileId: file.id }).onConflictDoNothing();
  await logActivity(s, {
    action: 'filed',
    subjectType: 'file',
    subjectId: file.id,
    label: file.filename,
    detail: `with protocol ${protocol.name}`,
    href: `/protocols/${protocol.id}`,
  });
}

export async function removeFileFromProtocol(s: SessionContext, protocolId: string, fileId: string) {
  const { protocol } = await getProtocolWithVersions(s, protocolId);
  assertId(fileId, 'File');
  await db.delete(protocolFiles).where(and(eq(protocolFiles.protocolId, protocol.id), eq(protocolFiles.fileId, fileId)));
}

export async function listProtocolFiles(s: SessionContext, protocolId: string) {
  const { protocol } = await getProtocolWithVersions(s, protocolId);
  return db
    .select({
      id: files.id,
      filename: files.filename,
      byteSize: files.byteSize,
      sourceUrl: files.sourceUrl,
      isDocument: files.isDocument,
      contentType: files.contentType,
      createdAt: files.createdAt,
      uploadedById: files.uploadedById,
      uploaderName: users.name,
    })
    .from(protocolFiles)
    .innerJoin(files, eq(files.id, protocolFiles.fileId))
    .leftJoin(users, eq(users.id, files.uploadedById))
    .where(and(eq(protocolFiles.protocolId, protocol.id), fileVisibleTo(s)))
    .orderBy(files.filename);
}

/** Attaches a file already in the lab to a run, from Files. */
export async function addFileToExperiment(s: SessionContext, experimentId: string, fileId: string) {
  assertId(experimentId, 'Experiment');
  const experiment = await getExperiment(s, experimentId);
  const file = await sharedFile(s, fileId, 'experiment');
  await db.insert(experimentFiles).values({ experimentId, fileId: file.id }).onConflictDoNothing();
  await logActivity(s, {
    action: 'filed',
    subjectType: 'file',
    subjectId: file.id,
    label: file.filename,
    detail: `on ${experimentLabel(experiment)}`,
    href: `/experiments/${experimentId}`,
  });
}

/** Where each shared file has been filed, for the Files page: projects and protocols. */
export async function fileHomes(s: SessionContext) {
  const [inProjects, inProtocols] = await Promise.all([
    db
      .select({ fileId: projectFiles.fileId, id: projects.id, name: projects.name, folder: projectFiles.folder })
      .from(projectFiles)
      .innerJoin(projects, eq(projects.id, projectFiles.projectId))
      .where(eq(projects.workspaceId, s.workspaceId)),
    db
      .select({ fileId: protocolFiles.fileId, id: protocols.id, name: protocols.name })
      .from(protocolFiles)
      .innerJoin(protocols, eq(protocols.id, protocolFiles.protocolId))
      .where(eq(protocols.workspaceId, s.workspaceId)),
  ]);
  const homes = new Map<string, { href: string; label: string }[]>();
  const add = (fileId: string, home: { href: string; label: string }) =>
    homes.set(fileId, [...(homes.get(fileId) ?? []), home]);
  for (const r of inProjects) add(r.fileId, { href: `/projects/${r.id}`, label: r.folder ? `${r.name} / ${r.folder}` : r.name });
  for (const r of inProtocols) add(r.fileId, { href: `/protocols/${r.id}`, label: `Protocol: ${r.name}` });
  return homes;
}

/** Shared lab files that could be a protocol version: PDFs, Word files, Labquill documents. */
export async function listProtocolFileOptions(s: SessionContext) {
  return db
    .select({ id: files.id, filename: files.filename })
    .from(files)
    .where(
      and(
        eq(files.workspaceId, s.workspaceId),
        eq(files.private, false),
        or(eq(files.isDocument, true), sql`${files.filename} ~* '\\.(pdf|docx?|odt|rtf)$'`),
      ),
    )
    .orderBy(desc(files.createdAt))
    .limit(50);
}

/**
 * The files this person may see: everything shared with the lab, plus their
 * own private ones. Every query that reads files goes through this, because a
 * private file that leaks through search or a download link is not private.
 */
function fileVisibleTo(s: SessionContext) {
  return and(
    eq(files.workspaceId, s.workspaceId),
    or(
      eq(files.private, false),
      eq(files.uploadedById, s.userId),
      sql`exists (select 1 from ${fileShares} where ${fileShares.fileId} = ${files.id} and ${fileShares.userId} = ${s.userId})`,
    ),
  );
}

/** Which of these people are in this lab. Anyone else is dropped, never trusted. */
export async function labMembersAmong(s: SessionContext, userIds: string[]): Promise<string[]> {
  const ids = [...new Set(userIds)].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, s.workspaceId), inArray(workspaceMembers.userId, ids)));
  return rows.map((r) => r.id);
}

/**
 * Who may see a file: the whole lab, only the uploader, or the uploader plus
 * chosen people. Only the uploader can change it.
 */
export async function setFileSharing(
  s: SessionContext,
  fileId: string,
  sharing: { everyone: true } | { everyone: false; userIds: string[] },
): Promise<string[]> {
  assertId(fileId, 'File');
  const owned = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.workspaceId, s.workspaceId), eq(files.uploadedById, s.userId)))
    .limit(1);
  if (!owned[0]) throw new NotFoundInWorkspaceError('File');

  const people = sharing.everyone ? [] : (await labMembersAmong(s, sharing.userIds)).filter((id) => id !== s.userId);
  await db.transaction(async (tx) => {
    await tx.update(files).set({ private: !sharing.everyone }).where(eq(files.id, fileId));
    await tx.delete(fileShares).where(eq(fileShares.fileId, fileId));
    if (people.length > 0) {
      await tx.insert(fileShares).values(people.map((userId) => ({ fileId, userId })));
    }
  });
  return people;
}

/** For each of these files, the people it was shared with. */
export async function fileShareNames(
  s: SessionContext,
  fileIds: string[],
): Promise<Map<string, { id: string; name: string }[]>> {
  const out = new Map<string, { id: string; name: string }[]>();
  if (fileIds.length === 0) return out;
  const rows = await db
    .select({ fileId: fileShares.fileId, userId: fileShares.userId, name: users.name })
    .from(fileShares)
    .innerJoin(files, eq(files.id, fileShares.fileId))
    .innerJoin(users, eq(users.id, fileShares.userId))
    .where(and(eq(files.workspaceId, s.workspaceId), inArray(fileShares.fileId, fileIds)));
  for (const r of rows) out.set(r.fileId, [...(out.get(r.fileId) ?? []), { id: r.userId, name: r.name ?? 'Someone' }]);
  return out;
}

/** Whether every one of these people may open this file. */
async function fileOpenToAll(fileId: string, userIds: string[]): Promise<boolean> {
  const rows = await db
    .select({ private: files.private, uploadedById: files.uploadedById })
    .from(files)
    .where(eq(files.id, fileId))
    .limit(1);
  const file = rows[0];
  if (!file) return false;
  if (!file.private) return true;
  const shared = await db
    .select({ userId: fileShares.userId })
    .from(fileShares)
    .where(eq(fileShares.fileId, fileId));
  const allowed = new Set([file.uploadedById, ...shared.map((r) => r.userId)]);
  return userIds.every((id) => allowed.has(id));
}

export async function recordFile(
  s: SessionContext,
  input: {
    filename: string;
    contentType: string;
    byteSize: number;
    storageKey: string;
    private?: boolean;
    isDocument?: boolean;
    /** Set when the bytes are a copy of a Google Sheet. */
    driveFileId?: string | null;
  },
) {
  const rows = await db
    .insert(files)
    .values({
      ...input,
      ...(input.driveFileId ? { driveSyncedAt: new Date() } : {}),
      workspaceId: s.workspaceId,
      uploadedById: s.userId,
      ...(input.isDocument ? { updatedAt: new Date(), updatedById: s.userId } : {}),
    })
    .returning({ id: files.id });
  const fileId = assertFound(rows[0], 'File').id;
  // Private files stay out of the log: it must show nothing a member could not open.
  if (!input.private) {
    await logActivity(s, {
      action: input.isDocument ? 'created' : 'uploaded',
      subjectType: input.isDocument ? 'document' : 'file',
      subjectId: fileId,
      label: input.isDocument ? input.filename.replace(/\.md$/i, '') : input.filename,
      href: input.isDocument ? `/docs/${fileId}` : '/files',
    });
  }
  return fileId;
}

/* ── direct messages ────────────────────────────────────────────────────── */

/**
 * The direct conversations this person is in, newest first, each with
 * whether something arrived since they last looked.
 */
export async function listDmThreads(s: SessionContext) {
  const rows = await db
    .select({
      dmKey: discussions.dmKey,
      lastAt: sql<Date>`max(${discussions.createdAt})`,
      lastFromOthersAt: sql<Date | null>`max(case when ${discussions.authorId} <> ${s.userId} then ${discussions.createdAt} end)`,
    })
    .from(discussions)
    .where(
      and(
        eq(discussions.workspaceId, s.workspaceId),
        sql`${discussions.dmKey} is not null`,
        sql`position(${s.userId} in ${discussions.dmKey}) > 0`,
      ),
    )
    .groupBy(discussions.dmKey)
    .orderBy(sql`max(${discussions.createdAt}) desc`);

  const reads = await db
    .select({ channel: chatReads.channel, lastReadAt: chatReads.lastReadAt })
    .from(chatReads)
    .where(and(eq(chatReads.userId, s.userId), eq(chatReads.workspaceId, s.workspaceId)));
  const readAt = new Map(reads.map((r) => [r.channel, new Date(r.lastReadAt).getTime()]));

  return rows
    .filter((r) => r.dmKey && dmParticipants(r.dmKey)?.includes(s.userId))
    .map((r) => {
      const key = r.dmKey!;
      const last = r.lastFromOthersAt ? new Date(r.lastFromOthersAt).getTime() : 0;
      return { dmKey: key, lastAt: new Date(r.lastAt), unread: last > (readAt.get(`dm:${key}`) ?? 0) };
    });
}

/** Marks a conversation read up to now. */
export async function markChannelRead(s: SessionContext, channel: string): Promise<void> {
  await db
    .insert(chatReads)
    .values({ userId: s.userId, workspaceId: s.workspaceId, channel, lastReadAt: new Date() })
    .onConflictDoUpdate({
      target: [chatReads.userId, chatReads.workspaceId, chatReads.channel],
      set: { lastReadAt: new Date() },
    });
}

export async function attachFileToExperiment(
  s: SessionContext,
  experimentId: string,
  fileId: string,
) {
  assertId(experimentId, 'Experiment');
  await getExperiment(s, experimentId);
  await db.insert(experimentFiles).values({ experimentId, fileId }).onConflictDoNothing();
}

export async function getFileForDownload(s: SessionContext, fileId: string) {
  assertId(fileId, 'File');
  const rows = await db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), fileVisibleTo(s)))
    .limit(1);
  return assertFound(rows[0], 'File');
}

/* ── documents ──────────────────────────────────────────────────────────── */

/** Someone saved the document after this copy was opened. */
export class DocumentConflictError extends Error {
  constructor(readonly byName: string | null) {
    super(
      `${byName ?? 'Someone'} saved this document while you were editing it. Copy your changes, reload to see theirs, then add yours back.`,
    );
    this.name = 'DocumentConflictError';
  }
}

/** A document this person can open, with who last changed it. */
export async function getDocument(s: SessionContext, fileId: string) {
  assertId(fileId, 'Document');
  const editor = alias(users, 'document_editor');
  const rows = await db
    .select({
      id: files.id,
      filename: files.filename,
      storageKey: files.storageKey,
      byteSize: files.byteSize,
      private: files.private,
      uploadedById: files.uploadedById,
      createdAt: files.createdAt,
      updatedAt: files.updatedAt,
      updatedByName: editor.name,
    })
    .from(files)
    .leftJoin(editor, eq(editor.id, files.updatedById))
    .where(and(eq(files.id, fileId), eq(files.isDocument, true), fileVisibleTo(s)))
    .limit(1);
  return assertFound(rows[0], 'Document');
}

/**
 * Points a document at a newly stored version, if nobody saved in between.
 *
 * `baseUpdatedAt` is the version the editor opened. When the stored one is
 * newer, saving would silently throw away a colleague's work, so it is refused
 * and they are named instead. Returns the storage key of the version replaced,
 * for the caller to delete.
 */
export async function saveDocumentVersion(
  s: SessionContext,
  fileId: string,
  input: { filename: string; storageKey: string; byteSize: number; baseUpdatedAt: string | null },
): Promise<{ replacedKey: string | null; updatedAt: Date }> {
  const current = await getDocument(s, fileId);
  const stamp = (d: Date | null) => (d ? d.toISOString() : null);
  if (stamp(current.updatedAt) !== input.baseUpdatedAt) {
    throw new DocumentConflictError(current.updatedByName);
  }
  const now = new Date();
  const rows = await db
    .update(files)
    .set({
      filename: input.filename,
      storageKey: input.storageKey,
      byteSize: input.byteSize,
      updatedAt: now,
      updatedById: s.userId,
    })
    .where(
      and(
        eq(files.id, fileId),
        eq(files.workspaceId, s.workspaceId),
        current.updatedAt ? eq(files.updatedAt, current.updatedAt) : isNull(files.updatedAt),
      ),
    )
    .returning({ id: files.id });
  if (rows.length === 0) throw new DocumentConflictError(null);
  if (!current.private) {
    await logActivity(s, {
      action: 'edited',
      subjectType: 'document',
      subjectId: fileId,
      label: input.filename.replace(/\.md$/i, ''),
      href: `/docs/${fileId}`,
    });
  }
  return { replacedKey: current.storageKey, updatedAt: now };
}

/* ── datasets ───────────────────────────────────────────────────────────── */

/* ── linked Google Sheets ───────────────────────────────────────────────── */

/** A file that is a copy of a Google Sheet, if this person can see it. */
export async function getLinkedSheet(s: SessionContext, fileId: string) {
  assertId(fileId, 'File');
  const rows = await db
    .select({ id: files.id, filename: files.filename, storageKey: files.storageKey, driveFileId: files.driveFileId })
    .from(files)
    .where(and(eq(files.id, fileId), fileVisibleTo(s)));
  const row = assertFound(rows[0], 'File');
  if (!row.driveFileId || !row.storageKey) throw new NotFoundInWorkspaceError('That file is not linked to a Google Sheet.');
  return { ...row, driveFileId: row.driveFileId, storageKey: row.storageKey };
}

/** Points a linked Sheet's file at freshly copied bytes, and its datasets at the new table. */
export async function replaceLinkedSheet(
  s: SessionContext,
  fileId: string,
  input: { storageKey: string; byteSize: number; table: DatasetTable | null },
): Promise<number> {
  const now = new Date();
  const label = await db.transaction(async (tx) => {
    const updated = await tx
      .update(files)
      .set({ storageKey: input.storageKey, byteSize: input.byteSize, driveSyncedAt: now, updatedAt: now, updatedById: s.userId })
      .where(and(eq(files.id, fileId), eq(files.workspaceId, s.workspaceId)))
      .returning({ filename: files.filename });
    const row = assertFound(updated[0], 'File');
    if (input.table) {
      const table = input.table;
      const sets = await tx
        .select({ id: datasets.id })
        .from(datasets)
        .where(and(eq(datasets.fileId, fileId), eq(datasets.workspaceId, s.workspaceId)));
      for (const { id: datasetId } of sets) {
        await tx.update(datasets).set({ rows: table.rows, rowCount: table.rows.length, updatedAt: now }).where(eq(datasets.id, datasetId));
        await tx.delete(datasetColumnsTable).where(eq(datasetColumnsTable.datasetId, datasetId));
        if (table.columns.length > 0) {
          await tx.insert(datasetColumnsTable).values(table.columns.map((c, i) => ({ ...c, datasetId, position: i })));
        }
      }
    }
    return row.filename;
  });
  const refreshed = input.table
    ? (await db.select({ n: count() }).from(datasets).where(eq(datasets.fileId, fileId)))[0]?.n ?? 0
    : 0;
  await logActivity(s, { action: 'changed', subjectType: 'file', subjectId: fileId, label, detail: 'refreshed from Google Sheets', href: '/files' });
  return refreshed;
}

type DatasetTable = {
  rows: Record<string, string>[];
  columns: {
    name: string;
    isNumeric: boolean;
    stats: { count: number; missing: number; min?: number; max?: number; mean?: number; stdDev?: number } | null;
  }[];
};

export async function createDataset(
  s: SessionContext,
  experimentId: string,
  input: {
    name: string;
    fileId: string | null;
    rows: Record<string, string>[];
    columns: {
      name: string;
      isNumeric: boolean;
      stats: {
        count: number;
        missing: number;
        min?: number;
        max?: number;
        mean?: number;
        stdDev?: number;
      } | null;
    }[];
  },
) {
  assertId(experimentId, 'Experiment');
  await getExperiment(s, experimentId);
  const inserted = await db
    .insert(datasets)
    .values({
      workspaceId: s.workspaceId,
      experimentId,
      fileId: input.fileId,
      name: input.name,
      rowCount: input.rows.length,
      rows: input.rows,
    })
    .returning({ id: datasets.id });
  const datasetId = assertFound(inserted[0], 'Dataset').id;
  if (input.columns.length > 0) {
    await db
      .insert(datasetColumnsTable)
      .values(input.columns.map((c, i) => ({ ...c, datasetId, position: i })));
  }
  return datasetId;
}

export async function getDataset(s: SessionContext, datasetId: string) {
  assertId(datasetId, 'Dataset');
  const rows = await db
    .select()
    .from(datasets)
    .where(and(eq(datasets.id, datasetId), eq(datasets.workspaceId, s.workspaceId)))
    .limit(1);
  const dataset = assertFound(rows[0], 'Dataset');
  const columns = await db
    .select()
    .from(datasetColumnsTable)
    .where(eq(datasetColumnsTable.datasetId, datasetId))
    .orderBy(datasetColumnsTable.position);
  return { dataset, columns };
}

/* ── people ─────────────────────────────────────────────────────────────── */

export async function listWorkspaceMembers(s: SessionContext) {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.createdAt,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, s.workspaceId))
    .orderBy(workspaceMembers.createdAt);
}

/**
 * One row per person for whoever runs the lab: what they recorded this week
 * and when they last put anything in. Worked out from the records themselves,
 * so it is right from the first day and not only once the activity log has
 * history. Private files are never counted.
 */
export async function labPulse(s: SessionContext) {
  if (s.role === 'member') throw new MembershipRefusedError('Only owners and admins can see this.');
  const ws = s.workspaceId;
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: workspaceMembers.role,
      runsThisWeek: sql<number>`(
        select count(*)::int from "experiments" e
        where e.workspace_id = ${ws} and e.researcher_id = ${users.id} and e.updated_at > ${weekAgo}
      )`,
      notesThisWeek: sql<number>`(
        select count(*)::int from "experiment_notes" n join "experiments" e on e.id = n.experiment_id
        where e.workspace_id = ${ws} and n.author_id = ${users.id} and n.created_at > ${weekAgo}
      )`,
      lastActive: sql<Date | null>`greatest(
        (select max(e.updated_at) from "experiments" e where e.workspace_id = ${ws} and e.researcher_id = ${users.id}),
        (select max(n.created_at) from "experiment_notes" n join "experiments" e on e.id = n.experiment_id
          where e.workspace_id = ${ws} and n.author_id = ${users.id}),
        (select max(f.created_at) from "files" f where f.workspace_id = ${ws} and f.uploaded_by_id = ${users.id} and not f.private),
        (select max(a.created_at) from "activity" a where a.workspace_id = ${ws} and a.actor_id = ${users.id})
      )`.mapWith((value: string | Date | null) => (value ? new Date(value) : null)),
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, ws))
    .orderBy(workspaceMembers.createdAt);
}

/** A change to who is in the lab that would leave it without an owner, or is not yours to make. */
export class MembershipRefusedError extends Error {}

type Role = 'owner' | 'admin' | 'member';

async function ownerCount(workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, 'owner')));
  return Number(row?.n ?? 0);
}

async function memberRole(workspaceId: string, userId: string): Promise<Role | null> {
  assertId(userId, 'Person');
  const [row] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return (row?.role as Role | undefined) ?? null;
}

/**
 * Changes someone's role. Only an owner may, and a lab always keeps at least
 * one owner: the last one cannot be demoted, by themselves or anyone else.
 */
export async function setMemberRole(s: SessionContext, userId: string, role: Role): Promise<void> {
  if (s.role !== 'owner') throw new MembershipRefusedError('Only an owner can change what people can do.');
  const current = await memberRole(s.workspaceId, userId);
  if (!current) throw new MembershipRefusedError('That person is not in this lab.');
  if (current === 'owner' && role !== 'owner' && (await ownerCount(s.workspaceId)) <= 1) {
    throw new MembershipRefusedError('A lab needs at least one owner. Make someone else an owner first.');
  }
  await db
    .update(workspaceMembers)
    .set({ role })
    .where(and(eq(workspaceMembers.workspaceId, s.workspaceId), eq(workspaceMembers.userId, userId)));
  if (current !== role) {
    await logActivity(s, {
      action: 'changed',
      subjectType: 'role',
      subjectId: userId,
      label: await personName(userId),
      detail: `${current} → ${role}`,
      href: '/team',
    });
  }
}

async function personName(userId: string): Promise<string> {
  const rows = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return rows[0]?.name ?? rows[0]?.email ?? 'Someone';
}

/**
 * Takes someone out of the lab. Owners may remove anyone but another owner's
 * last seat; admins may remove members. What they recorded stays: the lab's
 * records belong to the lab.
 */
export async function removeMember(s: SessionContext, userId: string): Promise<void> {
  if (userId === s.userId) throw new MembershipRefusedError('Use "Leave this lab" to remove yourself.');
  const target = await memberRole(s.workspaceId, userId);
  if (!target) throw new MembershipRefusedError('That person is not in this lab.');
  const allowed = s.role === 'owner' || (s.role === 'admin' && target === 'member');
  if (!allowed) throw new MembershipRefusedError('You cannot remove this person.');
  await db
    .delete(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, s.workspaceId), eq(workspaceMembers.userId, userId)));
  await logActivity(s, { action: 'removed', subjectType: 'person', subjectId: userId, label: await personName(userId), detail: `was ${target}` });
}

/** Leaves the current lab, unless that would leave it with nobody in charge. */
export async function leaveWorkspace(s: SessionContext): Promise<void> {
  if (s.role === 'owner' && (await ownerCount(s.workspaceId)) <= 1) {
    const [row] = await db
      .select({ n: count() })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, s.workspaceId));
    if (Number(row?.n ?? 0) > 1) {
      throw new MembershipRefusedError('You are the only owner. Make someone else an owner first, or delete the lab.');
    }
    throw new MembershipRefusedError('You are the only person in this lab. Delete it instead of leaving.');
  }
  await db
    .delete(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, s.workspaceId), eq(workspaceMembers.userId, s.userId)));
}

/**
 * Deletes the whole lab and everything in it. Owner only. Every table hangs
 * off the workspace with ON DELETE CASCADE, so one delete removes the records;
 * the caller removes the stored file bytes, which live outside the database's
 * foreign keys.
 */
export async function deleteWorkspace(s: SessionContext, confirmName: string): Promise<void> {
  if (s.role !== 'owner') throw new MembershipRefusedError('Only an owner can delete the lab.');
  if (confirmName.trim() !== s.workspaceName.trim()) {
    throw new MembershipRefusedError(`Type the lab's name exactly (${s.workspaceName}) to confirm.`);
  }
  await db.delete(workspaces).where(eq(workspaces.id, s.workspaceId));
}

/* ── search ─────────────────────────────────────────────────────────────── */

export type SearchResult = {
  type: 'project' | 'experiment' | 'sample' | 'protocol' | 'note' | 'file';
  id: string;
  href: string;
  title: string;
  context: string | null;
};

/**
 * Substring search across the record. ILIKE is honest and fast enough at this
 * scale; Postgres full-text search is the next step once a lab has thousands
 * of experiments, and needs a tsvector column rather than a bigger query here.
 */
export async function search(s: SessionContext, rawQuery: string): Promise<SearchResult[]> {
  const q = rawQuery.trim();
  if (q.length < 2) return [];
  const terms = q.split(/\s+/).slice(0, 5).map((t) => `%${t}%`);
  const allTerms = <T extends Parameters<typeof ilike>[0]>(col: T) =>
    and(...terms.map((t) => ilike(col, t)));

  const [projectRows, experimentRows, sampleRows, protocolRows, noteRows, fileRows] =
    await Promise.all([
      db
        .select({ id: projects.id, name: projects.name, description: projects.description })
        .from(projects)
        .where(
          and(
            eq(projects.workspaceId, s.workspaceId),
            or(
              allTerms(projects.name),
              allTerms(projects.description),
              allTerms(projects.researchQuestion),
            ),
          ),
        )
        .limit(10),
      db
        .select({
          id: experiments.id,
          number: experiments.number,
          title: experiments.title,
          objective: experiments.objective,
          projectName: projects.name,
        })
        .from(experiments)
        .innerJoin(projects, eq(projects.id, experiments.projectId))
        .where(
          and(
            eq(experiments.workspaceId, s.workspaceId),
            or(
              allTerms(experiments.title),
              allTerms(experiments.objective),
              allTerms(experiments.hypothesis),
              allTerms(experiments.protocolNotes),
            ),
          ),
        )
        .limit(20),
      db
        .select({ id: samples.id, code: samples.code, description: samples.description })
        .from(samples)
        .where(
          and(
            eq(samples.workspaceId, s.workspaceId),
            or(allTerms(samples.code), allTerms(samples.description), allTerms(samples.notes)),
          ),
        )
        .limit(10),
      db
        .select({ id: protocols.id, name: protocols.name, description: protocols.description })
        .from(protocols)
        .where(
          and(
            eq(protocols.workspaceId, s.workspaceId),
            or(allTerms(protocols.name), allTerms(protocols.description)),
          ),
        )
        .limit(10),
      db
        .select({
          id: experimentNotes.id,
          body: experimentNotes.body,
          experimentId: experimentNotes.experimentId,
          number: experiments.number,
          title: experiments.title,
        })
        .from(experimentNotes)
        .innerJoin(experiments, eq(experiments.id, experimentNotes.experimentId))
        .where(and(eq(experiments.workspaceId, s.workspaceId), allTerms(experimentNotes.body)))
        .limit(10),
      db
        .select({ id: files.id, filename: files.filename, isDocument: files.isDocument })
        .from(files)
        .where(and(fileVisibleTo(s), allTerms(files.filename)))
        .limit(10),
    ]);

  return [
    ...experimentRows.map((r): SearchResult => ({
      type: 'experiment',
      id: r.id,
      href: `/experiments/${r.id}`,
      title: `${formatNumber(r.number)} · ${r.title}`,
      context: r.objective ?? r.projectName,
    })),
    ...projectRows.map((r): SearchResult => ({
      type: 'project',
      id: r.id,
      href: `/projects/${r.id}`,
      title: r.name,
      context: r.description,
    })),
    ...sampleRows.map((r): SearchResult => ({
      type: 'sample',
      id: r.id,
      href: `/samples/${r.id}`,
      title: r.code,
      context: r.description,
    })),
    ...protocolRows.map((r): SearchResult => ({
      type: 'protocol',
      id: r.id,
      href: `/protocols/${r.id}`,
      title: r.name,
      context: r.description,
    })),
    ...noteRows.map((r): SearchResult => ({
      type: 'note',
      id: r.id,
      href: `/experiments/${r.experimentId}`,
      title: `Note on ${formatNumber(r.number)} · ${r.title}`,
      context: r.body.slice(0, 160),
    })),
    ...fileRows.map((r): SearchResult => ({
      type: 'file',
      id: r.id,
      href: r.isDocument ? `/docs/${r.id}` : `/api/files/${r.id}`,
      title: r.isDocument ? r.filename.replace(/\.md$/i, '') : r.filename,
      context: null,
    })),
  ];
}

function formatNumber(n: number) {
  return `EXP-${String(n).padStart(3, '0')}`;
}

/* ── dashboard ──────────────────────────────────────────────────────────── */

export async function dashboardData(s: SessionContext) {
  const [projectRows, recent, planned, needsAttention, counts] = await Promise.all([
    listProjects(s),
    listExperiments(s, { limit: 6 }),
    db
      .select({
        id: experiments.id,
        number: experiments.number,
        title: experiments.title,
        performedOn: experiments.performedOn,
        projectName: projects.name,
      })
      .from(experiments)
      .innerJoin(projects, eq(projects.id, experiments.projectId))
      .where(and(eq(experiments.workspaceId, s.workspaceId), eq(experiments.status, 'planned')))
      .orderBy(experiments.performedOn)
      .limit(5),
    db
      .select({
        id: experiments.id,
        number: experiments.number,
        title: experiments.title,
        status: experiments.status,
        projectName: projects.name,
      })
      .from(experiments)
      .innerJoin(projects, eq(projects.id, experiments.projectId))
      .where(
        and(
          eq(experiments.workspaceId, s.workspaceId),
          eq(experiments.status, 'needs_investigation'),
        ),
      )
      .orderBy(desc(experiments.updatedAt))
      .limit(5),
    db
      .select({ experiments: count() })
      .from(experiments)
      .where(eq(experiments.workspaceId, s.workspaceId)),
  ]);

  // Completed experiments with no recorded conclusion, the documentation gap
  // that costs the most later.
  const undocumented = await db
    .select({
      id: experiments.id,
      number: experiments.number,
      title: experiments.title,
      projectName: projects.name,
    })
    .from(experiments)
    .innerJoin(projects, eq(projects.id, experiments.projectId))
    .leftJoin(experimentResults, eq(experimentResults.experimentId, experiments.id))
    .where(
      and(
        eq(experiments.workspaceId, s.workspaceId),
        eq(experiments.status, 'completed'),
        or(isNull(experimentResults.id), isNull(experimentResults.conclusion)),
      ),
    )
    .orderBy(desc(experiments.updatedAt))
    .limit(5);

  return {
    projects: projectRows,
    recent,
    planned,
    needsAttention,
    undocumented,
    experimentCount: counts[0]?.experiments ?? 0,
  };
}

/* ── comparison ─────────────────────────────────────────────────────────── */

/**
 * Loads the full comparable shape for a set of experiments, in the order the
 * caller asked for. Ids outside the workspace simply drop out.
 */
export async function getComparableExperiments(s: SessionContext, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      id: experiments.id,
      number: experiments.number,
      title: experiments.title,
      status: experiments.status,
      projectId: experiments.projectId,
      performedOn: experiments.performedOn,
      researcherName: users.name,
      objective: experiments.objective,
      hypothesis: experiments.hypothesis,
      protocolName: protocols.name,
      protocolVersion: protocolVersions.version,
      summary: experimentResults.summary,
      observations: experimentResults.observations,
      conclusion: experimentResults.conclusion,
      nextSteps: experimentResults.nextSteps,
    })
    .from(experiments)
    .leftJoin(users, eq(users.id, experiments.researcherId))
    .leftJoin(protocolVersions, eq(protocolVersions.id, experiments.protocolVersionId))
    .leftJoin(protocols, eq(protocols.id, protocolVersions.protocolId))
    .leftJoin(experimentResults, eq(experimentResults.experimentId, experiments.id))
    .where(and(eq(experiments.workspaceId, s.workspaceId), inArray(experiments.id, ids)));

  const [conditionRows, sampleRows, lotRows] = await Promise.all([
    db
      .select({
        experimentId: experimentConditions.experimentId,
        name: experimentConditions.name,
        value: experimentConditions.value,
        unit: experimentConditions.unit,
      })
      .from(experimentConditions)
      .where(inArray(experimentConditions.experimentId, rows.map((r) => r.id))),
    db
      .select({ experimentId: experimentSamples.experimentId, code: samples.code })
      .from(experimentSamples)
      .innerJoin(samples, eq(samples.id, experimentSamples.sampleId))
      .where(inArray(experimentSamples.experimentId, rows.map((r) => r.id)))
      .orderBy(samples.code),
    db
      .select({
        experimentId: experimentLots.experimentId,
        itemName: inventoryItems.name,
        lotCode: inventoryLots.lotCode,
      })
      .from(experimentLots)
      .innerJoin(inventoryLots, eq(inventoryLots.id, experimentLots.lotId))
      .innerJoin(inventoryItems, eq(inventoryItems.id, inventoryLots.itemId))
      .where(inArray(experimentLots.experimentId, rows.map((r) => r.id)))
      .orderBy(inventoryItems.name),
  ]);

  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((row): row is (typeof rows)[number] => Boolean(row))
    .map((row) => ({
      ...row,
      conditions: conditionRows
        .filter((c) => c.experimentId === row.id)
        .map((c) => ({ name: c.name, value: c.value, unit: c.unit })),
      sampleCodes: sampleRows.filter((sr) => sr.experimentId === row.id).map((sr) => sr.code),
      lots: lotRows
        .filter((l) => l.experimentId === row.id)
        .map((l) => ({ itemName: l.itemName, lotCode: l.lotCode })),
    }));
}

/* ── research memory ────────────────────────────────────────────────────── */

/** Structured inputs for the deterministic research memory page. */
export async function memoryInputs(s: SessionContext, projectId: string) {
  assertId(projectId, 'Project');
  await getProject(s, projectId);
  const [experimentRows, changeRows] = await Promise.all([
    db
      .select({
        id: experiments.id,
        number: experiments.number,
        title: experiments.title,
        status: experiments.status,
        objective: experiments.objective,
        conclusion: experimentResults.conclusion,
        nextSteps: experimentResults.nextSteps,
        observations: experimentResults.observations,
        protocolName: protocols.name,
        protocolVersion: protocolVersions.version,
      })
      .from(experiments)
      .leftJoin(experimentResults, eq(experimentResults.experimentId, experiments.id))
      .leftJoin(protocolVersions, eq(protocolVersions.id, experiments.protocolVersionId))
      .leftJoin(protocols, eq(protocols.id, protocolVersions.protocolId))
      .where(and(eq(experiments.workspaceId, s.workspaceId), eq(experiments.projectId, projectId)))
      .orderBy(experiments.number),
    db
      .select({
        protocolName: protocols.name,
        version: protocolVersions.version,
        changeNote: protocolVersions.changeNote,
      })
      .from(protocolVersions)
      .innerJoin(protocols, eq(protocols.id, protocolVersions.protocolId))
      .where(eq(protocols.workspaceId, s.workspaceId))
      .orderBy(protocols.name, protocolVersions.version),
  ]);
  return { experiments: experimentRows, protocolChanges: changeRows };
}


/* ── research updates ───────────────────────────────────────────────────── */

export type UpdateSectionRow = {
  heading: string;
  body: string;
  source: 'record' | 'researcher' | 'ai';
};

export async function listResearchUpdates(s: SessionContext, opts: { projectId?: string } = {}) {
  const where = opts.projectId
    ? and(eq(researchUpdates.workspaceId, s.workspaceId), eq(researchUpdates.projectId, opts.projectId))
    : eq(researchUpdates.workspaceId, s.workspaceId);
  return db
    .select({
      id: researchUpdates.id,
      title: researchUpdates.title,
      status: researchUpdates.status,
      projectId: researchUpdates.projectId,
      projectName: projects.name,
      experimentIds: researchUpdates.experimentIds,
      updatedAt: researchUpdates.updatedAt,
    })
    .from(researchUpdates)
    .innerJoin(projects, eq(projects.id, researchUpdates.projectId))
    .where(where)
    .orderBy(desc(researchUpdates.updatedAt));
}

export async function getResearchUpdate(s: SessionContext, updateId: string) {
  assertId(updateId, 'Update');
  const rows = await db
    .select({
      id: researchUpdates.id,
      title: researchUpdates.title,
      status: researchUpdates.status,
      sections: researchUpdates.sections,
      experimentIds: researchUpdates.experimentIds,
      projectId: researchUpdates.projectId,
      projectName: projects.name,
      updatedAt: researchUpdates.updatedAt,
    })
    .from(researchUpdates)
    .innerJoin(projects, eq(projects.id, researchUpdates.projectId))
    .where(and(eq(researchUpdates.id, updateId), eq(researchUpdates.workspaceId, s.workspaceId)))
    .limit(1);
  return assertFound(rows[0], 'Research update');
}

export async function createResearchUpdate(
  s: SessionContext,
  projectId: string,
  input: { title: string; experimentIds: string[]; sections: UpdateSectionRow[] },
) {
  assertId(projectId, 'Project');
  await getProject(s, projectId);
  const rows = await db
    .insert(researchUpdates)
    .values({
      workspaceId: s.workspaceId,
      projectId,
      title: input.title,
      experimentIds: input.experimentIds,
      sections: input.sections,
      createdById: s.userId,
    })
    .returning({ id: researchUpdates.id });
  return assertFound(rows[0], 'Research update').id;
}

export async function saveResearchUpdate(
  s: SessionContext,
  updateId: string,
  input: { title: string; sections: UpdateSectionRow[]; status: 'draft' | 'final' },
) {
  assertId(updateId, 'Update');
  const rows = await db
    .update(researchUpdates)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(researchUpdates.id, updateId), eq(researchUpdates.workspaceId, s.workspaceId)))
    .returning({ id: researchUpdates.id });
  assertFound(rows[0], 'Research update');
}

export async function deleteResearchUpdate(s: SessionContext, updateId: string) {
  assertId(updateId, 'Update');
  const rows = await db
    .delete(researchUpdates)
    .where(and(eq(researchUpdates.id, updateId), eq(researchUpdates.workspaceId, s.workspaceId)))
    .returning({ id: researchUpdates.id });
  assertFound(rows[0], 'Research update');
}

/* ── connective views ───────────────────────────────────────────────────── */

/**
 * Everything the documentation check needs, for every run in the lab that has
 * started. One query, so the PI can see which records are thin without opening
 * each one. Planned runs and the example project are left out: an empty
 * result on a run nobody has done yet is not a gap.
 */
export async function listRecordChecks(s: SessionContext) {
  return db
    .select({
      id: experiments.id,
      number: experiments.number,
      title: experiments.title,
      status: experiments.status,
      updatedAt: experiments.updatedAt,
      projectName: projects.name,
      researcherId: experiments.researcherId,
      researcherName: users.name,
      objective: experiments.objective,
      hypothesis: experiments.hypothesis,
      dataLocation: experiments.dataLocation,
      protocolName: protocols.name,
      protocolVersion: protocolVersions.version,
      summary: experimentResults.summary,
      observations: experimentResults.observations,
      conclusion: experimentResults.conclusion,
      nextSteps: experimentResults.nextSteps,
      conditionCount: sql<number>`(
        select count(*)::int from "experiment_conditions" ec where ec.experiment_id = experiments.id
      )`,
      sampleCount: sql<number>`(
        select count(*)::int from "experiment_samples" es where es.experiment_id = experiments.id
      )`,
      datasetCount: sql<number>`(
        select count(*)::int from "datasets" d where d.experiment_id = experiments.id
      )`,
      fileCount: sql<number>`(
        select count(*)::int from "experiment_files" ef where ef.experiment_id = experiments.id
      )`,
      noteCount: sql<number>`(
        select count(*)::int from "experiment_notes" en where en.experiment_id = experiments.id
      )`,
    })
    .from(experiments)
    .innerJoin(projects, eq(projects.id, experiments.projectId))
    .leftJoin(users, eq(users.id, experiments.researcherId))
    .leftJoin(protocolVersions, eq(protocolVersions.id, experiments.protocolVersionId))
    .leftJoin(protocols, eq(protocols.id, protocolVersions.protocolId))
    .leftJoin(experimentResults, eq(experimentResults.experimentId, experiments.id))
    .where(
      and(
        eq(experiments.workspaceId, s.workspaceId),
        ne(experiments.status, 'planned'),
        eq(projects.isExample, false),
      ),
    )
    .orderBy(desc(experiments.updatedAt));
}

/** Signals the deterministic next-actions engine runs on. */
export async function nextActionSignals(s: SessionContext, opts: { projectId?: string } = {}) {
  const where = opts.projectId
    ? and(eq(experiments.workspaceId, s.workspaceId), eq(experiments.projectId, opts.projectId))
    : eq(experiments.workspaceId, s.workspaceId);

  const [experimentRows, protocolRows] = await Promise.all([
    db
      .select({
        id: experiments.id,
        number: experiments.number,
        title: experiments.title,
        status: experiments.status,
        projectId: experiments.projectId,
        projectName: projects.name,
        performedOn: experiments.performedOn,
        updatedAt: experiments.updatedAt,
        conclusion: experimentResults.conclusion,
        nextSteps: experimentResults.nextSteps,
        observations: experimentResults.observations,
        conditionCount: sql<number>`(
          select count(*)::int from "experiment_conditions" ec
          where ec.experiment_id = experiments.id
        )`,
        sampleCount: sql<number>`(
          select count(*)::int from "experiment_samples" es
          where es.experiment_id = experiments.id
        )`,
        datasetCount: sql<number>`(
          select count(*)::int from "datasets" d where d.experiment_id = experiments.id
        )`,
      })
      .from(experiments)
      .innerJoin(projects, eq(projects.id, experiments.projectId))
      .leftJoin(experimentResults, eq(experimentResults.experimentId, experiments.id))
      .where(where),
    db
      .select({
        id: protocols.id,
        name: protocols.name,
        latestVersion: sql<number | null>`(
          select max(pv.version) from "protocol_versions" pv where pv.protocol_id = protocols.id
        )`,
        experimentCount: sql<number>`(
          select count(*)::int from "experiments" e
          join "protocol_versions" pv on pv.id = e.protocol_version_id
          where pv.protocol_id = protocols.id
        )`,
      })
      .from(protocols)
      .where(eq(protocols.workspaceId, s.workspaceId)),
  ]);

  return {
    experiments: experimentRows.map((row) => ({
      id: row.id,
      number: row.number,
      title: row.title,
      status: row.status as string,
      projectId: row.projectId,
      projectName: row.projectName,
      performedOn: row.performedOn,
      updatedAt: row.updatedAt,
      hasConclusion: Boolean(row.conclusion?.trim()),
      hasNextSteps: Boolean(row.nextSteps?.trim()),
      hasObservations: Boolean(row.observations?.trim()),
      conditionCount: row.conditionCount,
      sampleCount: row.sampleCount,
      datasetCount: row.datasetCount,
    })),
    protocols: protocolRows,
  };
}

/**
 * Every file in the workspace with the record it belongs to.
 *
 * This is the "where is that file?" view, but anchored to the experiment that
 * produced it, which is the thing a shared drive cannot tell you.
 */
export async function listFiles(s: SessionContext) {
  return db
    .select({
      id: files.id,
      filename: files.filename,
      contentType: files.contentType,
      byteSize: files.byteSize,
      createdAt: files.createdAt,
      sourceUrl: files.sourceUrl,
      provider: files.provider,
      uploaderName: users.name,
      experimentId: experiments.id,
      experimentNumber: experiments.number,
      experimentTitle: experiments.title,
      projectId: projects.id,
      projectName: projects.name,
      datasetId: datasets.id,
      private: files.private,
      uploadedById: files.uploadedById,
      storageKey: files.storageKey,
      isDocument: files.isDocument,
      updatedAt: files.updatedAt,
    })
    .from(files)
    .leftJoin(users, eq(users.id, files.uploadedById))
    .leftJoin(experimentFiles, eq(experimentFiles.fileId, files.id))
    .leftJoin(experiments, eq(experiments.id, experimentFiles.experimentId))
    .leftJoin(projects, eq(projects.id, experiments.projectId))
    .leftJoin(datasets, eq(datasets.fileId, files.id))
    .where(fileVisibleTo(s))
    .orderBy(desc(files.createdAt));
}

/** Which experiments used each version of a protocol. */
export async function protocolVersionUsage(s: SessionContext, protocolId: string) {
  assertId(protocolId, 'Protocol');
  return db
    .select({
      versionId: protocolVersions.id,
      version: protocolVersions.version,
      experimentId: experiments.id,
      experimentNumber: experiments.number,
      experimentTitle: experiments.title,
      projectName: projects.name,
    })
    .from(protocolVersions)
    .innerJoin(protocols, eq(protocols.id, protocolVersions.protocolId))
    .leftJoin(experiments, eq(experiments.protocolVersionId, protocolVersions.id))
    .leftJoin(projects, eq(projects.id, experiments.projectId))
    .where(
      and(eq(protocolVersions.protocolId, protocolId), eq(protocols.workspaceId, s.workspaceId)),
    )
    .orderBy(desc(protocolVersions.version), experiments.number);
}

/**
 * The first dataset among the given experiments that has two numeric columns -
 * enough to draw one chart for a research update. Returns null when the
 * experiments carry no plottable data, and the deck simply omits the slide.
 */
export async function firstPlottableDataset(s: SessionContext, experimentIds: string[]) {
  if (experimentIds.length === 0) return null;

  const rows = await db
    .select({
      id: datasets.id,
      name: datasets.name,
      rows: datasets.rows,
      experimentNumber: experiments.number,
      experimentTitle: experiments.title,
    })
    .from(datasets)
    .innerJoin(experiments, eq(experiments.id, datasets.experimentId))
    .where(
      and(eq(datasets.workspaceId, s.workspaceId), inArray(datasets.experimentId, experimentIds)),
    )
    .orderBy(experiments.number, datasets.createdAt);

  for (const row of rows) {
    const numeric = await db
      .select({ name: datasetColumnsTable.name })
      .from(datasetColumnsTable)
      .where(
        and(eq(datasetColumnsTable.datasetId, row.id), eq(datasetColumnsTable.isNumeric, true)),
      )
      .orderBy(datasetColumnsTable.position);
    if (numeric.length >= 2) {
      return {
        ...row,
        xColumn: numeric[0]!.name,
        yColumn: numeric[1]!.name,
      };
    }
  }
  return null;
}

/* ── link attachments ───────────────────────────────────────────────────── */

export async function recordLink(
  s: SessionContext,
  input: { filename: string; sourceUrl: string; provider: string },
) {
  const rows = await db
    .insert(files)
    .values({
      workspaceId: s.workspaceId,
      uploadedById: s.userId,
      filename: input.filename,
      contentType: 'text/uri-list',
      byteSize: 0,
      storageKey: null,
      sourceUrl: input.sourceUrl,
      provider: input.provider,
    })
    .returning({ id: files.id });
  const linkId = assertFound(rows[0], 'Link').id;
  await logActivity(s, { action: 'added', subjectType: 'link', subjectId: linkId, label: input.filename, detail: input.sourceUrl, href: '/files' });
  return linkId;
}

/* ── discussion ─────────────────────────────────────────────────────────── */

export type DiscussionMessage = {
  id: string;
  body: string;
  createdAt: Date;
  authorId: string | null;
  authorName: string | null;
  parentId: string | null;
  fileId: string | null;
  fileName: string | null;
  fileSize: number | null;
  replies: DiscussionMessage[];
};

/**
 * Messages for one experiment, one project, or the whole workspace, nested one
 * level deep.
 *
 * A row with neither id set is the workspace channel. `workspace: true` has to
 * be asked for, so a call with an id that turned out empty still returns
 * nothing rather than quietly handing back the workspace-wide conversation.
 */
export async function listDiscussion(
  s: SessionContext,
  scope: { experimentId?: string; projectId?: string; taskId?: string; workspace?: boolean; dmKey?: string },
): Promise<DiscussionMessage[]> {
  // A direct message is readable only by the people in it.
  if (scope.dmKey && !dmParticipants(scope.dmKey)?.includes(s.userId)) return [];
  // An empty string is not a uuid; Postgres would reject the whole query.
  const target = scope.dmKey
    ? eq(discussions.dmKey, scope.dmKey)
    : scope.experimentId
    ? eq(discussions.experimentId, scope.experimentId)
    : scope.projectId
      ? eq(discussions.projectId, scope.projectId)
      : scope.taskId
        ? eq(discussions.taskId, scope.taskId)
        : scope.workspace
          ? // The lab channel is "attached to nothing". Task threads are
            // attached to a task but to no project, so without the third
            // clause every progress note would surface in the lab channel.
            and(
              isNull(discussions.projectId),
              isNull(discussions.experimentId),
              isNull(discussions.taskId),
              // Direct messages are attached to nothing too; they are not
              // the lab's to read.
              isNull(discussions.dmKey),
            )
          : null;
  if (!target) return [];

  const rows = await db
    .select({
      id: discussions.id,
      body: discussions.body,
      createdAt: discussions.createdAt,
      parentId: discussions.parentId,
      authorId: discussions.authorId,
      authorName: users.name,
      fileId: discussions.fileId,
      fileName: files.filename,
      fileSize: files.byteSize,
    })
    .from(discussions)
    .leftJoin(users, eq(users.id, discussions.authorId))
    // A deleted file leaves the message standing, so this join has to be left.
    .leftJoin(files, eq(files.id, discussions.fileId))
    .where(and(eq(discussions.workspaceId, s.workspaceId), target))
    .orderBy(discussions.createdAt);

  const byId = new Map<string, DiscussionMessage>();
  for (const row of rows) byId.set(row.id, { ...row, replies: [] });

  const roots: DiscussionMessage[] = [];
  for (const message of byId.values()) {
    const parent = message.parentId ? byId.get(message.parentId) : undefined;
    if (parent) parent.replies.push(message);
    else roots.push(message);
  }
  return roots;
}

/**
 * Every chat message this person may read, newest first, for LabBot: the lab
 * channel, project, experiment and task threads, and only the direct messages
 * they are part of. Someone else's DMs never reach the model on their behalf.
 */
export async function messagesVisibleTo(s: SessionContext, limit = 400) {
  const taskAlias = alias(tasks, 'message_task');
  return db
    .select({
      id: discussions.id,
      body: discussions.body,
      createdAt: discussions.createdAt,
      authorName: users.name,
      projectName: projects.name,
      experimentNumber: experiments.number,
      taskTitle: taskAlias.title,
      dmKey: discussions.dmKey,
      fileName: files.filename,
    })
    .from(discussions)
    .leftJoin(users, eq(users.id, discussions.authorId))
    .leftJoin(projects, eq(projects.id, discussions.projectId))
    .leftJoin(experiments, eq(experiments.id, discussions.experimentId))
    .leftJoin(taskAlias, eq(taskAlias.id, discussions.taskId))
    .leftJoin(files, eq(files.id, discussions.fileId))
    .where(
      and(
        eq(discussions.workspaceId, s.workspaceId),
        or(isNull(discussions.dmKey), sql`position(${s.userId} in ${discussions.dmKey}) > 0`),
      ),
    )
    .orderBy(desc(discussions.createdAt))
    .limit(limit);
}

export async function postMessage(
  s: SessionContext,
  input: {
    experimentId?: string;
    projectId?: string;
    taskId?: string;
    workspace?: boolean;
    dmKey?: string;
    parentId: string | null;
    body: string;
    fileId?: string | null;
  },
) {
  let dmPeople: string[] | null = null;
  if (input.dmKey) {
    dmPeople = dmParticipants(input.dmKey);
    // Only someone in the conversation may write to it, and only with people
    // who are in this lab.
    if (!dmPeople?.includes(s.userId)) throw new NotFoundInWorkspaceError('Conversation');
    if ((await labMembersAmong(s, dmPeople)).length !== dmPeople.length) {
      throw new NotFoundInWorkspaceError('Conversation');
    }
  }
  // Confirms the target is in the caller's workspace before writing. The
  // workspace channel needs no such check: the session already names it.
  if (dmPeople) {
    // Checked above.
  } else if (input.experimentId) await getExperiment(s, input.experimentId);
  else if (input.projectId) await getProject(s, input.projectId);
  else if (input.taskId) await getTask(s, input.taskId);
  else if (!input.workspace) throw new NotFoundInWorkspaceError('Discussion target');

  // Confirms the attachment is this workspace's before it is pointed at, and
  // that it is not private: everyone reading the thread would see a link
  // they cannot open.
  if (input.fileId) {
    const file = await getFileForDownload(s, input.fileId);
    // A private file may go into a DM whose people can all open it; anywhere
    // else, everyone reading would see a link they cannot open.
    const openToReaders = dmPeople ? await fileOpenToAll(input.fileId, dmPeople) : !file.private;
    if (!openToReaders) throw new NotFoundInWorkspaceError('File');
  }

  // A reply must answer a message in this lab. Unchecked, a stray id is a
  // database error in the middle of someone's conversation.
  if (input.parentId) {
    assertId(input.parentId, 'Message');
    const parent = await db
      .select({ id: discussions.id })
      .from(discussions)
      .where(and(eq(discussions.id, input.parentId), eq(discussions.workspaceId, s.workspaceId)))
      .limit(1);
    if (!parent[0]) throw new NotFoundInWorkspaceError('Message');
  }

  const [row] = await db
    .insert(discussions)
    .values({
      workspaceId: s.workspaceId,
      experimentId: input.experimentId ?? null,
      projectId: input.projectId ?? null,
      taskId: input.taskId ?? null,
      dmKey: input.dmKey ?? null,
      parentId: input.parentId,
      authorId: s.userId,
      body: input.body,
      fileId: input.fileId ?? null,
    })
    .returning({ id: discussions.id });
  return row!.id;
}

export async function deleteMessage(s: SessionContext, messageId: string) {
  assertId(messageId, 'Message');
  const rows = await db
    .delete(discussions)
    .where(
      and(
        eq(discussions.id, messageId),
        eq(discussions.workspaceId, s.workspaceId),
        // Only the author can remove their own message.
        eq(discussions.authorId, s.userId),
      ),
    )
    .returning({ id: discussions.id });
  assertFound(rows[0], 'Message');
}

/* ── literature ─────────────────────────────────────────────────────────── */

export async function listLiterature(s: SessionContext, projectId: string) {
  assertId(projectId, 'Project');
  return db
    .select({
      id: literatureRefs.id,
      pmid: literatureRefs.pmid,
      title: literatureRefs.title,
      journal: literatureRefs.journal,
      year: literatureRefs.year,
      authors: literatureRefs.authors,
      note: literatureRefs.note,
      abstract: literatureRefs.abstract,
      createdAt: literatureRefs.createdAt,
      addedByName: users.name,
    })
    .from(literatureRefs)
    .leftJoin(users, eq(users.id, literatureRefs.addedById))
    .where(
      and(eq(literatureRefs.workspaceId, s.workspaceId), eq(literatureRefs.projectId, projectId)),
    )
    .orderBy(desc(literatureRefs.createdAt));
}

export async function saveLiterature(
  s: SessionContext,
  projectId: string,
  article: {
    pmid: string;
    title: string;
    journal: string | null;
    year: string | null;
    authors: string | null;
    abstract?: string | null;
  },
) {
  assertId(projectId, 'Project');
  await getProject(s, projectId);
  await db
    .insert(literatureRefs)
    .values({ ...article, workspaceId: s.workspaceId, projectId, addedById: s.userId })
    .onConflictDoNothing({ target: [literatureRefs.projectId, literatureRefs.pmid] });
}

export async function removeLiterature(s: SessionContext, refId: string) {
  assertId(refId, 'Ref');
  const rows = await db
    .delete(literatureRefs)
    .where(and(eq(literatureRefs.id, refId), eq(literatureRefs.workspaceId, s.workspaceId)))
    .returning({ id: literatureRefs.id });
  assertFound(rows[0], 'Reference');
}

/** Persists one AI response with the evidence it was shown. */
export async function recordAiGeneration(
  s: SessionContext,
  input: {
    projectId: string | null;
    experimentId: string | null;
    kind: 'experiment_analysis' | 'project_answer' | 'research_memory' | 'research_update';
    prompt: string | null;
    output: unknown;
    evidence: { type: string; id: string; label: string }[];
    model: string | null;
  },
) {
  await db.insert(aiGenerations).values({ ...input, workspaceId: s.workspaceId, createdById: s.userId });
}

/* ── invitations ────────────────────────────────────────────────────────── */

export async function listInvites(s: SessionContext) {
  return db
    .select({
      id: workspaceInvites.id,
      email: workspaceInvites.email,
      role: workspaceInvites.role,
      createdAt: workspaceInvites.createdAt,
      expiresAt: workspaceInvites.expiresAt,
      invitedByName: users.name,
    })
    .from(workspaceInvites)
    .leftJoin(users, eq(users.id, workspaceInvites.invitedById))
    .where(
      and(eq(workspaceInvites.workspaceId, s.workspaceId), isNull(workspaceInvites.acceptedAt)),
    )
    .orderBy(desc(workspaceInvites.createdAt));
}

export async function createInvite(
  s: SessionContext,
  input: { email: string; role: 'admin' | 'member'; tokenHash: string; expiresAt: Date },
) {
  await db
    .insert(workspaceInvites)
    .values({ ...input, workspaceId: s.workspaceId, invitedById: s.userId })
    .onConflictDoNothing();
}

export async function revokeInvite(s: SessionContext, inviteId: string) {
  assertId(inviteId, 'Invite');
  const rows = await db
    .delete(workspaceInvites)
    .where(and(eq(workspaceInvites.id, inviteId), eq(workspaceInvites.workspaceId, s.workspaceId)))
    .returning({ id: workspaceInvites.id });
  assertFound(rows[0], 'Invitation');
}

/** Looks an invite up by token, used before a session exists. */
export async function findInviteByToken(tokenHash: string) {
  const rows = await db
    .select({
      id: workspaceInvites.id,
      email: workspaceInvites.email,
      role: workspaceInvites.role,
      workspaceId: workspaceInvites.workspaceId,
      workspaceName: workspaces.name,
    })
    .from(workspaceInvites)
    .innerJoin(workspaces, eq(workspaces.id, workspaceInvites.workspaceId))
    .where(
      and(
        eq(workspaceInvites.tokenHash, tokenHash),
        isNull(workspaceInvites.acceptedAt),
        gt(workspaceInvites.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Joins a user to the invited workspace and burns the invite. */
export async function acceptInvite(inviteId: string, workspaceId: string, userId: string, role: 'owner' | 'admin' | 'member') {
  await db.transaction(async (tx) => {
    await tx
      .insert(workspaceMembers)
      .values({ workspaceId, userId, role })
      .onConflictDoNothing();
    await tx
      .update(workspaceInvites)
      .set({ acceptedAt: new Date() })
      .where(eq(workspaceInvites.id, inviteId));
  });
}

/* ── tasks ──────────────────────────────────────────────────────────────── */

export const TASK_STATUS = ['open', 'doing', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUS)[number];

export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUS as readonly string[]).includes(value);
}

/**
 * Every task in the lab, newest first, with the names already joined on.
 *
 * One query rather than a per-assignee one: a lab has tens of tasks, not
 * thousands, and the board wants them all anyway to group them.
 */
export async function listTasks(s: SessionContext, filter?: { projectId?: string }) {
  const assignee = alias(users, 'task_assignee');
  const where = filter?.projectId
    ? and(eq(tasks.workspaceId, s.workspaceId), eq(tasks.projectId, filter.projectId))
    : eq(tasks.workspaceId, s.workspaceId);

  return db
    .select({
      id: tasks.id,
      title: tasks.title,
      detail: tasks.detail,
      status: tasks.status,
      dueOn: tasks.dueOn,
      forEveryone: tasks.forEveryone,
      createdAt: tasks.createdAt,
      assignedTo: tasks.assignedTo,
      assigneeName: assignee.name,
      projectId: tasks.projectId,
      projectName: projects.name,
    })
    .from(tasks)
    .leftJoin(assignee, eq(assignee.id, tasks.assignedTo))
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(where)
    .orderBy(desc(tasks.createdAt));
}

export async function getTask(s: SessionContext, taskId: string) {
  assertId(taskId, 'Task');
  const assignee = alias(users, 'task_assignee');
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      detail: tasks.detail,
      status: tasks.status,
      dueOn: tasks.dueOn,
      forEveryone: tasks.forEveryone,
      createdAt: tasks.createdAt,
      assignedTo: tasks.assignedTo,
      assigneeName: assignee.name,
      projectId: tasks.projectId,
      projectName: projects.name,
    })
    .from(tasks)
    .leftJoin(assignee, eq(assignee.id, tasks.assignedTo))
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, s.workspaceId)))
    .limit(1);
  return assertFound(rows[0], 'Task');
}

export async function createTask(
  s: SessionContext,
  input: {
    title: string;
    detail: string | null;
    assignedTo: string | null;
    projectId: string | null;
    dueOn: string | null;
    forEveryone?: boolean;
  },
) {
  // Both point at rows a caller could have named from another workspace.
  if (input.projectId) await getProject(s, input.projectId);
  if (input.assignedTo) await assertWorkspaceMember(s, input.assignedTo);

  const [row] = await db
    .insert(tasks)
    .values({ ...input, workspaceId: s.workspaceId, createdBy: s.userId })
    .returning({ id: tasks.id });
  return assertFound(row, 'Task').id;
}

export async function updateTask(
  s: SessionContext,
  taskId: string,
  patch: {
    status?: TaskStatus;
    assignedTo?: string | null;
    forEveryone?: boolean;
    title?: string;
    detail?: string | null;
    dueOn?: string | null;
  },
) {
  assertId(taskId, 'Task');
  if (patch.assignedTo) await assertWorkspaceMember(s, patch.assignedTo);

  const rows = await db
    .update(tasks)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, s.workspaceId)))
    .returning({ id: tasks.id });
  assertFound(rows[0], 'Task');
}

export async function deleteTask(s: SessionContext, taskId: string) {
  assertId(taskId, 'Task');
  const rows = await db
    .delete(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.workspaceId, s.workspaceId)))
    .returning({ id: tasks.id });
  assertFound(rows[0], 'Task');
}

/**
 * Refuses to assign work to somebody outside the lab.
 *
 * Without it, a crafted form could point a task at any user id in the
 * database, and that person's name would then be rendered inside a workspace
 * they are not a member of.
 */
async function assertWorkspaceMember(s: SessionContext, userId: string) {
  assertId(userId, 'Person');
  const rows = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, s.workspaceId), eq(workspaceMembers.userId, userId)),
    )
    .limit(1);
  if (!rows[0]) throw new NotFoundInWorkspaceError('Person');
}

/* ── calendar ───────────────────────────────────────────────────────────── */

/** Dates are YYYY-MM-DD strings throughout, the same shape the column holds. */
function assertIsoDate(value: string, what: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new NotFoundInWorkspaceError(what);
  }
}

/** Events and task deadlines between two dates, inclusive: one calendar's worth. */
export async function listCalendar(s: SessionContext, from: string, to: string) {
  assertIsoDate(from, 'Date');
  assertIsoDate(to, 'Date');
  const assignee = alias(users, 'calendar_assignee');
  const [eventRows, taskRows] = await Promise.all([
    db
      .select({
        id: events.id,
        title: events.title,
        onDate: events.onDate,
        atTime: events.atTime,
        notes: events.notes,
        createdBy: events.createdBy,
        creatorName: users.name,
      })
      .from(events)
      .leftJoin(users, eq(users.id, events.createdBy))
      .where(
        and(
          eq(events.workspaceId, s.workspaceId),
          sql`${events.onDate} >= ${from}`,
          sql`${events.onDate} <= ${to}`,
        ),
      )
      .orderBy(events.onDate, events.atTime),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        dueOn: tasks.dueOn,
        status: tasks.status,
        assignedTo: tasks.assignedTo,
        forEveryone: tasks.forEveryone,
        assigneeName: assignee.name,
      })
      .from(tasks)
      .leftJoin(assignee, eq(assignee.id, tasks.assignedTo))
      .where(
        and(
          eq(tasks.workspaceId, s.workspaceId),
          sql`${tasks.dueOn} >= ${from}`,
          sql`${tasks.dueOn} <= ${to}`,
        ),
      ),
  ]);
  return { events: eventRows, deadlines: taskRows };
}

export async function createEvent(
  s: SessionContext,
  input: { title: string; onDate: string; atTime: string | null; notes: string | null },
) {
  assertIsoDate(input.onDate, 'Date');
  const [row] = await db
    .insert(events)
    .values({ ...input, workspaceId: s.workspaceId, createdBy: s.userId })
    .returning({ id: events.id });
  return assertFound(row, 'Event').id;
}

/** Anyone in the lab may remove an event; a shared calendar is kept by everyone. */
export async function deleteEvent(s: SessionContext, eventId: string) {
  assertId(eventId, 'Event');
  const rows = await db
    .delete(events)
    .where(and(eq(events.id, eventId), eq(events.workspaceId, s.workspaceId)))
    .returning({ id: events.id });
  assertFound(rows[0], 'Event');
}

/* ── join links ─────────────────────────────────────────────────────────── */

/** The lab's current join code, for the settings screen. */
export async function getJoinCode(s: SessionContext): Promise<string | null> {
  const rows = await db
    .select({ joinCode: workspaces.joinCode })
    .from(workspaces)
    .where(eq(workspaces.id, s.workspaceId))
    .limit(1);
  return rows[0]?.joinCode ?? null;
}

/**
 * Turns the link on with a fresh code, or off with null.
 *
 * Replacing the code is how a link is revoked: everyone still holding the old
 * one is locked out at once, and the people already in the lab are members and
 * unaffected.
 */
export async function setJoinCode(s: SessionContext, code: string | null): Promise<void> {
  await db
    .update(workspaces)
    .set({ joinCode: code, updatedAt: new Date() })
    .where(eq(workspaces.id, s.workspaceId));
}

/* ── calendar feed ────────────────────────────────────────────────────── */

/** This person's private calendar address for this lab, if they made one. */
export async function getCalendarToken(s: SessionContext): Promise<string | null> {
  const rows = await db
    .select({ token: workspaceMembers.calendarToken })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, s.workspaceId), eq(workspaceMembers.userId, s.userId)))
    .limit(1);
  return rows[0]?.token ?? null;
}

/** Makes a new address, which also switches off the old one. */
export async function setCalendarToken(s: SessionContext, token: string): Promise<void> {
  await db
    .update(workspaceMembers)
    .set({ calendarToken: token })
    .where(and(eq(workspaceMembers.workspaceId, s.workspaceId), eq(workspaceMembers.userId, s.userId)));
}

/**
 * Everything a calendar app needs, found by the address alone: it has no
 * session, only the token in the URL. Two months back and a year ahead is
 * what the calendar apps show without anyone scrolling.
 */
export async function calendarFeed(token: string, today: string) {
  if (token.length < 20) return null;
  const rows = await db
    .select({
      workspaceId: workspaceMembers.workspaceId,
      userId: workspaceMembers.userId,
      workspaceName: workspaces.name,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.calendarToken, token))
    .limit(1);
  const member = rows[0];
  if (!member) return null;
  const day = (offset: number) => new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
  const scoped = { workspaceId: member.workspaceId, userId: member.userId } as SessionContext;
  const { events: eventRows, deadlines } = await listCalendar(scoped, day(-60), day(365));
  return { workspaceName: member.workspaceName, userId: member.userId, events: eventRows, deadlines };
}

/** Resolves a pasted link, for someone who has no session yet. */
export async function findWorkspaceByJoinCode(code: string) {
  if (code.length < 16) return null;
  const rows = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.joinCode, code))
    .limit(1);
  return rows[0] ?? null;
}

/** Whether this person is already in that lab, so the link is a no-op. */
export async function isMember(workspaceId: string, userId: string): Promise<boolean> {
  assertId(workspaceId, 'Workspace');
  const rows = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

/**
 * The same seat count as seatUsage, for a workspace nobody is signed into yet.
 *
 * Someone arriving on a join link has no session scoped to that lab, and the
 * seat limit still has to hold: without this a pasted link in a group chat
 * would take a five-seat lab to thirty.
 */
export async function seatUsageByWorkspace(workspaceId: string) {
  assertId(workspaceId, 'Workspace');
  const [members, invites] = await Promise.all([
    db.select({ n: count() }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId)),
    db
      .select({ n: count() })
      .from(workspaceInvites)
      .where(and(eq(workspaceInvites.workspaceId, workspaceId), isNull(workspaceInvites.acceptedAt))),
  ]);
  return { members: members[0]?.n ?? 0, pending: invites[0]?.n ?? 0 };
}

/** Adds someone to a lab from a join link. Always a plain member. */
export async function joinWorkspaceByCode(workspaceId: string, userId: string): Promise<void> {
  assertId(workspaceId, 'Workspace');
  await db
    .insert(workspaceMembers)
    .values({ workspaceId, userId, role: 'member' })
    .onConflictDoNothing();
}

/* ── billing ────────────────────────────────────────────────────────────── */

/** The workspace's subscription, or null when it somehow has none. */
export async function getSubscription(s: SessionContext) {
  const rows = await db
    .select()
    .from(workspaceSubscriptions)
    .where(eq(workspaceSubscriptions.workspaceId, s.workspaceId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * The same row keyed on the workspace rather than a session.
 *
 * Reconciling with Stripe runs from a redirect and from a webhook, neither of
 * which has a workspace-scoped session to hand.
 */
export async function getSubscriptionByWorkspace(workspaceId: string) {
  assertId(workspaceId, 'Workspace');
  const rows = await db
    .select()
    .from(workspaceSubscriptions)
    .where(eq(workspaceSubscriptions.workspaceId, workspaceId))
    .limit(1);
  return rows[0] ?? null;
}

/** Members plus outstanding invites, both consume a seat. */
export async function seatUsage(s: SessionContext) {
  const [members, invites] = await Promise.all([
    db
      .select({ n: count() })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, s.workspaceId)),
    db
      .select({ n: count() })
      .from(workspaceInvites)
      .where(
        and(eq(workspaceInvites.workspaceId, s.workspaceId), isNull(workspaceInvites.acceptedAt)),
      ),
  ]);
  return { members: members[0]?.n ?? 0, pending: invites[0]?.n ?? 0 };
}

/** Starts every new workspace on a trial rather than a locked door. */
/**
 * Starts a workspace on a trial, or on the free plan if this person has had
 * one before.
 *
 * The claim is written first and conditionally: if the row already exists the
 * insert affects nothing, and that is the signal. Doing it in that order means
 * two simultaneous signups cannot both win, and the record survives deleting
 * the account, which is the loop worth closing.
 */
export async function startTrial(
  workspaceId: string,
  days: number,
  email: string,
): Promise<'trial' | 'free'> {
  const claimed = await db
    .insert(trialGrants)
    .values({ email: normaliseEmail(email), workspaceId })
    .onConflictDoNothing({ target: trialGrants.email })
    .returning({ email: trialGrants.email });

  const first = claimed.length > 0;
  await db
    .insert(workspaceSubscriptions)
    .values(
      first
        ? {
            workspaceId,
            status: 'trialing',
            trialEndsAt: new Date(Date.now() + days * 86_400_000),
          }
        : { workspaceId, status: 'none', trialEndsAt: null },
    )
    .onConflictDoNothing({ target: workspaceSubscriptions.workspaceId });

  return first ? 'trial' : 'free';
}

export async function setStripeCustomer(s: SessionContext, customerId: string) {
  await db
    .update(workspaceSubscriptions)
    .set({ stripeCustomerId: customerId, updatedAt: new Date() })
    .where(eq(workspaceSubscriptions.workspaceId, s.workspaceId));
}

/**
 * Applied from a Stripe webhook, so it is keyed on the Stripe ids rather than
 * a session, there is no user in that request.
 */
export async function applySubscriptionEvent(input: {
  workspaceId: string;
  plan: string | null;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'none';
  currentPeriodEnd: Date | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}) {
  await db
    .insert(workspaceSubscriptions)
    .values({ ...input, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: workspaceSubscriptions.workspaceId,
      set: {
        plan: input.plan,
        status: input.status,
        currentPeriodEnd: input.currentPeriodEnd,
        stripeCustomerId: input.stripeCustomerId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        updatedAt: new Date(),
      },
    });
}

/** True the first time an event id is seen; false on a replay. */
export async function claimStripeEvent(eventId: string): Promise<boolean> {
  const rows = await db
    .insert(processedStripeEvents)
    .values({ id: eventId })
    .onConflictDoNothing()
    .returning({ id: processedStripeEvents.id });
  return rows.length > 0;
}

/* ── AI usage and the lab's own key ─────────────────────────────────────── */

/** One AI request, counted against the month once it has been made. */
export async function recordAiUse(s: SessionContext, feature: string, ownKey: boolean) {
  await db.insert(aiUsage).values({ workspaceId: s.workspaceId, userId: s.userId, feature, ownKey });
}

/** The lab's own Anthropic key, or null when it has none or it cannot be read. */
export async function getLabAiKey(s: SessionContext): Promise<string | null> {
  const rows = await db
    .select({ enc: workspaces.anthropicKeyEnc })
    .from(workspaces)
    .where(eq(workspaces.id, s.workspaceId));
  return openSecret(rows[0]?.enc);
}

/** What Settings may show: the last four characters, and whether it still decrypts. */
export async function labAiKeyStatus(s: SessionContext): Promise<{ hint: string; readable: boolean } | null> {
  const rows = await db
    .select({ enc: workspaces.anthropicKeyEnc, hint: workspaces.anthropicKeyHint })
    .from(workspaces)
    .where(eq(workspaces.id, s.workspaceId));
  const row = rows[0];
  if (!row?.enc) return null;
  return { hint: row.hint ?? '', readable: openSecret(row.enc) !== null };
}

/** Stores (or with null, removes) the lab's own key. Owners and admins only. */
export async function setLabAiKey(s: SessionContext, apiKey: string | null) {
  if (s.role === 'member') throw new MembershipRefusedError('Only an owner or admin can change the lab\'s Claude key.');
  await db
    .update(workspaces)
    .set(
      apiKey
        ? { anthropicKeyEnc: seal(apiKey), anthropicKeyHint: apiKey.slice(-4) }
        : { anthropicKeyEnc: null, anthropicKeyHint: null },
    )
    .where(eq(workspaces.id, s.workspaceId));
  await logActivity(s, {
    action: apiKey ? 'added' : 'removed',
    subjectType: 'setting',
    label: apiKey ? `the lab's own Claude key (…${apiKey.slice(-4)})` : "the lab's own Claude key",
  });
}

/** Counts the free tier is measured against. */
export async function usageCounts(s: SessionContext) {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [projectRows, experimentRows, storageRows, aiRows] = await Promise.all([
    // The worked example never counts against the plan. A free workspace
    // whose one allowed project was spent on a demo could never record its
    // own work, which would make the example worse than nothing.
    db
      .select({ n: count() })
      .from(projects)
      .where(and(eq(projects.workspaceId, s.workspaceId), eq(projects.isExample, false))),
    db
      .select({ n: count() })
      .from(experiments)
      .innerJoin(projects, eq(projects.id, experiments.projectId))
      .where(and(eq(experiments.workspaceId, s.workspaceId), eq(projects.isExample, false))),
    db
      .select({ bytes: sql<number>`coalesce(sum(byte_size), 0)::bigint` })
      .from(files)
      .where(eq(files.workspaceId, s.workspaceId)),
    // Requests made with the lab's own key are the lab's own bill, so they
    // never count against the plan's allowance.
    db
      .select({ n: count() })
      .from(aiUsage)
      .where(
        and(
          eq(aiUsage.workspaceId, s.workspaceId),
          eq(aiUsage.ownKey, false),
          gt(aiUsage.createdAt, monthStart),
        ),
      ),
  ]);

  return {
    projects: projectRows[0]?.n ?? 0,
    experiments: experimentRows[0]?.n ?? 0,
    storageBytes: Number(storageRows[0]?.bytes ?? 0),
    aiThisMonth: aiRows[0]?.n ?? 0,
  };
}

/* ── 17. inventory ──────────────────────────────────────────────────────── */

/**
 * Stock is kept for traceability first and purchasing second. Every read here
 * carries the lots, because "how much is left" and "which bottle was it" are
 * the same question asked by two different people.
 */
export async function listInventory(s: SessionContext) {
  const items = await db
    .select({
      id: inventoryItems.id,
      name: inventoryItems.name,
      category: inventoryItems.category,
      supplier: inventoryItems.supplier,
      catalogNumber: inventoryItems.catalogNumber,
      unit: inventoryItems.unit,
      reorderAt: inventoryItems.reorderAt,
      storage: inventoryItems.storage,
      notes: inventoryItems.notes,
      onHand: sql<string>`coalesce((
        select sum(l.quantity) from "inventory_lots" l where l.item_id = inventory_items.id
      ), 0)`,
      lotCount: sql<number>`(
        select count(*)::int from "inventory_lots" l where l.item_id = inventory_items.id
      )`,
      nextExpiry: sql<string | null>`(
        select min(l.expires_on) from "inventory_lots" l
        where l.item_id = inventory_items.id and l.quantity > 0
      )`,
      runsUsing: sql<number>`(
        select count(distinct el.experiment_id)::int
        from "experiment_lots" el
        join "inventory_lots" l on l.id = el.lot_id
        where l.item_id = inventory_items.id
      )`,
    })
    .from(inventoryItems)
    .where(eq(inventoryItems.workspaceId, s.workspaceId))
    .orderBy(inventoryItems.name);
  return items;
}

export async function getInventoryItem(s: SessionContext, itemId: string) {
  assertId(itemId, 'Item');
  const rows = await db
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.workspaceId, s.workspaceId)))
    .limit(1);
  const item = assertFound(rows[0], 'Item');

  const lots = await db
    .select({
      id: inventoryLots.id,
      lotCode: inventoryLots.lotCode,
      quantity: inventoryLots.quantity,
      receivedOn: inventoryLots.receivedOn,
      expiresOn: inventoryLots.expiresOn,
      openedOn: inventoryLots.openedOn,
      runsUsing: sql<number>`(
        select count(*)::int from "experiment_lots" el where el.lot_id = inventory_lots.id
      )`,
    })
    .from(inventoryLots)
    .where(and(eq(inventoryLots.itemId, itemId), eq(inventoryLots.workspaceId, s.workspaceId)))
    .orderBy(desc(inventoryLots.createdAt));

  // Which runs consumed this item, newest first. This is the answer to "what
  // else used that bottle" when a lot turns out to be bad.
  const usage = await db
    .select({
      experimentId: experiments.id,
      number: experiments.number,
      title: experiments.title,
      performedOn: experiments.performedOn,
      projectId: experiments.projectId,
      projectName: projects.name,
      lotCode: inventoryLots.lotCode,
      quantity: experimentLots.quantity,
    })
    .from(experimentLots)
    .innerJoin(inventoryLots, eq(inventoryLots.id, experimentLots.lotId))
    .innerJoin(experiments, eq(experiments.id, experimentLots.experimentId))
    .leftJoin(projects, eq(projects.id, experiments.projectId))
    .where(and(eq(inventoryLots.itemId, itemId), eq(experimentLots.workspaceId, s.workspaceId)))
    .orderBy(desc(experiments.number));

  return { item, lots, usage };
}

export async function createInventoryItem(
  s: SessionContext,
  input: {
    name: string;
    category?: string | null;
    supplier?: string | null;
    catalogNumber?: string | null;
    unit?: string | null;
    reorderAt?: string | null;
    storage?: string | null;
    notes?: string | null;
  },
) {
  const rows = await db
    .insert(inventoryItems)
    .values({
      workspaceId: s.workspaceId,
      name: input.name,
      category: input.category ?? null,
      supplier: input.supplier ?? null,
      catalogNumber: input.catalogNumber ?? null,
      unit: input.unit?.trim() || 'unit',
      reorderAt: input.reorderAt ?? null,
      storage: input.storage ?? null,
      notes: input.notes ?? null,
    })
    .returning({ id: inventoryItems.id });
  return rows[0]!.id;
}

export async function updateInventoryItem(
  s: SessionContext,
  itemId: string,
  input: Partial<{
    name: string;
    category: string | null;
    supplier: string | null;
    catalogNumber: string | null;
    unit: string;
    reorderAt: string | null;
    storage: string | null;
    notes: string | null;
  }>,
) {
  assertId(itemId, 'Item');
  const rows = await db
    .update(inventoryItems)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.workspaceId, s.workspaceId)))
    .returning({ id: inventoryItems.id });
  return assertFound(rows[0], 'Item').id;
}

export async function deleteInventoryItem(s: SessionContext, itemId: string) {
  assertId(itemId, 'Item');
  const rows = await db
    .delete(inventoryItems)
    .where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.workspaceId, s.workspaceId)))
    .returning({ id: inventoryItems.id });
  return assertFound(rows[0], 'Item').id;
}

export async function addInventoryLot(
  s: SessionContext,
  itemId: string,
  input: {
    lotCode: string;
    quantity?: string | null;
    receivedOn?: string | null;
    expiresOn?: string | null;
    openedOn?: string | null;
  },
) {
  assertId(itemId, 'Item');
  // Scope check before writing: the lot inherits the item's workspace, so an
  // item from another workspace must never reach the insert.
  const owner = await db
    .select({ id: inventoryItems.id })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.id, itemId), eq(inventoryItems.workspaceId, s.workspaceId)))
    .limit(1);
  assertFound(owner[0], 'Item');

  const rows = await db
    .insert(inventoryLots)
    .values({
      workspaceId: s.workspaceId,
      itemId,
      lotCode: input.lotCode,
      quantity: input.quantity ?? '0',
      receivedOn: input.receivedOn ?? null,
      expiresOn: input.expiresOn ?? null,
      openedOn: input.openedOn ?? null,
    })
    .returning({ id: inventoryLots.id });
  return rows[0]!.id;
}

export async function adjustLotQuantity(s: SessionContext, lotId: string, quantity: string) {
  assertId(lotId, 'Lot');
  const rows = await db
    .update(inventoryLots)
    .set({ quantity, updatedAt: new Date() })
    .where(and(eq(inventoryLots.id, lotId), eq(inventoryLots.workspaceId, s.workspaceId)))
    .returning({ id: inventoryLots.id });
  return assertFound(rows[0], 'Lot').id;
}

export async function deleteInventoryLot(s: SessionContext, lotId: string) {
  assertId(lotId, 'Lot');
  const rows = await db
    .delete(inventoryLots)
    .where(and(eq(inventoryLots.id, lotId), eq(inventoryLots.workspaceId, s.workspaceId)))
    .returning({ id: inventoryLots.id });
  return assertFound(rows[0], 'Lot').id;
}

/** Lots recorded against one run, for the experiment page. */
export async function lotsForExperiment(s: SessionContext, experimentId: string) {
  assertId(experimentId, 'Experiment');
  return db
    .select({
      id: experimentLots.id,
      lotId: inventoryLots.id,
      lotCode: inventoryLots.lotCode,
      quantity: experimentLots.quantity,
      itemId: inventoryItems.id,
      itemName: inventoryItems.name,
      supplier: inventoryItems.supplier,
      catalogNumber: inventoryItems.catalogNumber,
      unit: inventoryItems.unit,
      expiresOn: inventoryLots.expiresOn,
    })
    .from(experimentLots)
    .innerJoin(inventoryLots, eq(inventoryLots.id, experimentLots.lotId))
    .innerJoin(inventoryItems, eq(inventoryItems.id, inventoryLots.itemId))
    .where(
      and(
        eq(experimentLots.experimentId, experimentId),
        eq(experimentLots.workspaceId, s.workspaceId),
      ),
    )
    .orderBy(inventoryItems.name);
}

export async function recordLotUse(
  s: SessionContext,
  experimentId: string,
  lotId: string,
  quantity: string | null,
) {
  assertId(experimentId, 'Experiment');
  assertId(lotId, 'Lot');
  // Both sides must belong to this workspace before they are joined.
  const [run, lot] = await Promise.all([
    db
      .select({ id: experiments.id })
      .from(experiments)
      .where(and(eq(experiments.id, experimentId), eq(experiments.workspaceId, s.workspaceId)))
      .limit(1),
    db
      .select({ id: inventoryLots.id })
      .from(inventoryLots)
      .where(and(eq(inventoryLots.id, lotId), eq(inventoryLots.workspaceId, s.workspaceId)))
      .limit(1),
  ]);
  assertFound(run[0], 'Experiment');
  assertFound(lot[0], 'Lot');

  await db
    .insert(experimentLots)
    .values({ workspaceId: s.workspaceId, experimentId, lotId, quantity })
    .onConflictDoUpdate({
      target: [experimentLots.experimentId, experimentLots.lotId],
      set: { quantity },
    });
}

export async function removeLotUse(s: SessionContext, experimentId: string, lotId: string) {
  assertId(experimentId, 'Experiment');
  assertId(lotId, 'Lot');
  await db
    .delete(experimentLots)
    .where(
      and(
        eq(experimentLots.experimentId, experimentId),
        eq(experimentLots.lotId, lotId),
        eq(experimentLots.workspaceId, s.workspaceId),
      ),
    );
}

/** Every lot available to record against a run, grouped by item. */
export async function lotOptions(s: SessionContext) {
  return db
    .select({
      lotId: inventoryLots.id,
      lotCode: inventoryLots.lotCode,
      quantity: inventoryLots.quantity,
      expiresOn: inventoryLots.expiresOn,
      itemId: inventoryItems.id,
      itemName: inventoryItems.name,
      unit: inventoryItems.unit,
    })
    .from(inventoryLots)
    .innerJoin(inventoryItems, eq(inventoryItems.id, inventoryLots.itemId))
    .where(eq(inventoryLots.workspaceId, s.workspaceId))
    .orderBy(inventoryItems.name, desc(inventoryLots.createdAt));
}

/* ── 18. deletions the privacy statement promises ───────────────────────── */

/**
 * Removes a sample.
 *
 * A sample recorded against a run is refused rather than silently unlinked:
 * deleting it would leave the experiment claiming a sample that no longer
 * exists, which is a worse record than a sample you have to detach first.
 */
export async function deleteSample(s: SessionContext, sampleId: string) {
  assertId(sampleId, 'Sample');
  const used = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(experimentSamples)
    .where(eq(experimentSamples.sampleId, sampleId));
  if ((used[0]?.n ?? 0) > 0) {
    throw new InUseError(
      'This sample is recorded against an experiment. Remove it from that run first.',
    );
  }
  const rows = await db
    .delete(samples)
    .where(and(eq(samples.id, sampleId), eq(samples.workspaceId, s.workspaceId)))
    .returning({ id: samples.id });
  return assertFound(rows[0], 'Sample').id;
}

/**
 * Removes a file and anything derived from it.
 *
 * The row goes first and returns the storage key, so a failure to unlink the
 * bytes cannot leave a row pointing at nothing. The reverse order can strand a
 * record whose file is already gone, which is the worse of the two.
 */
export async function deleteFile(s: SessionContext, fileId: string) {
  assertId(fileId, 'File');
  const rows = await db
    .delete(files)
    .where(and(eq(files.id, fileId), fileVisibleTo(s)))
    .returning({ id: files.id, storageKey: files.storageKey, filename: files.filename, private: files.private, isDocument: files.isDocument });
  const row = assertFound(rows[0], 'File');
  if (!row.private) {
    await logActivity(s, {
      action: 'deleted',
      subjectType: row.isDocument ? 'document' : 'file',
      subjectId: row.id,
      label: row.isDocument ? row.filename.replace(/\.md$/i, '') : row.filename,
    });
  }
  return row;
}

/* ── pilot feedback ─────────────────────────────────────────────────────── */

/**
 * Records what this person says about paying for Labquill.
 *
 * Keyed on the workspace and the person, so answering twice replaces the first
 * answer rather than stacking. Someone who changes their mind after two weeks
 * of use is giving you a better answer than the one they gave on day one.
 */
export async function savePilotFeedback(
  s: SessionContext,
  input: {
    wouldPay: string;
    monthlyValue: number | null;
    blocker: string | null;
    decisionMaker: string | null;
  },
) {
  await db
    .insert(pilotFeedback)
    .values({ workspaceId: s.workspaceId, userId: s.userId, ...input })
    .onConflictDoUpdate({
      target: [pilotFeedback.workspaceId, pilotFeedback.userId],
      set: { ...input, updatedAt: new Date() },
    });
}

/** This person's own answer, so the form comes back filled in rather than blank. */
export async function myPilotFeedback(s: SessionContext) {
  const rows = await db
    .select()
    .from(pilotFeedback)
    .where(
      and(eq(pilotFeedback.workspaceId, s.workspaceId), eq(pilotFeedback.userId, s.userId)),
    )
    .limit(1);
  return rows[0] ?? null;
}

/* ── links into another of your labs ───────────────────────────────────── */

const UUID_IN_PATH = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Which other lab of this person's holds the record a link points at.
 *
 * Someone in two labs opens a link from the one they are not looking at, a
 * pasted URL or an email, and every page answers "not in this lab", which is
 * true and useless: they are in that lab. This finds it so the not-found page
 * can offer to switch.
 *
 * The one read here that is not scoped to session.workspaceId, and it is
 * scoped tighter instead: only labs the person is a member of, and only the
 * lab's id and name come back. Nothing of the record itself is read.
 */
export async function findLinkInMyOtherLabs(
  s: Pick<SessionContext, 'userId' | 'workspaceId'>,
  path: string,
): Promise<{ workspaceId: string; workspaceName: string } | null> {
  const ids = [...new Set(path.match(UUID_IN_PATH) ?? [])].slice(0, 3);
  if (ids.length === 0) return null;
  const list = sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);
  const rows = await db.execute<{ workspace_id: string; name: string }>(sql`
    select w.id as workspace_id, w.name
    from (
      select workspace_id from projects where id in (${list})
      union all select workspace_id from experiments where id in (${list})
      union all select workspace_id from protocols where id in (${list})
      union all select workspace_id from samples where id in (${list})
      union all select workspace_id from tasks where id in (${list})
      union all select workspace_id from files where id in (${list})
      union all select workspace_id from datasets where id in (${list})
      union all select workspace_id from research_updates where id in (${list})
      union all select workspace_id from inventory_items where id in (${list})
    ) found
    join workspace_members m on m.workspace_id = found.workspace_id and m.user_id = ${s.userId}
    join workspaces w on w.id = found.workspace_id
    where found.workspace_id <> ${s.workspaceId}
    limit 1
  `);
  const row = rows.rows[0];
  return row ? { workspaceId: row.workspace_id, workspaceName: row.name } : null;
}

