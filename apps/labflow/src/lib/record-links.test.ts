import { describe, expect, it } from 'vitest';
import { linkRecords, type RecordRef } from './record-links';

const runs: RecordRef[] = [
  { id: 'a1', number: 1, title: 'Batch 1 at 25 C', projectId: 'pA' },
  { id: 'a2', number: 2, title: 'Batch 1 repeat', projectId: 'pA' },
  { id: 'b2', number: 2, title: 'Acid-washed carbon', projectId: 'pB' },
];

describe('linkRecords', () => {
  it('links a run that only one project has, from anywhere', () => {
    expect(linkRecords('see EXP-001, noisy', runs, null)).toEqual([
      { text: 'see ' },
      { text: 'EXP-001', href: '/experiments/a1', title: 'EXP-001: Batch 1 at 25 C' },
      { text: ', noisy' },
    ]);
  });

  it("means the channel's own project in a project channel", () => {
    expect(linkRecords('redo exp-2', runs, 'pB')[1]).toMatchObject({ href: '/experiments/b2' });
    expect(linkRecords('redo EXP2', runs, 'pA')[1]).toMatchObject({ href: '/experiments/a2' });
  });

  it('opens search instead of guessing when two runs share a number', () => {
    expect(linkRecords('EXP-002 again', runs, null)[0]).toMatchObject({ href: '/search?q=EXP-002' });
  });

  it('leaves numbers no run has, and plain text, alone', () => {
    expect(linkRecords('EXP-099 and nothing else', runs, null)).toEqual([{ text: 'EXP-099 and nothing else' }]);
    expect(linkRecords('', runs, null)).toEqual([]);
  });
});
