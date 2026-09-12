import { afterEach, describe, expect, it } from 'vitest';
import { PILOT_PLAN, isWouldPay, parseMonthlyValue, pilotBanner, pilotMode } from './pilot';
import { PLANS } from './plans';

const original = process.env.LABFLOW_PILOT_MODE;
afterEach(() => {
  if (original === undefined) delete process.env.LABFLOW_PILOT_MODE;
  else process.env.LABFLOW_PILOT_MODE = original;
});

describe('pilotMode', () => {
  it('is off unless the variable is exactly 1', () => {
    delete process.env.LABFLOW_PILOT_MODE;
    expect(pilotMode()).toBe(false);

    // Anything truthy-looking but not "1" stays off. Giving the product away
    // should take the exact value, not a plausible one.
    for (const value of ['', '0', 'true', 'yes', 'on']) {
      process.env.LABFLOW_PILOT_MODE = value;
      expect(pilotMode()).toBe(false);
    }

    process.env.LABFLOW_PILOT_MODE = '1';
    expect(pilotMode()).toBe(true);
  });
});

describe('pilotBanner', () => {
  it('names the plan and its seat count, so the sentence cannot drift from the plan', () => {
    const banner = pilotBanner();
    expect(banner).toContain(PLANS[PILOT_PLAN].name);
    expect(banner).toContain(String(PLANS[PILOT_PLAN].seats));
  });
});

describe('isWouldPay', () => {
  it('accepts the three answers and nothing else', () => {
    expect(isWouldPay('yes')).toBe(true);
    expect(isWouldPay('maybe')).toBe(true);
    expect(isWouldPay('no')).toBe(true);
    expect(isWouldPay('Yes')).toBe(false);
    expect(isWouldPay('')).toBe(false);
    expect(isWouldPay('probably')).toBe(false);
  });
});

describe('parseMonthlyValue', () => {
  it('reads a number out of whatever someone typed', () => {
    expect(parseMonthlyValue('60')).toBe(60);
    expect(parseMonthlyValue('$60')).toBe(60);
    expect(parseMonthlyValue('about $60 a month')).toBe(60);
    expect(parseMonthlyValue('60/month')).toBe(60);
    expect(parseMonthlyValue('1,200')).toBe(1200);
    expect(parseMonthlyValue('49.50')).toBe(50);
  });

  it('keeps zero, because "we would pay nothing" is a real answer', () => {
    expect(parseMonthlyValue('0')).toBe(0);
  });

  it('returns null when no figure was given, which is not the same as zero', () => {
    expect(parseMonthlyValue('')).toBeNull();
    expect(parseMonthlyValue('hard to say')).toBeNull();
    expect(parseMonthlyValue('   ')).toBeNull();
  });

  it('refuses a figure too large to be a monthly price for a lab', () => {
    expect(parseMonthlyValue('999999999')).toBeNull();
  });
});
