import { describe, expect, it } from 'vitest';
import { buildNextActions, type ExperimentSignal } from './next-actions';

const NOW = new Date('2026-04-01T00:00:00Z');

const complete: ExperimentSignal = {
  id: 'e1',
  number: 4,
  title: 'Baseline run',
  status: 'completed',
  projectId: 'p1',
  projectName: 'PFAS Removal Study',
  performedOn: '2026-03-01',
  updatedAt: '2026-03-02',
  hasConclusion: true,
  hasNextSteps: true,
  hasObservations: true,
  conditionCount: 2,
  sampleCount: 2,
  datasetCount: 1,
};

const ids = (rows: ReturnType<typeof buildNextActions>) => rows.map((a) => a.id);

describe('buildNextActions', () => {
  it('says nothing about a fully documented run', () => {
    expect(buildNextActions([complete], [], NOW)).toEqual([]);
  });

  it('treats a finished run with no conclusion as blocking', () => {
    const rows = buildNextActions([{ ...complete, hasConclusion: false }], [], NOW);
    expect(rows[0]?.severity).toBe('blocking');
    expect(rows[0]?.title).toContain('EXP-004');
  });

  it('flags a flagged run that records no observations', () => {
    const rows = buildNextActions(
      [{ ...complete, status: 'needs_investigation', hasObservations: false }],
      [],
      NOW,
    );
    expect(ids(rows)).toContain('e1:observations');
  });

  it('flags an in-progress run only once it has gone stale', () => {
    const fresh = buildNextActions(
      [{ ...complete, status: 'in_progress', updatedAt: '2026-03-28' }],
      [],
      NOW,
    );
    expect(ids(fresh)).not.toContain('e1:stale');

    const stale = buildNextActions(
      [{ ...complete, status: 'in_progress', updatedAt: '2026-03-01' }],
      [],
      NOW,
    );
    expect(ids(stale)).toContain('e1:stale');
    expect(stale.find((a) => a.id === 'e1:stale')?.title).toContain('31 days');
  });

  it('flags a planned run whose date has passed, but not a future one', () => {
    expect(
      ids(buildNextActions([{ ...complete, status: 'planned', performedOn: '2026-03-01' }], [], NOW)),
    ).toContain('e1:overdue');
    expect(
      ids(buildNextActions([{ ...complete, status: 'planned', performedOn: '2026-05-01' }], [], NOW)),
    ).not.toContain('e1:overdue');
  });

  it('does not ask an unfinished run for a conclusion', () => {
    const rows = buildNextActions(
      [{ ...complete, status: 'in_progress', hasConclusion: false, updatedAt: '2026-03-30' }],
      [],
      NOW,
    );
    expect(ids(rows)).not.toContain('e1:conclusion');
  });

  it('mentions a protocol nothing references', () => {
    const rows = buildNextActions([], [{ id: 'pr1', name: 'PFAS Extraction', latestVersion: 2, experimentCount: 0 }], NOW);
    expect(rows[0]?.severity).toBe('idea');
    expect(rows[0]?.href).toBe('/protocols/pr1');
  });

  it('ranks blocking items above attention above ideas', () => {
    const rows = buildNextActions(
      [{ ...complete, hasConclusion: false, hasNextSteps: false, datasetCount: 0 }],
      [],
      NOW,
    );
    expect(rows.map((a) => a.severity)).toEqual(['blocking', 'attention', 'idea']);
  });

  it('returns nothing at all for an empty workspace', () => {
    expect(buildNextActions([], [], NOW)).toEqual([]);
  });
});
