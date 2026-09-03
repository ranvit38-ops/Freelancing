import { describe, expect, it } from 'vitest';
import { experimentCode, formatBytes, formatDate, pluralise, toDateInput } from './display';

describe('display helpers', () => {
  it('zero-pads experiment codes', () => {
    expect(experimentCode(1)).toBe('EXP-001');
    expect(experimentCode(37)).toBe('EXP-037');
    expect(experimentCode(1234)).toBe('EXP-1234');
  });

  it('formats dates in a fixed locale and timezone', () => {
    expect(formatDate(new Date('2026-04-02T23:30:00Z'))).toBe('2 Apr 2026');
    expect(formatDate(null)).toBe('—');
    expect(formatDate('not a date')).toBe('—');
  });

  it('produces date-input values', () => {
    expect(toDateInput(new Date('2026-04-02T00:00:00Z'))).toBe('2026-04-02');
    expect(toDateInput(null)).toBe('');
  });

  it('formats byte sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('pluralises counts', () => {
    expect(pluralise(1, 'experiment')).toBe('1 experiment');
    expect(pluralise(0, 'experiment')).toBe('0 experiments');
  });
});
