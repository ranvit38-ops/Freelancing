import { afterEach, describe, expect, it } from 'vitest';

/**
 * The local override must be impossible to enable on a deployed instance.
 * Everything else about the paywall is covered by lib/plans.test.ts.
 */
const env = process.env as Record<string, string | undefined>;
const original = { ...process.env };
afterEach(() => {
  env.NODE_ENV = original.NODE_ENV;
  process.env.LABFLOW_DISABLE_PAYWALL = original.LABFLOW_DISABLE_PAYWALL;
});

function disabled() {
  return process.env.NODE_ENV !== 'production' && process.env.LABFLOW_DISABLE_PAYWALL === '1';
}

describe('local paywall override', () => {
  it('is off unless explicitly set', () => {
    delete process.env.LABFLOW_DISABLE_PAYWALL;
    expect(disabled()).toBe(false);
  });

  it('works in development when set', () => {
    env.NODE_ENV = 'development';
    process.env.LABFLOW_DISABLE_PAYWALL = '1';
    expect(disabled()).toBe(true);
  });

  it('is refused in production even when set', () => {
    env.NODE_ENV = 'production';
    process.env.LABFLOW_DISABLE_PAYWALL = '1';
    expect(disabled()).toBe(false);
  });

  it('ignores any value other than exactly "1"', () => {
    env.NODE_ENV = 'development';
    for (const value of ['true', 'yes', '0', '']) {
      process.env.LABFLOW_DISABLE_PAYWALL = value;
      expect(disabled()).toBe(false);
    }
  });
});
