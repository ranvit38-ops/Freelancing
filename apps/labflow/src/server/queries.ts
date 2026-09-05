import { and, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  aiGenerations,
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
  protocols,
  researchUpdates,
  samples,
  users,
  workspaceMembers,
} from '@/db/schema';
import type { SessionContext } from './auth';
import { NotFoundInWorkspaceError, assertFound } from './not-found';

/*
 * Every function here takes the caller's SessionContext and filters on
 * s.workspaceId. There is no "get by id" that skips that predicate — that is
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
  return assertFound(rows[0], 'Project').id;
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
  const rows = await db
    .update(projects)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, s.workspaceId)))
    .returning({ id: projects.id });
  assertFound(rows[0], 'Project');
}

export async function deleteProject(s: SessionContext, projectId: string) {
  const rows = await db
    .delete(projects)
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, s.workspaceId)))
    .returning({ id: projects.id });
  assertFound(rows[0], 'Project');
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
  const rows = await db
    .select({ max: sql<number | null>`max(${experiments.number})` })
    .from(experiments)
    .where(and(eq(experiments.projectId, projectId), eq(experiments.workspaceId, s.workspaceId)));
  return (rows[0]?.max ?? 0) + 1;
}

export async function getExperiment(s: SessionContext, experimentId: string) {
  const rows = await db
    .select({
      id: experiments.id,
      number: experiments.number,
      title: experiments.title,
      status: experiments.status,
      objective: experiments.objective,
      hypothesis: experiments.hypothesis,
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
    performedOn: Date | null;
    status: 'planned' | 'in_progress' | 'completed' | 'repeated' | 'needs_investigation';
    protocolVersionId: string | null;
    protocolNotes: string | null;
    repeatsExperimentId: string | null;
  },
) {
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
  return assertFound(rows[0], 'Experiment').id;
}

export async function updateExperiment(
  s: SessionContext,
  experimentId: string,
  input: Partial<{
    title: string;
    objective: string | null;
    hypothesis: string | null;
    performedOn: Date | null;
    status: 'planned' | 'in_progress' | 'completed' | 'repeated' | 'needs_investigation';
    protocolVersionId: string | null;
    protocolNotes: string | null;
    repeatsExperimentId: string | null;
  }>,
) {
  const rows = await db
    .update(experiments)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(experiments.id, experimentId), eq(experiments.workspaceId, s.workspaceId)))
    .returning({ id: experiments.id });
  assertFound(rows[0], 'Experiment');
}

export async function deleteExperiment(s: SessionContext, experimentId: string) {
  const rows = await db
    .delete(experiments)
    .where(and(eq(experiments.id, experimentId), eq(experiments.workspaceId, s.workspaceId)))
    .returning({ id: experiments.id });
  assertFound(rows[0], 'Experiment');
}

export async function replaceConditions(
  s: SessionContext,
  experimentId: string,
  rows: { name: string; value: string; unit: string | null }[],
) {
  await getExperiment(s, experimentId);
  await db.delete(experimentConditions).where(eq(experimentConditions.experimentId, experimentId));
  if (rows.length === 0) return;
  await db
    .insert(experimentConditions)
    .values(rows.map((r, i) => ({ ...r, experimentId, position: i })));
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
  await getExperiment(s, experimentId);
  await db
    .insert(experimentResults)
    .values({ experimentId, ...input })
    .onConflictDoUpdate({
      target: experimentResults.experimentId,
      set: { ...input, updatedAt: new Date() },
    });
}

export async function addNote(s: SessionContext, experimentId: string, body: string) {
  await getExperiment(s, experimentId);
  await db.insert(experimentNotes).values({ experimentId, body, authorId: s.userId });
}

export async function deleteNote(s: SessionContext, experimentId: string, noteId: string) {
  await getExperiment(s, experimentId);
  await db
    .delete(experimentNotes)
    .where(and(eq(experimentNotes.id, noteId), eq(experimentNotes.experimentId, experimentId)));
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
  await getExperiment(s, experimentId);
  await db.delete(experimentSamples).where(eq(experimentSamples.experimentId, experimentId));
  if (sampleIds.length === 0) return;
  await db
    .insert(experimentSamples)
    .values(sampleIds.map((sampleId) => ({ experimentId, sampleId })))
    .onConflictDoNothing();
}

export async function experimentsForSample(s: SessionContext, sampleId: string) {
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
    })
    .from(protocolVersions)
    .leftJoin(users, eq(users.id, protocolVersions.createdById))
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
  input: { name: string; description: string | null; projectId: string | null; body: string | null },
) {
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
    changeNote: 'Initial version',
    createdById: s.userId,
  });
  return protocolId;
}

export async function addProtocolVersion(
  s: SessionContext,
  protocolId: string,
  input: { body: string | null; changeNote: string },
) {
  const { versions } = await getProtocolWithVersions(s, protocolId);
  const next = (versions[0]?.version ?? 0) + 1;
  await db.insert(protocolVersions).values({
    protocolId,
    version: next,
    body: input.body,
    changeNote: input.changeNote,
    createdById: s.userId,
  });
  return next;
}

/* ── files ──────────────────────────────────────────────────────────────── */

export async function recordFile(
  s: SessionContext,
  input: { filename: string; contentType: string; byteSize: number; storageKey: string },
) {
  const rows = await db
    .insert(files)
    .values({ ...input, workspaceId: s.workspaceId, uploadedById: s.userId })
    .returning({ id: files.id });
  return assertFound(rows[0], 'File').id;
}

export async function attachFileToExperiment(
  s: SessionContext,
  experimentId: string,
  fileId: string,
) {
  await getExperiment(s, experimentId);
  await db.insert(experimentFiles).values({ experimentId, fileId }).onConflictDoNothing();
}

export async function getFileForDownload(s: SessionContext, fileId: string) {
  const rows = await db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.workspaceId, s.workspaceId)))
    .limit(1);
  return assertFound(rows[0], 'File');
}

/* ── datasets ───────────────────────────────────────────────────────────── */

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
        .select({ id: files.id, filename: files.filename })
        .from(files)
        .where(and(eq(files.workspaceId, s.workspaceId), allTerms(files.filename)))
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
      href: `/api/files/${r.id}`,
      title: r.filename,
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

  // Completed experiments with no recorded conclusion — the documentation gap
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

  const [conditionRows, sampleRows] = await Promise.all([
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
    }));
}

/* ── research memory ────────────────────────────────────────────────────── */

/** Structured inputs for the deterministic research memory page. */
export async function memoryInputs(s: SessionContext, projectId: string) {
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
  const rows = await db
    .update(researchUpdates)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(researchUpdates.id, updateId), eq(researchUpdates.workspaceId, s.workspaceId)))
    .returning({ id: researchUpdates.id });
  assertFound(rows[0], 'Research update');
}

export async function deleteResearchUpdate(s: SessionContext, updateId: string) {
  const rows = await db
    .delete(researchUpdates)
    .where(and(eq(researchUpdates.id, updateId), eq(researchUpdates.workspaceId, s.workspaceId)))
    .returning({ id: researchUpdates.id });
  assertFound(rows[0], 'Research update');
}

/* ── connective views ───────────────────────────────────────────────────── */

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
 * This is the "where is that file?" view — but anchored to the experiment that
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
    })
    .from(files)
    .leftJoin(users, eq(users.id, files.uploadedById))
    .leftJoin(experimentFiles, eq(experimentFiles.fileId, files.id))
    .leftJoin(experiments, eq(experiments.id, experimentFiles.experimentId))
    .leftJoin(projects, eq(projects.id, experiments.projectId))
    .leftJoin(datasets, eq(datasets.fileId, files.id))
    .where(eq(files.workspaceId, s.workspaceId))
    .orderBy(desc(files.createdAt));
}

/** Which experiments used each version of a protocol. */
export async function protocolVersionUsage(s: SessionContext, protocolId: string) {
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
 * The first dataset among the given experiments that has two numeric columns —
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
  return assertFound(rows[0], 'Link').id;
}

/* ── discussion ─────────────────────────────────────────────────────────── */

export type DiscussionMessage = {
  id: string;
  body: string;
  createdAt: Date;
  authorId: string | null;
  authorName: string | null;
  parentId: string | null;
  replies: DiscussionMessage[];
};

/** Messages for one experiment or project, nested one level deep. */
export async function listDiscussion(
  s: SessionContext,
  scope: { experimentId?: string; projectId?: string },
): Promise<DiscussionMessage[]> {
  // An empty string is not a uuid; Postgres would reject the whole query.
  const target = scope.experimentId
    ? eq(discussions.experimentId, scope.experimentId)
    : scope.projectId
      ? eq(discussions.projectId, scope.projectId)
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
    })
    .from(discussions)
    .leftJoin(users, eq(users.id, discussions.authorId))
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

export async function postMessage(
  s: SessionContext,
  input: { experimentId?: string; projectId?: string; parentId: string | null; body: string },
) {
  // Confirms the target is in the caller's workspace before writing.
  if (input.experimentId) await getExperiment(s, input.experimentId);
  else if (input.projectId) await getProject(s, input.projectId);
  else throw new NotFoundInWorkspaceError('Discussion target');

  await db.insert(discussions).values({
    workspaceId: s.workspaceId,
    experimentId: input.experimentId ?? null,
    projectId: input.projectId ?? null,
    parentId: input.parentId,
    authorId: s.userId,
    body: input.body,
  });
}

export async function deleteMessage(s: SessionContext, messageId: string) {
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
  return db
    .select({
      id: literatureRefs.id,
      pmid: literatureRefs.pmid,
      title: literatureRefs.title,
      journal: literatureRefs.journal,
      year: literatureRefs.year,
      authors: literatureRefs.authors,
      note: literatureRefs.note,
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
  article: { pmid: string; title: string; journal: string | null; year: string | null; authors: string | null },
) {
  await getProject(s, projectId);
  await db
    .insert(literatureRefs)
    .values({ ...article, workspaceId: s.workspaceId, projectId, addedById: s.userId })
    .onConflictDoNothing({ target: [literatureRefs.projectId, literatureRefs.pmid] });
}

export async function removeLiterature(s: SessionContext, refId: string) {
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
