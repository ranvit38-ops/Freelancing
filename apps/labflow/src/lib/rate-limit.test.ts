import { beforeEach, describe, expect, it } from 'vitest';
import { clientIp, headerSafeFilename, rateLimit, resetRateLimits } from './rate-limit';

beforeEach(resetRateLimits);

describe('rateLimit', () => {
  it('allows up to the limit then refuses', () => {
    for (let i = 0; i < 3; i++) expect(rateLimit('k', { limit: 3 }).ok).toBe(true);
    const blocked = rateLimit('k', { limit: 3 });
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it('keeps separate counters per key', () => {
    rateLimit('a', { limit: 1 });
    expect(rateLimit('a', { limit: 1 }).ok).toBe(false);
    expect(rateLimit('b', { limit: 1 }).ok).toBe(true);
  });

  it('lets the window expire', () => {
    rateLimit('k', { limit: 1, windowMs: 1 });
    expect(rateLimit('k', { limit: 1, windowMs: 1 }).ok).toBe(false);
    return new Promise((r) => setTimeout(r, 5)).then(() => {
      expect(rateLimit('k', { limit: 1, windowMs: 1 }).ok).toBe(true);
    });
  });
});

describe('clientIp', () => {
  it('takes the first hop of x-forwarded-for', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }))).toBe('203.0.113.9');
  });

  it('falls back to x-real-ip then unknown', () => {
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
    expect(clientIp(new Headers())).toBe('unknown');
  });
});

describe('headerSafeFilename', () => {
  it('strips characters that would break or split the header', () => {
    expect(headerSafeFilename('run"1.csv')).toBe('run1.csv');
    expect(headerSafeFilename('a\r\nX-Injected: yes')).toBe('aX-Injected: yes');
    expect(headerSafeFilename('back\\slash.csv')).toBe('backslash.csv');
  });

  it('never returns an empty name', () => {
    expect(headerSafeFilename('"""')).toBe('download');
    expect(headerSafeFilename('   ')).toBe('download');
  });
});
