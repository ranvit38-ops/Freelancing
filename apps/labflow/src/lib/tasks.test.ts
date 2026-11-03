import { describe, expect, it } from 'vitest';
import { byDeadline, dueLabel } from './tasks';

describe('dueLabel', () => {
  const today = '2026-09-24'; // a Thursday

  it('puts overdue work in words, because that is the list people act on', () => {
    expect(dueLabel('2026-09-21', today)).toEqual({ text: '3 days overdue', tone: 'overdue' });
    expect(dueLabel('2026-09-23', today)).toEqual({ text: 'Due yesterday', tone: 'overdue' });
  });

  it('says today and tomorrow rather than a date', () => {
    expect(dueLabel('2026-09-24', today)).toEqual({ text: 'Due today', tone: 'soon' });
    expect(dueLabel('2026-09-25', today)).toEqual({ text: 'Due tomorrow', tone: 'soon' });
  });

  it('names the weekday within the week, and the date beyond it', () => {
    expect(dueLabel('2026-09-28', today)).toEqual({ text: 'Due Monday', tone: 'soon' });
    expect(dueLabel('2026-10-09', today)).toEqual({ text: 'Due Oct 9', tone: 'later' });
  });

  it('handles no deadline', () => {
    expect(dueLabel(null, today)).toEqual({ text: 'No deadline', tone: 'none' });
  });
});

describe('byDeadline', () => {
  it('orders soonest first and leaves undated work last', () => {
    const tasks = [{ dueOn: null }, { dueOn: '2026-10-01' }, { dueOn: '2026-09-20' }];
    expect(tasks.sort(byDeadline).map((t) => t.dueOn)).toEqual(['2026-09-20', '2026-10-01', null]);
  });
});
