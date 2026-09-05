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

describe('usable', () => {
  it('allows an active plan and blocks none/canceled', () => {
    expect(usable(base, NOW)).toBe(true);
    expect(usable({ ...base, status: 'canceled' }, NOW)).toBe(false);
    expect(usable({ ...base, plan: null, status: 'none' }, NOW)).toBe(false);
    expect(usable(null, NOW)).toBe(false);
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

  it('gives a live trial the smallest plan, so a lab can try it as a team', () => {
    expect(seatLimit({ ...base, plan: null, status: 'trialing', trialEndsAt: '2026-05-10' })).toBe(
      PLANS.lab.seats,
    );
  });

  it('gives nothing without a usable subscription', () => {
    expect(seatLimit(null)).toBe(0);
    expect(seatLimit({ ...base, status: 'canceled' })).toBe(0);
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

  it('warns on a failed payment and on no plan at all', () => {
    expect(subscriptionNotice({ ...base, status: 'past_due' }, NOW)).toContain('payment failed');
    expect(subscriptionNotice(null, NOW)).toContain('no plan');
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
    const { toSubscriptionState, seatLimit } = await import('./plans');
    const state = toSubscriptionState({ ...row, plan: 'enterprise-retired' });
    expect(state?.plan).toBeNull();
    expect(seatLimit(state)).toBe(0);
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
