import { describe, expect, it } from 'vitest';
import { buildIcs, escapeText, fold } from './ics';

const now = new Date('2026-09-25T12:00:00Z');

describe('buildIcs', () => {
  const ics = buildIcs({
    calendarName: 'Chem Lab',
    host: 'labvia.example',
    now,
    events: [
      { id: 'e1', title: 'Group meeting', onDate: '2026-09-30', atTime: '14:00', notes: 'Room 204, Maya presents' },
      { id: 'e2', title: 'Instrument booked', onDate: '2026-10-02', atTime: null, notes: null },
    ],
    deadlines: [
      { id: 't1', title: 'Clean the hood', dueOn: '2026-10-01', status: 'open', assigneeName: null, forEveryone: true },
      { id: 't2', title: 'No date', dueOn: null, status: 'open', assigneeName: 'Bo', forEveryone: false },
    ],
  });

  it('is a calendar the apps accept', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('X-WR-CALNAME:Chem Lab');
  });

  it('puts a meeting at its time for an hour', () => {
    expect(ics).toContain('DTSTART:20260930T140000');
    expect(ics).toContain('DTEND:20260930T150000');
    expect(ics).toContain('DESCRIPTION:Room 204\\, Maya presents');
  });

  it('makes untimed events and deadlines all-day', () => {
    expect(ics).toContain('DTSTART;VALUE=DATE:20261002');
    expect(ics).toContain('DTEND;VALUE=DATE:20261003');
    expect(ics).toContain('SUMMARY:Due: Clean the hood');
  });

  it('skips tasks with no deadline', () => {
    expect(ics).not.toContain('No date');
  });

  it('gives every entry a stable id so updates replace rather than duplicate', () => {
    expect(ics).toContain('UID:event-e1@labvia.example');
    expect(ics).toContain('UID:task-t1@labvia.example');
  });
});

describe('escaping and folding', () => {
  it('escapes the characters iCalendar treats as syntax', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\;c\\\\d\\ne');
  });

  it('folds long lines to 75 octets with a leading space', () => {
    const folded = fold(`SUMMARY:${'x'.repeat(200)}`);
    for (const line of folded.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.split('\r\n').slice(1).every((l) => l.startsWith(' '))).toBe(true);
  });
});
