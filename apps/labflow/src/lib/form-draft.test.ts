import { describe, expect, it } from 'vitest';
import { draftFromFormData } from './form-draft';

function form(entries: [string, string][]) {
  const data = new FormData();
  for (const [k, v] of entries) data.append(k, v);
  return data;
}

describe('draftFromFormData', () => {
  it('keeps what was typed, with condition rows paired up', () => {
    const draft = draftFromFormData(
      form([
        ['projectId', 'p1'],
        ['experimentId', 'e1'],
        ['title', 'Crystal violet assay'],
        ['status', 'in_progress'],
        ['conditionName', 'Temperature'],
        ['conditionValue', '37'],
        ['conditionUnit', '°C'],
        ['conditionName', 'Time'],
        ['conditionValue', '72'],
        ['conditionUnit', 'h'],
      ]),
      1000,
    );
    expect(draft).toEqual({
      savedAt: 1000,
      fields: { title: 'Crystal violet assay', status: 'in_progress' },
      conditions: [
        { name: 'Temperature', value: '37', unit: '°C' },
        { name: 'Time', value: '72', unit: 'h' },
      ],
    });
  });

  it('keeps nothing for an untouched form, so there is nothing to offer back', () => {
    const untouched = form([
      ['projectId', 'p1'],
      ['title', ''],
      ['status', 'in_progress'],
      ['performedOn', '2026-10-11'],
      ['conditionName', ''],
      ['conditionValue', ''],
      ['conditionUnit', ''],
    ]);
    expect(draftFromFormData(untouched, 1)).toBeNull();
  });

  it('never stores files or Next action ids', () => {
    const data = form([['title', 'x'], ['$ACTION_ID_abc', '']]);
    data.append('files', new Blob(['data']), 'run.csv');
    expect(draftFromFormData(data, 1)?.fields).toEqual({ title: 'x' });
  });
});
