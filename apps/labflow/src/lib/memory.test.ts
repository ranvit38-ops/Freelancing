import { describe, expect, it } from 'vitest';
import { buildResearchMemory, type MemoryExperiment } from './memory';

const base: MemoryExperiment = {
  id: 'e1',
  number: 1,
  title: 'Baseline run',
  status: 'completed',
  objective: 'Establish a baseline breakthrough curve.',
  conclusion: 'GAC gives a short breakthrough time.',
  nextSteps: 'Repeat with the resin.',
  observations: null,
  protocolName: 'PFAS Extraction',
  protocolVersion: 1,
};

const section = (sections: ReturnType<typeof buildResearchMemory>, key: string) =>
  sections.find((s) => s.key === key)!;

describe('buildResearchMemory', () => {
  it('traces every derived statement back to its experiment', () => {
    const sections = buildResearchMemory([base], []);
    const known = section(sections, 'worked').entries[0]!;
    expect(known.text).toBe('GAC gives a short breakthrough time.');
    expect(known.sourceId).toBe('e1');
    expect(known.sourceLabel).toBe('EXP-001 — Baseline run');
  });

  it('lists flagged runs under what did not work', () => {
    const sections = buildResearchMemory(
      [{ ...base, status: 'needs_investigation', observations: 'Recovery only 74%.' }],
      [],
    );
    expect(section(sections, 'problems').entries[0]?.text).toBe('Recovery only 74%.');
  });

  it('names a flagged run even when no observations were written', () => {
    const sections = buildResearchMemory(
      [{ ...base, status: 'needs_investigation', observations: null, objective: null }],
      [],
    );
    expect(section(sections, 'problems').entries[0]?.text).toContain('no observations recorded');
  });

  it('surfaces completed runs with no conclusion as a documentation gap', () => {
    const sections = buildResearchMemory([{ ...base, conclusion: null }], []);
    expect(section(sections, 'gaps').entries).toHaveLength(1);
    expect(section(sections, 'worked').entries).toHaveLength(0);
  });

  it('includes protocol change notes verbatim', () => {
    const sections = buildResearchMemory(
      [],
      [{ protocolName: 'PFAS Extraction', version: 2, changeNote: 'Rinse volume raised to 10 mL.' }],
    );
    expect(section(sections, 'protocol').entries[0]?.text).toBe(
      'PFAS Extraction v2: Rinse volume raised to 10 mL.',
    );
  });

  it('produces every section even with no data at all', () => {
    const sections = buildResearchMemory([], []);
    expect(sections).toHaveLength(6);
    expect(sections.every((s) => s.entries.length === 0)).toBe(true);
  });
});
