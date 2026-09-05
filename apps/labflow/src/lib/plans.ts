/**
 * Seat-based plans.
 *
 * Priced against what an academic lab actually faces: LabArchives is roughly
 * £/$330 per user per year for academics, while Benchling, SciNote and eLabFTW
 * all have a free tier. So LabFlow is priced per *lab*, not per seat, and lands
 * well under the paid comparator — a five-person lab pays about a third of what
 * LabArchives charges for the same five people.
 */

export type PlanId = 'lab' | 'group' | 'department';

export type Plan = {
  id: PlanId;
  name: string;
  /** Monthly price in whole currency units. */
  monthly: number;
  /** Two months free, the usual annual discount. */
  yearly: number;
  seats: number;
  blurb: string;
  features: string[];
};

export const PLANS: Record<PlanId, Plan> = {
  lab: {
    id: 'lab',
    name: 'Lab',
    monthly: 49,
    yearly: 490,
    seats: 5,
    blurb: 'A single research group.',
    features: [
      '5 people',
      'Unlimited projects and experiments',
      'Uploads, links and datasets',
      'Comparison, timeline and research memory',
      'LabBot with PubMed grounding',
      'PowerPoint research updates',
    ],
  },
  group: {
    id: 'group',
    name: 'Group',
    monthly: 89,
    yearly: 890,
    seats: 10,
    blurb: 'A larger group, or a PI running two lines of work.',
    features: ['10 people', 'Everything in Lab', 'Priority support'],
  },
  department: {
    id: 'department',
    name: 'Department',
    monthly: 199,
    yearly: 1990,
    seats: 25,
    blurb: 'Several groups sharing protocols and samples.',
    features: ['25 people', 'Everything in Group', 'Onboarding help'],
  },
};

export const PLAN_ORDER: PlanId[] = ['lab', 'group', 'department'];

/** Extra seats beyond the plan, charged per person per month. */
export const EXTRA_SEAT_PRICE = 9;

/** A new workspace gets this long to try LabFlow before it needs a plan. */
export const TRIAL_DAYS = 14;

export type SubscriptionState = {
  plan: PlanId | null;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'none';
  extraSeats: number;
  trialEndsAt: Date | string | null;
  currentPeriodEnd: Date | string | null;
};

export function isPlanId(value: string): value is PlanId {
  return value in PLANS;
}

/** Seats a workspace may fill, including any bought beyond the plan. */
export function seatLimit(sub: SubscriptionState | null): number {
  if (!sub) return 0;
  // A trial gets the smallest plan's seats, so a lab can try it as a team.
  if (sub.status === 'trialing') return PLANS.lab.seats + sub.extraSeats;
  if (!sub.plan || !usable(sub)) return 0;
  return PLANS[sub.plan].seats + sub.extraSeats;
}

/** Whether the workspace may be used at all right now. */
export function usable(sub: SubscriptionState | null, now: Date = new Date()): boolean {
  if (!sub) return false;
  if (sub.status === 'active') return true;
  if (sub.status === 'past_due') return true; // a grace period, not a lockout
  if (sub.status === 'trialing') {
    if (!sub.trialEndsAt) return false;
    return new Date(sub.trialEndsAt).getTime() > now.getTime();
  }
  return false;
}

export function seatsRemaining(sub: SubscriptionState | null, members: number, pending: number) {
  return Math.max(0, seatLimit(sub) - members - pending);
}

/** Plain sentence for the banner; null when there is nothing to say. */
export function subscriptionNotice(
  sub: SubscriptionState | null,
  now: Date = new Date(),
): string | null {
  if (!sub || sub.status === 'none') return 'This workspace has no plan yet.';
  if (sub.status === 'canceled') return 'This workspace’s plan has ended.';
  if (sub.status === 'past_due') {
    return 'The last payment failed. Update the card to avoid losing access.';
  }
  if (sub.status === 'trialing') {
    if (!sub.trialEndsAt) return 'Trial ended.';
    const days = Math.ceil((new Date(sub.trialEndsAt).getTime() - now.getTime()) / 86_400_000);
    if (days <= 0) return 'The trial has ended. Choose a plan to carry on.';
    return `${days} day${days === 1 ? '' : 's'} left in the trial.`;
  }
  return null;
}

/** Monthly total including extra seats, for display. */
export function monthlyTotal(plan: PlanId, extraSeats: number): number {
  return PLANS[plan].monthly + extraSeats * EXTRA_SEAT_PRICE;
}

/**
 * Narrows a stored subscription row into a SubscriptionState.
 *
 * `plan` is text in the database, so a renamed or retired plan reads back as an
 * unknown string. Treating that as "no plan" is the safe direction: the
 * workspace falls back to whatever its status allows rather than being granted
 * seats from a plan that no longer exists.
 */
export function toSubscriptionState(row: {
  plan: string | null;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'none';
  extraSeats: number;
  trialEndsAt: Date | string | null;
  currentPeriodEnd: Date | string | null;
} | null): SubscriptionState | null {
  if (!row) return null;
  return {
    plan: row.plan && isPlanId(row.plan) ? row.plan : null,
    status: row.status,
    extraSeats: row.extraSeats,
    trialEndsAt: row.trialEndsAt,
    currentPeriodEnd: row.currentPeriodEnd,
  };
}
