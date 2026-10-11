/**
 * Documentation completeness check.
 *
 * This is deliberately NOT AI and NOT a reproducibility guarantee. It asks one
 * mechanical question per category: is this piece of the record filled in? A
 * green row means "documented", never "correct" or "reproducible".
 */

export type CheckState = 'documented' | 'incomplete' | 'missing';

export type CheckCategory = {
  key: string;
  label: string;
  state: CheckState;
  /** Shown only when the row is not green, what to do about it. */
  hint?: string;
};

export type CompletenessReport = {
  categories: CheckCategory[];
  documented: number;
  incomplete: number;
  missing: number;
  /** 0–100. A blunt progress signal, not a quality score. */
  score: number;
};

export type CompletenessInput = {
  objective: string | null;
  hypothesis: string | null;
  protocolName: string | null;
  protocolVersion: number | null;
  conditionCount: number;
  sampleCount: number;
  datasetCount: number;
  fileCount: number;
  /** Where the original data lives when it is not uploaded: instrument PC, drive, NAS. */
  dataLocation: string | null;
  summary: string | null;
  observations: string | null;
  conclusion: string | null;
  nextSteps: string | null;
  noteCount: number;
};

/** Prose shorter than this reads as a placeholder rather than a record. */
const MIN_MEANINGFUL_LENGTH = 12;

function textState(value: string | null): CheckState {
  const trimmed = value?.trim() ?? '';
  if (trimmed === '') return 'missing';
  return trimmed.length < MIN_MEANINGFUL_LENGTH ? 'incomplete' : 'documented';
}

function countState(count: number): CheckState {
  return count > 0 ? 'documented' : 'missing';
}

export function checkCompleteness(input: CompletenessInput): CompletenessReport {
  const categories: CheckCategory[] = [
    { key: 'objective', label: 'Objective', state: textState(input.objective),
      hint: 'State what this run was meant to find out.' },
    { key: 'hypothesis', label: 'Hypothesis', state: textState(input.hypothesis),
      hint: 'What did you expect to happen, and why?' },
    { key: 'protocol', label: 'Protocol', state: input.protocolName ? 'documented' : 'missing',
      hint: 'Link the protocol that was followed.' },
    {
      key: 'protocolVersion',
      label: 'Protocol version',
      state: input.protocolVersion !== null ? 'documented' : input.protocolName ? 'incomplete' : 'missing',
      hint: 'Record which version was used. This is what comparisons hinge on.',
    },
    { key: 'conditions', label: 'Experimental conditions', state: countState(input.conditionCount),
      hint: 'Add the variables you controlled (temperature, pH, concentration …).' },
    { key: 'samples', label: 'Sample identifiers', state: countState(input.sampleCount),
      hint: 'Attach the sample IDs used, so results can be traced back.' },
    {
      key: 'rawData',
      label: 'Raw data',
      state:
        input.datasetCount > 0 || textState(input.dataLocation) === 'documented'
          ? 'documented'
          : input.fileCount > 0 || textState(input.dataLocation) === 'incomplete'
            ? 'incomplete'
            : 'missing',
      hint: 'Upload the measurement file, or write down exactly where the original is stored.',
    },
    { key: 'results', label: 'Results', state: textState(input.summary),
      hint: 'Summarise what the run produced.' },
    {
      key: 'observations',
      label: 'Observations',
      state:
        textState(input.observations) === 'documented'
          ? 'documented'
          : input.noteCount > 0
            ? 'incomplete'
            : 'missing',
      hint: 'Note anything unexpected while you still remember it.',
    },
    { key: 'conclusion', label: 'Conclusion', state: textState(input.conclusion),
      hint: 'What do you take from this run?' },
    { key: 'nextSteps', label: 'Next steps', state: textState(input.nextSteps),
      hint: 'What should happen after this: repeat, vary, or stop?' },
  ];

  const documented = categories.filter((c) => c.state === 'documented').length;
  const incomplete = categories.filter((c) => c.state === 'incomplete').length;
  const missing = categories.filter((c) => c.state === 'missing').length;

  return {
    categories,
    documented,
    incomplete,
    missing,
    score: Math.round(((documented + incomplete * 0.5) / categories.length) * 100),
  };
}

/** Plain-language summary shown under the checklist. */
export function completenessMessage(report: CompletenessReport): string {
  const outstanding = report.incomplete + report.missing;
  if (outstanding === 0) return 'Every category on this checklist is documented.';
  const noun = outstanding === 1 ? 'piece of information' : 'pieces of information';
  return `${outstanding} ${noun} may be useful to document before closing this experiment.`;
}

export type RecordGap<T> = { record: T; outstanding: CheckCategory[]; score: number };

/**
 * The lab-wide view of the same checklist: records with anything outstanding,
 * grouped by who ran them, thinnest first. Fully documented runs are left out,
 * so an empty result means every started run passes the check.
 */
export function gapsByResearcher<T extends CompletenessInput & { researcherName: string | null }>(
  records: T[],
): { researcher: string; gaps: RecordGap<T>[] }[] {
  const groups = new Map<string, RecordGap<T>[]>();
  for (const record of records) {
    const report = checkCompleteness(record);
    const outstanding = report.categories.filter((c) => c.state !== 'documented');
    if (outstanding.length === 0) continue;
    const researcher = record.researcherName ?? 'Former member';
    const list = groups.get(researcher) ?? [];
    list.push({ record, outstanding, score: report.score });
    groups.set(researcher, list);
  }
  return [...groups.entries()]
    .map(([researcher, gaps]) => ({ researcher, gaps: gaps.sort((a, b) => a.score - b.score) }))
    .sort((a, b) => b.gaps.length - a.gaps.length || a.researcher.localeCompare(b.researcher));
}
