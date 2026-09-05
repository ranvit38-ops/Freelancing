import { buildComparison, changeTrail, type ComparableExperiment } from './compare';
import { experimentCode, formatDate } from './display';

/**
 * Builds the first draft of a research update from the record.
 *
 * Nothing here is generated prose: every section is assembled from what the
 * researchers actually wrote. Sections are tagged with where the text came
 * from, and the tag survives all the way into the exported deck so an audience
 * can tell data from interpretation.
 */

export type SectionSource = 'record' | 'researcher' | 'ai';

export type UpdateSection = {
  heading: string;
  body: string;
  source: SectionSource;
};

export const sourceLabel: Record<SectionSource, string> = {
  record: 'From the record',
  researcher: 'Researcher’s words',
  ai: 'AI-generated observation',
};

function joinLines(lines: (string | null | undefined)[]): string {
  return lines.filter((l): l is string => Boolean(l?.trim())).join('\n');
}

function bullets(
  experiments: ComparableExperiment[],
  pick: (e: ComparableExperiment) => string | null,
): string {
  return joinLines(
    experiments.map((e) => {
      const value = pick(e);
      return value?.trim() ? `${experimentCode(e.number)}: ${value.trim()}` : null;
    }),
  );
}

export function buildUpdateDraft(
  project: { name: string; researchQuestion: string | null; description: string | null },
  experiments: ComparableExperiment[],
): UpdateSection[] {
  const comparison = buildComparison(experiments);
  const differing = comparison.filter((row) => row.differs);

  const conditionLines = comparison
    .filter((row) => row.group === 'Conditions')
    .map((row) => `${row.label}: ${changeTrail(row.values)}`);

  const differenceLines = differing.map((row) => `${row.label}: ${changeTrail(row.values)}`);

  return [
    {
      heading: 'Research question',
      body: project.researchQuestion ?? project.description ?? 'Not recorded for this project.',
      source: 'record',
    },
    {
      heading: 'Objectives',
      body: bullets(experiments, (e) => e.objective) || 'No objectives recorded.',
      source: 'record',
    },
    {
      heading: 'Hypotheses',
      body: bullets(experiments, (e) => e.hypothesis) || 'No hypotheses recorded.',
      source: 'record',
    },
    {
      heading: 'Experimental approach',
      body:
        joinLines(
          experiments.map(
            (e) =>
              `${experimentCode(e.number)} — ${e.title} (${formatDate(e.performedOn)}${
                e.protocolName ? `, ${e.protocolName} v${e.protocolVersion ?? '?'}` : ''
              })`,
          ),
        ) || 'No experiments selected.',
      source: 'record',
    },
    {
      heading: 'Experimental conditions',
      body: joinLines(conditionLines) || 'No conditions recorded on the selected experiments.',
      source: 'record',
    },
    {
      heading: 'Results',
      body: bullets(experiments, (e) => e.summary) || 'No result summaries recorded.',
      source: 'researcher',
    },
    {
      heading: 'Comparison with previous experiments',
      body:
        joinLines(differenceLines) ||
        (experiments.length < 2
          ? 'Only one experiment was selected, so there is nothing to compare.'
          : 'The selected experiments record no differing values.'),
      source: 'record',
    },
    {
      heading: 'Problems and unexpected observations',
      body: bullets(experiments, (e) => e.observations) || 'No unexpected observations recorded.',
      source: 'researcher',
    },
    {
      heading: 'Interpretation',
      body: bullets(experiments, (e) => e.conclusion) || 'No conclusions recorded yet.',
      source: 'researcher',
    },
    {
      heading: 'Next steps',
      body: bullets(experiments, (e) => e.nextSteps) || 'No next steps recorded.',
      source: 'researcher',
    },
  ];
}

/** Default title, e.g. "PFAS Removal Study — EXP-004 to EXP-006". */
export function defaultUpdateTitle(
  projectName: string,
  experiments: { number: number }[],
): string {
  if (experiments.length === 0) return projectName;
  const numbers = experiments.map((e) => e.number).sort((a, b) => a - b);
  const first = numbers[0]!;
  const last = numbers[numbers.length - 1]!;
  return first === last
    ? `${projectName} — ${experimentCode(first)}`
    : `${projectName} — ${experimentCode(first)} to ${experimentCode(last)}`;
}
