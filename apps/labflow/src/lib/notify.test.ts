import { describe, expect, it } from 'vitest';
import { digestEmail, emailDue, mentionedIds, messageRecipients } from './notify';

const members = [
  { id: 'a', name: 'Maya Rodriguez' },
  { id: 'b', name: 'James Okafor' },
  { id: 'c', name: 'James Lee' },
  { id: 'd', name: 'Priya Natarajan' },
];

describe('mentionedIds', () => {
  it('finds full names, and first names only when they are unique', () => {
    expect(mentionedIds('@Maya can you look?', members)).toEqual(['a']);
    expect(mentionedIds('thanks @james lee and @priya', members).sort()).toEqual(['c', 'd']);
    // Two Jameses: a bare @James is ambiguous, so nobody is notified wrongly.
    expect(mentionedIds('@James please', members)).toEqual([]);
  });

  it('ignores email addresses and partial words', () => {
    expect(mentionedIds('write to maya@berkeley.edu', members)).toEqual([]);
    expect(mentionedIds('@Mayan ruins', members)).toEqual([]);
  });
});

describe('messageRecipients', () => {
  it('gives each person one notification, the most personal reason winning, and never the author', () => {
    const r = messageRecipients({ authorId: 'a', dmPeople: ['a', 'b'], mentioned: ['b', 'a', 'd'], parentAuthorId: 'd', ownerId: 'c' });
    expect(Object.fromEntries(r)).toEqual({ b: 'message', d: 'mention', c: 'comment' });
  });
});

describe('emailDue', () => {
  const now = new Date('2026-11-22T12:00:00Z');
  const ago = (min: number) => new Date(now.getTime() - min * 60_000);
  it('waits a few minutes, then respects the pace, and never sends when off', () => {
    expect(emailDue({ pace: 'hourly', lastEmailedAt: null, oldestPending: ago(2), now, delayMinutes: 5 })).toBe(false);
    expect(emailDue({ pace: 'hourly', lastEmailedAt: null, oldestPending: ago(6), now, delayMinutes: 5 })).toBe(true);
    expect(emailDue({ pace: 'hourly', lastEmailedAt: ago(30), oldestPending: ago(20), now, delayMinutes: 5 })).toBe(false);
    expect(emailDue({ pace: 'hourly', lastEmailedAt: ago(61), oldestPending: ago(20), now, delayMinutes: 5 })).toBe(true);
    expect(emailDue({ pace: 'daily', lastEmailedAt: ago(600), oldestPending: ago(20), now, delayMinutes: 5 })).toBe(false);
    expect(emailDue({ pace: 'off', lastEmailedAt: null, oldestPending: ago(600), now, delayMinutes: 5 })).toBe(false);
    expect(emailDue({ pace: 'hourly', lastEmailedAt: null, oldestPending: null, now, delayMinutes: 5 })).toBe(false);
  });
});

describe('digestEmail', () => {
  const item = (title: string, min: number, labName = 'Chen Lab') => ({ labName, title, body: 'Can you check lane 2?', link: `https://x/${title}`, createdAt: new Date(Date.UTC(2026, 10, 22, 12, min)) });
  it('uses the item as the subject when there is one, and says how to stop', () => {
    const e = digestEmail({ name: 'Maya Rodriguez', items: [item('James gave you a task', 1)], settingsLink: 'https://x/settings#notifications', pace: 'hourly' });
    expect(e.subject).toBe('James gave you a task');
    expect(e.text).toContain('Hi Maya,');
    expect(e.text).toContain('"Can you check lane 2?"');
    expect(e.text).toContain('https://x/settings#notifications');
  });

  it('counts and groups several, newest first, capped', () => {
    const items = Array.from({ length: 18 }, (_, i) => item(`Item ${i}`, i, i % 2 ? 'Chen Lab' : 'Okafor Lab'));
    const e = digestEmail({ name: 'Maya', items, settingsLink: 's', pace: 'daily' });
    expect(e.subject).toBe('18 things for you in 2 labs on Labquill');
    expect(e.text).toContain('And 3 more in Labquill.');
    expect(e.text).toContain('at most one of these a day');
  });
});
