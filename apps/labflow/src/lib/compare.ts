/**
 * Experiment comparison.
 *
 * Builds a field-by-field table across the selected runs and marks the rows
 * where the record actually differs. It reports documented differences only —
 * a row that reads the same across two runs means the same thing was written
 * down, not that the two runs were identical.
 */

export type ComparableExperiment = {
  id: string;
  number: number;
  title: string;
  status: string;
  performedOn: Date | string | null;
  researcherName: string | null;
  objective: string | null;
  hypothesis: string | null;
  protocolName: string | null;
  protocolVersion: number | null;
  conditions: { name: string; value: string; unit: string | null }[];
  sampleCodes: string[];
  summary: string | null;
  observations: string | null;
  conclusion: string | null;
  nextSteps: string | null;
};

export type ComparisonRow = {
  key: string;
  label: string;
  group: 'Setup' | 'Conditions' | 'Outcome';
  /** One cell per experiment, in the order given. */
  values: (string | null)[];
  /** True when at least two experiments have different recorded values. */
  differs: boolean;
};

function markDiffering(row: Omit<ComparisonRow, 'differs'>): ComparisonRow {
  const normalised = row.values.map((v) => (v ?? '').trim());
  const differs = new Set(normalised).size > 1;
  return { ...row, differs };
}

export function buildComparison(experiments: ComparableExperiment[]): ComparisonRow[] {
  if (experiments.length === 0) return [];

  const conditionNames = Array.from(
    new Set(experiments.flatMap((e) => e.conditions.map((c) => c.name))),
  ).sort((a, b) => a.localeCompare(b));

  const setup: ComparisonRow[] = [
    markDiffering({
      key: 'objective',
      label: 'Objective',
      group: 'Setup',
      values: experiments.map((e) => e.objective),
    }),
    markDiffering({
      key: 'hypothesis',
      label: 'Hypothesis',
      group: 'Setup',
      values: experiments.map((e) => e.hypothesis),
    }),
    markDiffering({
      key: 'status',
      label: 'Status',
      group: 'Setup',
      values: experiments.map((e) => e.status),
    }),
    markDiffering({
      key: 'protocol',
      label: 'Protocol',
      group: 'Setup',
      values: experiments.map((e) =>
        e.protocolName ? `${e.protocolName} v${e.protocolVersion ?? '?'}` : null,
      ),
    }),
    markDiffering({
      key: 'researcher',
      label: 'Researcher',
      group: 'Setup',
      values: experiments.map((e) => e.researcherName),
    }),
    markDiffering({
      key: 'samples',
      label: 'Samples',
      group: 'Setup',
      values: experiments.map((e) => (e.sampleCodes.length > 0 ? e.sampleCodes.join(', ') : null)),
    }),
  ];

  const conditions = conditionNames.map((name) =>
    markDiffering({
      key: `condition:${name}`,
      label: name,
      group: 'Conditions',
      values: experiments.map((e) => {
        const match = e.conditions.find((c) => c.name === name);
        if (!match) return null;
        return match.unit ? `${match.value} ${match.unit}` : match.value;
      }),
    }),
  );

  const outcome: ComparisonRow[] = (
    [
      ['summary', 'Result summary'],
      ['observations', 'Observations'],
      ['conclusion', 'Conclusion'],
      ['nextSteps', 'Next steps'],
    ] as const
  ).map(([key, label]) =>
    markDiffering({
      key,
      label,
      group: 'Outcome',
      values: experiments.map((e) => e[key]),
    }),
  );

  return [...setup, ...conditions, ...outcome];
}

/** "25 °C → 25 °C → 30 °C" — the compact form used in summaries. */
export function changeTrail(values: (string | null)[]): string {
  return values.map((v) => (v?.trim() ? v : '—')).join(' → ');
}
