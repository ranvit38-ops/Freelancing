import { describe, expect, it } from 'vitest';
import {
  checkCompleteness,
  completenessMessage,
  gapsByResearcher,
  type CompletenessInput,
} from './completeness';

const empty: CompletenessInput = {
  objective: null,
  hypothesis: null,
  protocolName: null,
  protocolVersion: null,
  conditionCount: 0,
  sampleCount: 0,
  datasetCount: 0,
  fileCount: 0,
  dataLocation: null,
  summary: null,
  observations: null,
  conclusion: null,
  nextSteps: null,
  noteCount: 0,
};

const state = (input: CompletenessInput, key: string) =>
  checkCompleteness(input).categories.find((c) => c.key === key)?.state;

describe('checkCompleteness', () => {
  it('reports an empty record as entirely missing', () => {
    const report = checkCompleteness(empty);
    expect(report.documented).toBe(0);
    expect(report.missing).toBe(report.categories.length);
    expect(report.score).toBe(0);
  });

  it('scores a fully documented record at 100', () => {
    const report = checkCompleteness({
      objective: 'Measure PFOA breakthrough on the new sorbent bed.',
      hypothesis: 'Breakthrough occurs later than with the v3 packing.',
      protocolName: 'PFAS Extraction',
      protocolVersion: 4,
      conditionCount: 3,
      sampleCount: 3,
      datasetCount: 1,
      fileCount: 1,
      dataLocation: null,
      summary: 'Breakthrough at 42 bed volumes.',
      observations: 'Column pressure rose sharply after 30 bed volumes.',
      conclusion: 'The v4 packing delays breakthrough materially.',
      nextSteps: 'Repeat at 30 °C to test temperature sensitivity.',
      noteCount: 2,
    });
    expect(report.missing).toBe(0);
    expect(report.incomplete).toBe(0);
    expect(report.score).toBe(100);
  });

  it('flags a protocol without a version as incomplete, not missing', () => {
    expect(state({ ...empty, protocolName: 'PFAS Extraction' }, 'protocolVersion')).toBe('incomplete');
    expect(state(empty, 'protocolVersion')).toBe('missing');
  });

  it('treats a stray file as partial evidence of raw data', () => {
    expect(state({ ...empty, fileCount: 1 }, 'rawData')).toBe('incomplete');
    expect(state({ ...empty, fileCount: 1, datasetCount: 1 }, 'rawData')).toBe('documented');
  });

  it('accepts a written location for raw data that was never uploaded', () => {
    const where = 'Plate reader PC, D:\\Data\\2026-10\\run12.xlsx';
    expect(state({ ...empty, dataLocation: where }, 'rawData')).toBe('documented');
    expect(state({ ...empty, dataLocation: 'NAS' }, 'rawData')).toBe('incomplete');
    expect(state({ ...empty, dataLocation: '   ' }, 'rawData')).toBe('missing');
  });

  it('treats placeholder prose as incomplete rather than documented', () => {
    expect(state({ ...empty, objective: 'test' }, 'objective')).toBe('incomplete');
  });

  it('counts a dated note as the bench record', () => {
    expect(state({ ...empty, noteCount: 1 }, 'notes')).toBe('documented');
    expect(state({ ...empty, observations: 'Column pressure rose after 30 BV.' }, 'notes')).toBe('documented');
    expect(state(empty, 'notes')).toBe('missing');
  });

  it('does not ask every run for a hypothesis, results or a conclusion', () => {
    const keys = checkCompleteness(empty).categories.map((c) => c.key);
    expect(keys).not.toContain('hypothesis');
    expect(keys).not.toContain('results');
    expect(keys).not.toContain('conclusion');
  });
});

describe('completenessMessage', () => {
  it('singularises for one outstanding item', () => {
    const report = checkCompleteness(empty);
    expect(completenessMessage({ ...report, incomplete: 1, missing: 0 })).toContain(
      '1 piece of information',
    );
  });

  it('confirms when nothing is outstanding', () => {
    const report = checkCompleteness(empty);
    expect(completenessMessage({ ...report, incomplete: 0, missing: 0 })).toContain(
      'Every category',
    );
  });
});

describe('gapsByResearcher', () => {
  const full: CompletenessInput = {
    objective: 'Measure PFOA breakthrough on the new sorbent bed.',
    hypothesis: 'Breakthrough occurs later than with the v3 packing.',
    protocolName: 'PFAS Extraction',
    protocolVersion: 4,
    conditionCount: 3,
    sampleCount: 3,
    datasetCount: 0,
    fileCount: 0,
    dataLocation: 'Lab NAS /raw/pfas/2026-10-03/',
    summary: 'Breakthrough at 42 bed volumes.',
    observations: 'Column pressure rose sharply after 30 bed volumes.',
    conclusion: 'The v4 packing delays breakthrough materially.',
    nextSteps: 'Repeat at 30 °C to test temperature sensitivity.',
    noteCount: 1,
  };

  it('leaves out fully documented runs', () => {
    expect(gapsByResearcher([{ ...full, researcherName: 'Ada' }])).toEqual([]);
  });

  it('groups thin records by researcher, most gaps first, thinnest record first', () => {
    const groups = gapsByResearcher([
      { ...full, researcherName: 'Ada', dataLocation: null },
      { ...full, researcherName: 'Tom', conditionCount: 0 },
      { ...empty, researcherName: 'Tom' },
      { ...full, researcherName: null, sampleCount: 0 },
    ]);
    expect(groups.map((g) => g.researcher)).toEqual(['Tom', 'Ada', 'Former member']);
    expect(groups[0]!.gaps[0]!.score).toBe(0);
    expect(groups[1]!.gaps[0]!.outstanding.map((c) => c.key)).toEqual(['rawData']);
  });
});
