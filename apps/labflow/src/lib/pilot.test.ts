import { afterEach, describe, expect, it } from 'vitest';
import {
  PILOT_PLAN,
  ephemeralUploads,
  fileStorage,
  feedbackEmail,
  isWouldPay,
  parseMonthlyValue,
  pilotBanner,
  pilotMode,
} from './pilot';
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

describe('feedbackEmail', () => {
  const from = { name: 'Dr Rao', email: 'rao@uni.edu', workspace: 'Rao Lab' };

  it('leads with the verdict and the lab, so a full inbox still sorts itself', () => {
    const { subject } = feedbackEmail(
      { wouldPay: 'yes', monthlyValue: 80, blocker: null, decisionMaker: null },
      from,
    );
    expect(subject).toBe('Labvia pilot: Would pay — Rao Lab');
  });

  it('carries who said it, so the reply has a name on it', () => {
    const { text } = feedbackEmail(
      { wouldPay: 'no', monthlyValue: 0, blocker: 'We use OneNote', decisionMaker: 'The PI' },
      from,
    );
    expect(text).toContain('Dr Rao <rao@uni.edu>');
    expect(text).toContain('Would not pay');
    expect(text).toContain('$0');
    expect(text).toContain('We use OneNote');
    expect(text).toContain('The PI');
  });

  it('says a question went unanswered rather than leaving a gap that reads as a bug', () => {
    const { text } = feedbackEmail(
      { wouldPay: 'maybe', monthlyValue: null, blocker: null, decisionMaker: null },
      from,
    );
    expect(text).toContain('(not answered)');
    // A blank figure must never render as zero: "nothing" and "did not say"
    // are the two answers most worth telling apart.
    expect(text).not.toContain('$0');
  });
});

describe('fileStorage', () => {
  const saved = { e: process.env.LABFLOW_EPHEMERAL_UPLOADS, f: process.env.LABFLOW_FILE_STORAGE };
  const restore = () => {
    for (const [k, v] of [['LABFLOW_EPHEMERAL_UPLOADS', saved.e], ['LABFLOW_FILE_STORAGE', saved.f]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };

  it('keeps files in the database on a host whose disk does not survive, and says nothing is lost', () => {
    delete process.env.LABFLOW_FILE_STORAGE;
    process.env.LABFLOW_EPHEMERAL_UPLOADS = '1';
    expect(fileStorage()).toBe('database');
    expect(ephemeralUploads()).toBe(false);
    restore();
  });

  it('uses the disk by default, and warns when that disk is ephemeral and forced', () => {
    delete process.env.LABFLOW_EPHEMERAL_UPLOADS;
    delete process.env.LABFLOW_FILE_STORAGE;
    expect(fileStorage()).toBe('disk');
    process.env.LABFLOW_EPHEMERAL_UPLOADS = '1';
    process.env.LABFLOW_FILE_STORAGE = 'disk';
    expect(ephemeralUploads()).toBe(true);
    restore();
  });
});
