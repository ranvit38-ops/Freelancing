import { describe, expect, it } from 'vitest';
import { pulseRows } from './pulse';
import type { CompletenessInput } from './completeness';

const bare: CompletenessInput = {
  objective: null, hypothesis: null, protocolName: null, protocolVersion: null,
  conditionCount: 0, sampleCount: 0, datasetCount: 0, fileCount: 0, dataLocation: null,
  summary: null, observations: null, conclusion: null, nextSteps: null, noteCount: 0,
};
const full: CompletenessInput = {
  objective: 'Measure PFOA breakthrough on the bed.', hypothesis: 'Later breakthrough than v3 packing.',
  protocolName: 'PFAS', protocolVersion: 4, conditionCount: 2, sampleCount: 2, datasetCount: 1, fileCount: 1,
  dataLocation: null, summary: 'Breakthrough at 42 bed volumes.', observations: 'Pressure rose after 30 bed volumes.',
  conclusion: 'v4 packing delays breakthrough.', nextSteps: 'Repeat at 30 °C to test it.', noteCount: 1,
};
const now = new Date('2026-10-11T12:00:00Z');
const member = (id: string, lastActive: string | null) => ({
  id, name: id, email: `${id}@x`, role: 'member', runsThisWeek: 0, notesThisWeek: 0, lastActive,
});

describe('pulseRows', () => {
  it('counts each person’s thin records and how long they have been quiet, quietest first', () => {
    const rows = pulseRows(
      [member('ada', '2026-10-10T12:00:00Z'), member('tom', '2026-09-30T12:00:00Z'), member('new', null)],
      [
        { ...bare, researcherId: 'ada' },
        { ...full, researcherId: 'ada' },
        { ...bare, researcherId: 'tom' },
        { ...bare, researcherId: 'tom' },
        { ...bare, researcherId: null },
      ],
      now,
    );
    expect(rows.map((r) => [r.id, r.recordsToFill, r.quietDays])).toEqual([
      ['new', 0, null],
      ['tom', 2, 11],
      ['ada', 1, 1],
    ]);
  });
});
