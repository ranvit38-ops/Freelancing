import { describe, expect, it } from 'vitest';
import { displayTime, monthGrid, parseMonth, shiftMonth } from './calendar';

describe('monthGrid', () => {
  it('covers whole weeks, Monday first, and nothing past the last week', () => {
    // September 2026: the 1st is a Tuesday and the 30th a Wednesday.
    const days = monthGrid({ year: 2026, month: 9 });
    expect(days[0]).toBe('2026-08-31'); // the Monday before
    expect(days.at(-1)).toBe('2026-10-04'); // the Sunday after
    expect(days.length % 7).toBe(0);
  });

  it('handles February in a leap year', () => {
    const days = monthGrid({ year: 2028, month: 2 });
    expect(days).toContain('2028-02-29');
    expect(days).not.toContain('2028-02-30');
  });
});

describe('shiftMonth', () => {
  it('crosses year boundaries in both directions', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });
});

describe('parseMonth', () => {
  it('reads YYYY-MM and falls back to today on anything else', () => {
    expect(parseMonth('2026-03', '2026-09-24')).toEqual({ year: 2026, month: 3 });
    expect(parseMonth('2026-13', '2026-09-24')).toEqual({ year: 2026, month: 9 });
    expect(parseMonth(undefined, '2026-09-24')).toEqual({ year: 2026, month: 9 });
  });
});

describe('displayTime', () => {
  it('shows twelve-hour time, and all day when there is none', () => {
    expect(displayTime('14:00')).toBe('2:00 PM');
    expect(displayTime('00:30')).toBe('12:30 AM');
    expect(displayTime('12:05')).toBe('12:05 PM');
    expect(displayTime(null)).toBe('All day');
  });
});
