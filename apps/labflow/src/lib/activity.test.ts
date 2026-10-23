import { describe, expect, it } from 'vitest';
import { activityCsv, changedFields, excerpt } from './activity';

const names = { title: 'name', objective: 'objective', performedOn: 'date' } as const;

describe('changedFields', () => {
  it('names only the fields that actually changed', () => {
    expect(
      changedFields(
        { title: 'Run 1', objective: 'Old', performedOn: new Date('2026-10-11T00:00:00Z') },
        { title: 'Run 1', objective: 'New', performedOn: new Date('2026-10-11T00:00:00Z') },
        names,
      ),
    ).toEqual(['objective']);
  });

  it('treats empty and missing as the same, and ignores untouched fields', () => {
    expect(changedFields({ title: 'Run 1', objective: null }, { objective: '  ' }, names)).toEqual([]);
    expect(changedFields({ title: 'Run 1', objective: 'x' }, { title: 'Run 2' }, names)).toEqual(['name']);
  });

  it('compares dates by day', () => {
    expect(
      changedFields(
        { performedOn: new Date('2026-10-11T00:00:00Z') },
        { performedOn: new Date('2026-10-12T00:00:00Z') },
        names,
      ),
    ).toEqual(['date']);
  });
});

describe('excerpt', () => {
  it('flattens and shortens long text', () => {
    expect(excerpt('a\n\nb')).toBe('a b');
    expect(excerpt('x'.repeat(200), 10)).toBe('xxxxxxxxx…');
  });
});

describe('activityCsv', () => {
  it('quotes cells with commas, quotes and line breaks', () => {
    const csv = activityCsv([
      {
        createdAt: new Date('2026-10-11T14:05:09Z'),
        actorName: 'Pranta, R.',
        action: 'added',
        subjectType: 'note',
        label: 'EXP-001 "Crystal violet"',
        detail: 'line one\nline two',
      },
      { createdAt: new Date('2026-10-11T15:00:00Z'), actorName: null, action: 'deleted', subjectType: 'file', label: 'a.csv', detail: null },
    ]);
    expect(csv.split('\r\n')).toEqual([
      'When (UTC),Who,Did,What,Name,Detail',
      '2026-10-11 14:05:09,"Pranta, R.",added,note,"EXP-001 ""Crystal violet""","line one\nline two"',
      '2026-10-11 15:00:00,Former member,deleted,file,a.csv,',
      '',
    ]);
  });
});
