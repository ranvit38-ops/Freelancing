/**
 * Research memory.
 *
 * Derived deterministically from the structured record — not generated prose.
 * Every line traces back to an experiment or protocol version the researcher
 * wrote, so the page is always available and never invents anything.
 */

export type MemoryExperiment = {
  id: string;
  number: number;
  title: string;
  status: string;
  objective: string | null;
  conclusion: string | null;
  nextSteps: string | null;
  observations: string | null;
  protocolName: string | null;
  protocolVersion: number | null;
};

export type MemoryProtocolChange = {
  protocolName: string;
  version: number;
  changeNote: string | null;
};

export type MemoryEntry = {
  text: string;
  /** The experiment this statement came from, for the "open the record" link. */
  sourceId?: string;
  sourceLabel?: string;
};

export type MemorySection = {
  key: string;
  title: string;
  description: string;
  entries: MemoryEntry[];
  emptyHint: string;
};

function label(e: MemoryExperiment) {
  return `EXP-${String(e.number).padStart(3, '0')}`;
}

function entry(e: MemoryExperiment, text: string): MemoryEntry {
  return { text, sourceId: e.id, sourceLabel: `${label(e)} — ${e.title}` };
}

export function buildResearchMemory(
  experiments: MemoryExperiment[],
  protocolChanges: MemoryProtocolChange[],
): MemorySection[] {
  const done = experiments.filter((e) => e.status === 'completed' || e.status === 'repeated');
  const troubled = experiments.filter((e) => e.status === 'needs_investigation');

  return [
    {
      key: 'tried',
      title: 'What we tried',
      description: 'Every experiment recorded in this project, by objective.',
      entries: experiments
        .filter((e) => e.objective)
        .map((e) => entry(e, e.objective!)),
      emptyHint: 'Objectives appear here as you record them on experiments.',
    },
    {
      key: 'worked',
      title: 'What we know',
      description: 'Conclusions the researchers wrote on completed runs.',
      entries: done.filter((e) => e.conclusion).map((e) => entry(e, e.conclusion!)),
      emptyHint: 'Conclusions recorded on completed experiments appear here.',
    },
    {
      key: 'problems',
      title: 'What did not work',
      description: 'Runs flagged for investigation, and the observations behind them.',
      entries: troubled.map((e) =>
        entry(e, e.observations ?? e.objective ?? 'Flagged for investigation; no observations recorded.'),
      ),
      emptyHint: 'Nothing is currently flagged as needing investigation.',
    },
    {
      key: 'open',
      title: 'Open questions',
      description: 'Next steps recorded on experiments that have not yet been closed out.',
      entries: experiments.filter((e) => e.nextSteps).map((e) => entry(e, e.nextSteps!)),
      emptyHint: 'Next steps recorded on experiments appear here.',
    },
    {
      key: 'protocol',
      title: 'Important protocol changes',
      description: 'Version history, in the words of whoever made the change.',
      entries: protocolChanges
        .filter((c) => c.changeNote)
        .map((c) => ({ text: `${c.protocolName} v${c.version}: ${c.changeNote}` })),
      emptyHint: 'Protocol version notes appear here once protocols are versioned.',
    },
    {
      key: 'gaps',
      title: 'Undocumented outcomes',
      description: 'Completed runs with no conclusion written down.',
      entries: done
        .filter((e) => !e.conclusion)
        .map((e) => entry(e, `${e.title} is marked complete but has no conclusion recorded.`)),
      emptyHint: 'Every completed run has a conclusion recorded.',
    },
  ];
}
