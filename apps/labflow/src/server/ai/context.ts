import { and, desc, eq, ne } from 'drizzle-orm';
import { db } from '@/db';
import { datasetColumns, datasets, experiments } from '@/db/schema';
import { experimentCode, formatDate } from '@/lib/display';
import { formatStat } from '@/lib/dataset';
import type { SessionContext } from '../auth';
import * as q from '../queries';

/*
 * Retrieval layer.
 *
 * The model never sees the database. It sees a bounded, plain-text rendering of
 * the specific records that were retrieved for this question, plus the list of
 * evidence ids the UI links back to.
 */

export type Evidence = { type: string; id: string; label: string };

/** Hard ceiling on how many related records go into one prompt. */
const MAX_RELATED = 4;

function renderRecord(record: q.ExperimentRecord, options: { full: boolean }): string {
  const { experiment: e, conditions, samples, result, notes } = record;
  const lines = [
    `${experimentCode(e.number)} — ${e.title}`,
    `Status: ${e.status}`,
    `Date: ${formatDate(e.performedOn)}`,
    `Researcher: ${e.researcherName ?? 'not recorded'}`,
    `Protocol: ${e.protocolName ? `${e.protocolName} v${e.protocolVersion}` : 'not recorded'}`,
    `Objective: ${e.objective ?? 'not recorded'}`,
    `Hypothesis: ${e.hypothesis ?? 'not recorded'}`,
    `Conditions: ${
      conditions.length > 0
        ? conditions.map((c) => `${c.name}=${c.value}${c.unit ? ` ${c.unit}` : ''}`).join('; ')
        : 'not recorded'
    }`,
    `Samples: ${samples.length > 0 ? samples.map((s) => s.code).join(', ') : 'not recorded'}`,
    `Result summary: ${result?.summary ?? 'not recorded'}`,
    `Observations: ${result?.observations ?? 'not recorded'}`,
    `Conclusion: ${result?.conclusion ?? 'not recorded'}`,
    `Next steps: ${result?.nextSteps ?? 'not recorded'}`,
  ];
  if (options.full && e.protocolNotes) lines.push(`Protocol deviations: ${e.protocolNotes}`);
  if (options.full && notes.length > 0) {
    lines.push('Researcher notes:');
    for (const note of notes.slice(0, 8)) lines.push(`- ${note.body.slice(0, 600)}`);
  }
  return lines.join('\n');
}

/** Column-level descriptions of attached data — never the raw rows. */
async function renderDatasets(experimentId: string): Promise<string> {
  const rows = await db
    .select({
      datasetName: datasets.name,
      rowCount: datasets.rowCount,
      column: datasetColumns.name,
      isNumeric: datasetColumns.isNumeric,
      stats: datasetColumns.stats,
    })
    .from(datasets)
    .leftJoin(datasetColumns, eq(datasetColumns.datasetId, datasets.id))
    .where(eq(datasets.experimentId, experimentId))
    .orderBy(datasets.createdAt, datasetColumns.position);

  if (rows.length === 0) return 'No parsed datasets are attached to this experiment.';

  return rows
    .map((r) => {
      if (!r.column) return `${r.datasetName} (${r.rowCount} rows): no columns parsed`;
      const s = r.stats;
      const detail =
        r.isNumeric && s
          ? `n=${s.count}, missing=${s.missing}, min=${formatStat(s.min)}, max=${formatStat(s.max)}, mean=${formatStat(s.mean)}, sd=${formatStat(s.stdDev)}`
          : `text column, n=${s?.count ?? 0}, missing=${s?.missing ?? 0}`;
      return `${r.datasetName} · ${r.column}: ${detail}`;
    })
    .join('\n');
}

export async function buildExperimentContext(s: SessionContext, experimentId: string) {
  const record = await q.getExperimentRecord(s, experimentId);
  const { experiment } = record;

  // Related runs: same project, most recent first, excluding this one.
  const relatedRows = await db
    .select({ id: experiments.id })
    .from(experiments)
    .where(
      and(
        eq(experiments.workspaceId, s.workspaceId),
        eq(experiments.projectId, experiment.projectId),
        ne(experiments.id, experimentId),
      ),
    )
    .orderBy(desc(experiments.number))
    .limit(MAX_RELATED);

  const related = await Promise.all(
    relatedRows.map((row) => q.getExperimentRecord(s, row.id)),
  );

  const evidence: Evidence[] = [
    {
      type: 'experiment',
      id: experiment.id,
      label: `${experimentCode(experiment.number)} — ${experiment.title}`,
    },
    ...related.map((r) => ({
      type: 'experiment',
      id: r.experiment.id,
      label: `${experimentCode(r.experiment.number)} — ${r.experiment.title}`,
    })),
  ];

  const context = [
    `PROJECT: ${experiment.projectName}`,
    `RESEARCH QUESTION: ${experiment.researchQuestion ?? 'not recorded'}`,
    '',
    'EXPERIMENT UNDER ANALYSIS',
    renderRecord(record, { full: true }),
    '',
    'ATTACHED DATA (descriptive statistics only)',
    await renderDatasets(experiment.id),
    '',
    related.length > 0 ? 'PREVIOUS EXPERIMENTS IN THIS PROJECT' : 'No previous experiments recorded.',
    ...related.map((r) => renderRecord(r, { full: false })),
  ].join('\n');

  return { record, context, evidence };
}

/**
 * For a project question, retrieve only the experiments whose text matches the
 * question, falling back to the most recent runs when nothing matches.
 */
export async function buildProjectContext(s: SessionContext, projectId: string, question: string) {
  const project = await q.getProject(s, projectId);
  const all = await q.listExperiments(s, { projectId });

  const terms = question
    .toLowerCase()
    .split(/[^a-z0-9.-]+/)
    .filter((t) => t.length > 2);

  const scored = all
    .map((e) => {
      const haystack = `${experimentCode(e.number)} ${e.title} ${e.objective ?? ''} ${e.protocolName ?? ''}`.toLowerCase();
      return { e, score: terms.filter((t) => haystack.includes(t)).length };
    })
    .sort((a, b) => b.score - a.score || b.e.number - a.e.number);

  const matched = scored.filter((row) => row.score > 0).slice(0, 8);
  const chosen = (matched.length > 0 ? matched : scored.slice(0, 6)).map((row) => row.e);

  const records = await Promise.all(chosen.map((e) => q.getExperimentRecord(s, e.id)));

  const evidence: Evidence[] = records.map((r) => ({
    type: 'experiment',
    id: r.experiment.id,
    label: `${experimentCode(r.experiment.number)} — ${r.experiment.title}`,
  }));

  const context = [
    `PROJECT: ${project.name}`,
    `RESEARCH QUESTION: ${project.researchQuestion ?? 'not recorded'}`,
    `TOTAL EXPERIMENTS IN PROJECT: ${all.length}`,
    `RECORDS PROVIDED BELOW: ${records.length}`,
    '',
    ...records.map((r) => `---\n${renderRecord(r, { full: true })}`),
  ].join('\n');

  return { project, context, evidence, retrievedCount: records.length, totalCount: all.length };
}
