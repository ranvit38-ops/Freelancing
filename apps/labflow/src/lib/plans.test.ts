import { describe, expect, it } from 'vitest';
import {
  EXTRA_SEAT_PRICE,
  PLANS,
  monthlyTotal,
  seatLimit,
  seatsRemaining,
  subscriptionNotice,
  usable,
  type SubscriptionState,
} from './plans';

const NOW = new Date('2026-05-01T00:00:00Z');
const base: SubscriptionState = {
  plan: 'lab',
  status: 'active',
  extraSeats: 0,
  trialEndsAt: null,
  currentPeriodEnd: '2026-06-01',
};

describe('canWrite', () => {
  it('allows an active plan and stops a lapsed one', () => {
    expect(usable(base, NOW)).toBe(true);
    expect(usable({ ...base, status: 'canceled' }, NOW)).toBe(false);
    expect(usable({ ...base, plan: null, status: 'none' }, NOW)).toBe(false);
  });

  it('lets a workspace with no subscription row write on the free plan', () => {
    // Free is a real state, not a lockout. Only a lapsed *paid* plan is read-only.
    expect(usable(null, NOW)).toBe(true);
  });

  it('keeps a past-due workspace working — a failed card is not a lockout', () => {
    expect(usable({ ...base, status: 'past_due' }, NOW)).toBe(true);
  });

  it('allows a trial until it expires, then stops', () => {
    expect(usable({ ...base, status: 'trialing', trialEndsAt: '2026-05-10' }, NOW)).toBe(true);
    expect(usable({ ...base, status: 'trialing', trialEndsAt: '2026-04-20' }, NOW)).toBe(false);
    expect(usable({ ...base, status: 'trialing', trialEndsAt: null }, NOW)).toBe(false);
  });
});

describe('seatLimit', () => {
  it('gives each plan its seats plus any extras bought', () => {
    expect(seatLimit(base)).toBe(PLANS.lab.seats);
    expect(seatLimit({ ...base, plan: 'group', extraSeats: 3 })).toBe(PLANS.group.seats + 3);
  });

  it('gives a live trial the smallest paid plan, so a lab can try it as a team', () => {
    expect(
      seatLimit({ ...base, plan: null, status: 'trialing', trialEndsAt: '2026-05-10' }, NOW),
    ).toBe(PLANS.lab.seats);
  });

  it('falls back to the free plan’s single seat when nothing is active', () => {
    expect(seatLimit(null, NOW)).toBe(PLANS.free.seats);
    expect(seatLimit({ ...base, status: 'canceled' }, NOW)).toBe(PLANS.free.seats);
  });
});

describe('seatsRemaining', () => {
  it('counts members and outstanding invites against the limit', () => {
    expect(seatsRemaining(base, 2, 1)).toBe(PLANS.lab.seats - 3);
  });

  it('never goes negative when a plan is downgraded below current headcount', () => {
    expect(seatsRemaining(base, 9, 0)).toBe(0);
  });
});

describe('subscriptionNotice', () => {
  it('says nothing when an active plan needs no action', () => {
    expect(subscriptionNotice(base, NOW)).toBeNull();
  });

  it('counts down the trial and names the end', () => {
    expect(subscriptionNotice({ ...base, status: 'trialing', trialEndsAt: '2026-05-02' }, NOW)).toBe(
      '1 day left in the trial.',
    );
    expect(
      subscriptionNotice({ ...base, status: 'trialing', trialEndsAt: '2026-04-01' }, NOW),
    ).toContain('trial has ended');
  });

  it('warns on a failed payment, and says read-only rather than deleted', () => {
    expect(subscriptionNotice({ ...base, status: 'past_due' }, NOW)).toContain('payment failed');
    const lapsed = subscriptionNotice({ ...base, status: 'canceled' }, NOW);
    expect(lapsed).toContain('read-only');
    expect(lapsed).toContain('stays readable');
  });
});

describe('toSubscriptionState', () => {
  const row = {
    plan: 'lab',
    status: 'active' as const,
    extraSeats: 2,
    trialEndsAt: null,
    currentPeriodEnd: null,
  };

  it('narrows a known plan', async () => {
    const { toSubscriptionState } = await import('./plans');
    expect(toSubscriptionState(row)?.plan).toBe('lab');
  });

  it('treats an unknown plan name as no plan, not as a free upgrade', async () => {
    const { toSubscriptionState, seatLimit, PLANS } = await import('./plans');
    const state = toSubscriptionState({ ...row, plan: 'enterprise-retired' });
    expect(state?.plan).toBeNull();
    // Falls back to free, never to the seats of a plan that no longer exists.
    expect(seatLimit(state)).toBe(PLANS.free.seats);
  });

  it('passes null straight through', async () => {
    const { toSubscriptionState } = await import('./plans');
    expect(toSubscriptionState(null)).toBeNull();
  });
});

describe('monthlyTotal', () => {
  it('adds extra seats at the per-seat price', () => {
    expect(monthlyTotal('lab', 0)).toBe(PLANS.lab.monthly);
    expect(monthlyTotal('lab', 3)).toBe(PLANS.lab.monthly + 3 * EXTRA_SEAT_PRICE);
  });
});

describe('free tier and read-only lockout', () => {
  it('is the plan in force when nothing is subscribed', async () => {
    const { effectivePlan, limitsFor } = await import('./plans');
    expect(effectivePlan(null, NOW)).toBe('free');
    expect(limitsFor(null, NOW).projects).toBe(1);
    expect(limitsFor(null, NOW).experiments).toBe(10);
  });

  it('withholds the paid features from free', async () => {
    const { limitsFor } = await import('./plans');
    const free = limitsFor(null, NOW);
    expect(free.compare).toBe(false);
    expect(free.pptxExport).toBe(false);
    expect(free.pubmed).toBe(false);
    expect(free.researchMemory).toBe(false);
  });

  it('makes a lapsed paid workspace read-only, not free-tier writable', async () => {
    const { canWrite, effectivePlan } = await import('./plans');
    const lapsed = { ...base, status: 'canceled' as const };
    expect(canWrite(lapsed, NOW)).toBe(false);
    expect(effectivePlan(lapsed, NOW)).toBe('free');
  });

  it('keeps a past-due workspace writable through the retry window', async () => {
    const { canWrite } = await import('./plans');
    expect(canWrite({ ...base, status: 'past_due' }, NOW)).toBe(true);
  });

  it('formats storage limits for display', async () => {
    const { formatLimitBytes } = await import('./plans');
    expect(formatLimitBytes(50 * 1024 * 1024)).toBe('50 MB');
    expect(formatLimitBytes(10 * 1024 ** 3)).toBe('10 GB');
    expect(formatLimitBytes(null)).toBe('Unlimited');
  });
});
