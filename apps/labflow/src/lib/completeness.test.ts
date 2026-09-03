import { describe, expect, it } from 'vitest';
import { checkCompleteness, completenessMessage, type CompletenessInput } from './completeness';

const empty: CompletenessInput = {
  objective: null,
  hypothesis: null,
  protocolName: null,
  protocolVersion: null,
  conditionCount: 0,
  sampleCount: 0,
  datasetCount: 0,
  fileCount: 0,
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

  it('treats placeholder prose as incomplete rather than documented', () => {
    expect(state({ ...empty, objective: 'test' }, 'objective')).toBe('incomplete');
  });

  it('lets free-text notes partially cover observations', () => {
    expect(state({ ...empty, noteCount: 1 }, 'observations')).toBe('incomplete');
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
