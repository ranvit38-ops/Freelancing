import { describe, expect, it } from 'vitest';
import {
  PLANS,
  PLAN_ORDER,
  allowanceUsed,
  monthlyTotal,
  RENEWAL_TERMS,
  seatLimit,
  seatsRemaining,
  subscriptionNotice,
  usable,
  type SubscriptionState, effectivePlan } from './plans';

const NOW = new Date('2026-05-01T00:00:00Z');
const base: SubscriptionState = {
  plan: 'lab',
  status: 'active',
  trialEndsAt: null,
  currentPeriodEnd: '2026-06-01',
};

describe('canWrite', () => {
  it('allows an active plan and stops one that was paid for and ended', () => {
    expect(usable(base, NOW)).toBe(true);
    expect(usable({ ...base, status: 'canceled', currentPeriodEnd: '2026-04-01' }, NOW)).toBe(false);
  });

  it('lets a workspace that never paid write on the free plan', () => {
    // Locking out everyone who has not paid would mean nobody can evaluate the
    // product without a card. The free limits create the upgrade pressure.
    expect(usable({ ...base, plan: null, status: 'none' }, NOW)).toBe(true);
    expect(effectivePlan({ ...base, plan: null, status: 'none' }, NOW)).toBe('free');
  });

  it('lets a workspace with no subscription row write on the free plan', () => {
    // Free is a real state, not a lockout. Only a lapsed *paid* plan is read-only.
    expect(usable(null, NOW)).toBe(true);
  });

  it('keeps a past-due workspace working while the month it paid for runs', () => {
    expect(usable({ ...base, status: 'past_due' }, NOW)).toBe(true);
  });

  it('stops the plan when a month is never paid for, after a few days for PayPal to retry', async () => {
    const { PAYMENT_GRACE_DAYS, canWrite } = await import('./plans');
    const due = '2026-04-29T00:00:00Z'; // the month ended two days ago
    expect(PAYMENT_GRACE_DAYS).toBe(3);
    // Inside the grace days: still the paid plan, with a warning.
    for (const status of ['active', 'past_due'] as const) {
      expect(effectivePlan({ ...base, status, currentPeriodEnd: due }, NOW)).toBe('lab');
    }
    expect(subscriptionNotice({ ...base, status: 'active', currentPeriodEnd: due }, NOW)).toContain('payment has not gone through');
    // Past them: no payment, no plan. Read-only, nothing deleted.
    for (const status of ['active', 'past_due'] as const) {
      const unpaid = { ...base, status, currentPeriodEnd: '2026-04-20T00:00:00Z' };
      expect(effectivePlan(unpaid, NOW)).toBe('free');
      expect(canWrite(unpaid, NOW)).toBe(false);
      expect(subscriptionNotice(unpaid, NOW)).toContain('read-only');
    }
    // A renewal moves the period on, and the plan is back.
    expect(effectivePlan({ ...base, status: 'active', currentPeriodEnd: '2026-05-29T00:00:00Z' }, NOW)).toBe('lab');
  });

  it('gives a live trial the Lab plan, and an expired one the free plan', () => {
    const live = { ...base, status: 'trialing' as const, trialEndsAt: '2026-05-10' };
    const over = { ...base, status: 'trialing' as const, trialEndsAt: '2026-04-20' };
    expect(usable(live, NOW)).toBe(true);
    expect(effectivePlan(live, NOW)).toBe('lab');

    // An expired trial drops to free rather than locking the lab out of its
    // own records. Writing continues, within the free limits.
    expect(usable(over, NOW)).toBe(true);
    expect(effectivePlan(over, NOW)).toBe('free');
    expect(usable({ ...base, status: 'trialing', trialEndsAt: null }, NOW)).toBe(true);
  });
});

describe('seatLimit', () => {
  it('gives each plan exactly the people it covers, with nothing to buy on top', () => {
    expect(seatLimit(base, NOW)).toBe(PLANS.lab.seats);
    expect(seatLimit({ ...base, plan: 'group' }, NOW)).toBe(PLANS.group.seats);
    expect(seatLimit({ ...base, plan: 'department' }, NOW)).toBe(PLANS.department.seats);
  });

  it('gives a live trial the smallest paid plan, so a lab can try it as a team', () => {
    expect(
      seatLimit({ ...base, plan: null, status: 'trialing', trialEndsAt: '2026-05-10' }, NOW),
    ).toBe(PLANS.lab.seats);
  });

  it('falls back to the free plan’s single seat when nothing is active', () => {
    expect(seatLimit(null, NOW)).toBe(PLANS.free.seats);
    expect(seatLimit({ ...base, status: 'canceled', currentPeriodEnd: '2026-04-01' }, NOW)).toBe(PLANS.free.seats);
  });
});

describe('seatsRemaining', () => {
  it('counts members and outstanding invites against the limit', () => {
    expect(seatsRemaining(base, 2, 1, NOW)).toBe(PLANS.lab.seats - 3);
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
    expect(subscriptionNotice({ ...base, status: 'past_due' }, NOW)).toContain('payment has not gone through');
    const lapsed = subscriptionNotice({ ...base, status: 'canceled', currentPeriodEnd: '2026-04-01' }, NOW);
    expect(lapsed).toContain('read-only');
    expect(lapsed).toContain('stays readable');
  });
});

describe('toSubscriptionState', () => {
  const row = {
    plan: 'lab',
    status: 'active' as const,
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
  it('is the plan price and nothing else, because there is no add-on to bill', () => {
    for (const id of PLAN_ORDER) expect(monthlyTotal(id)).toBe(PLANS[id].monthly);
  });
});

describe('free tier and read-only lockout', () => {
  it('is the plan in force when nothing is subscribed', async () => {
    const { effectivePlan, limitsFor } = await import('./plans');
    expect(effectivePlan(null, NOW)).toBe('free');
    expect(limitsFor(null, NOW).projects).toBe(1);
    expect(limitsFor(null, NOW).experiments).toBe(10);
  });

  it('gives free every feature, because a feature nobody saw work is one nobody buys', async () => {
    const { limitsFor } = await import('./plans');
    const free = limitsFor(null, NOW);
    expect(free.compare).toBe(true);
    expect(free.pptxExport).toBe(true);
    expect(free.pubmed).toBe(true);
    expect(free.researchMemory).toBe(true);
    expect(free.discussion).toBe(true);
  });

  it('keeps free small rather than thin, and leaves room for a lab to talk', async () => {
    const { PLANS, limitsFor } = await import('./plans');
    // What is limited is what grows with real use.
    const free = limitsFor(null, NOW);
    expect(free.projects).toBe(1);
    expect(free.experiments).toBe(10);
    expect(free.aiPerMonth).toBe(5);
    // More than one person, or the collaboration features cannot be tried at all.
    expect(PLANS.free.seats).toBeGreaterThan(1);
    expect(PLANS.free.seats).toBeLessThan(PLANS.lab.seats);
    // Support and invoicing are promises about people, so they stay paid.
    expect(free.prioritySupport).toBe(false);
    expect(free.invoiceBilling).toBe(false);
  });

  it('makes a lapsed paid workspace read-only, not free-tier writable', async () => {
    const { canWrite, effectivePlan } = await import('./plans');
    const lapsed = { ...base, status: 'canceled' as const, currentPeriodEnd: '2026-04-01' };
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

describe('RENEWAL_TERMS', () => {
  it('says it renews, and both ways to cancel', () => {
    expect(RENEWAL_TERMS).toMatch(/renew automatically/);
    expect(RENEWAL_TERMS).toMatch(/Cancel plan/);
    expect(RENEWAL_TERMS).toMatch(/Automatic payments/);
  });
});

describe('allowanceUsed', () => {
  it('names the next plan up, and the own-key way out', () => {
    expect(allowanceUsed('free')).toMatch(/Free plan includes 5 AI requests.*Lab includes 200 a month.*own Claude key/);
    expect(allowanceUsed('group')).toMatch(/Department includes 2,500 a month/);
    expect(allowanceUsed('department')).not.toMatch(/includes 2,500 a month\. Or/);
  });
});

describe('a cancelled plan', () => {
  it('keeps the plan until the period already paid for ends, then goes read-only', () => {
    const cancelled = { ...base, status: 'canceled' as const, currentPeriodEnd: '2026-05-20' };
    expect(effectivePlan(cancelled, NOW)).toBe('lab');
    expect(usable(cancelled, NOW)).toBe(true);
    expect(subscriptionNotice(cancelled, NOW)).toMatch(/stays active until May 20, 2026/);
    const after = new Date('2026-05-21T00:00:00Z');
    expect(effectivePlan(cancelled, after)).toBe('free');
    expect(usable(cancelled, after)).toBe(false);
  });
});
