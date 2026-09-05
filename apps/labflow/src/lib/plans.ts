/**
 * Seat-based plans.
 *
 * Priced against what an academic lab actually faces: LabArchives is roughly
 * £/$330 per user per year for academics, while Benchling, SciNote and eLabFTW
 * all have a free tier. So LabFlow is priced per *lab*, not per seat, and lands
 * well under the paid comparator — a five-person lab pays about a third of what
 * LabArchives charges for the same five people.
 */

export type PlanId = 'free' | 'lab' | 'group' | 'department';

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
  limits: Limits;
};

/**
 * What a plan allows. Free is deliberately thin: enough to see LabFlow work,
 * not enough to run a lab on. When a paid plan lapses the workspace becomes
 * read-only — records stay visible and nothing is ever deleted, because a
 * research tool that destroys data on a timer is one nobody will trust.
 */
export type Limits = {
  projects: number | null;
  experiments: number | null;
  /** Total upload bytes across the workspace. */
  storageBytes: number | null;
  /** LabBot questions per calendar month. */
  aiPerMonth: number;
  compare: boolean;
  researchMemory: boolean;
  pptxExport: boolean;
  pubmed: boolean;
  discussion: boolean;
  prioritySupport: boolean;
  invoiceBilling: boolean;
};

const UNLIMITED: Omit<Limits, 'aiPerMonth'> = {
  projects: null,
  experiments: null,
  storageBytes: null,
  compare: true,
  researchMemory: true,
  pptxExport: true,
  pubmed: true,
  discussion: true,
  prioritySupport: false,
  invoiceBilling: false,
};

const GB = 1024 ** 3;

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    monthly: 0,
    yearly: 0,
    seats: 1,
    blurb: 'Enough to see how LabFlow works.',
    features: [
      '1 person',
      '1 project, 10 experiments',
      '50 MB of uploads',
      'Links and video',
      '5 LabBot questions a month',
    ],
    limits: {
      projects: 1,
      experiments: 10,
      storageBytes: 50 * 1024 * 1024,
      aiPerMonth: 5,
      compare: false,
      researchMemory: false,
      pptxExport: false,
      pubmed: false,
      discussion: false,
      prioritySupport: false,
      invoiceBilling: false,
    },
  },
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
    limits: { ...UNLIMITED, storageBytes: 10 * GB, aiPerMonth: 200 },
  },
  group: {
    id: 'group',
    name: 'Group',
    monthly: 99,
    yearly: 990,
    seats: 10,
    blurb: 'A larger group, or a PI running two lines of work.',
    features: ['10 people', 'Everything in Lab', '50 GB of uploads', 'Priority support', 'Invoice or PO billing'],
    limits: {
      ...UNLIMITED,
      storageBytes: 50 * GB,
      aiPerMonth: 750,
      prioritySupport: true,
      invoiceBilling: true,
    },
  },
  department: {
    id: 'department',
    name: 'Department',
    monthly: 249,
    yearly: 2490,
    seats: 25,
    blurb: 'Several groups sharing protocols and samples.',
    features: [
      '25 people',
      'Everything in Group',
      '200 GB of uploads',
      'Unlimited LabBot',
      'Onboarding session',
    ],
    limits: {
      ...UNLIMITED,
      storageBytes: 200 * GB,
      aiPerMonth: Number.POSITIVE_INFINITY,
      prioritySupport: true,
      invoiceBilling: true,
    },
  },
};

export const PLAN_ORDER: PlanId[] = ['free', 'lab', 'group', 'department'];
/** Only these can be bought; free is what you fall back to. */
export const PAID_PLANS: PlanId[] = ['lab', 'group', 'department'];

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

/** The plan actually in force right now, falling back to free. */
export function effectivePlan(sub: SubscriptionState | null, now: Date = new Date()): PlanId {
  if (!sub) return 'free';
  // A trial is the smallest paid plan, so a lab can try it as a team.
  if (sub.status === 'trialing' && trialLive(sub, now)) return 'lab';
  if (sub.plan && paidActive(sub)) return sub.plan;
  return 'free';
}

/** What the workspace may do right now. */
export function limitsFor(sub: SubscriptionState | null, now: Date = new Date()): Limits {
  return PLANS[effectivePlan(sub, now)].limits;
}

/** Seats a workspace may fill, including any bought beyond the plan. */
export function seatLimit(sub: SubscriptionState | null, now: Date = new Date()): number {
  const plan = effectivePlan(sub, now);
  return PLANS[plan].seats + (plan === 'free' ? 0 : (sub?.extraSeats ?? 0));
}

function trialLive(sub: SubscriptionState, now: Date): boolean {
  return Boolean(sub.trialEndsAt) && new Date(sub.trialEndsAt!).getTime() > now.getTime();
}

function paidActive(sub: SubscriptionState): boolean {
  // past_due is a grace period, not a lockout — the card retry may still work.
  return sub.status === 'active' || sub.status === 'past_due';
}

/**
 * Whether the workspace may write at all.
 *
 * Free is writable within its limits; only a lapsed *paid* plan goes
 * read-only. Nothing is ever deleted for non-payment.
 */
export function canWrite(sub: SubscriptionState | null, now: Date = new Date()): boolean {
  if (!sub) return true; // free
  if (sub.status === 'canceled' || sub.status === 'none') return false;
  if (sub.status === 'trialing') return trialLive(sub, now);
  return paidActive(sub);
}

/** Alias kept for call sites that ask "can this workspace be used". */
export function usable(sub: SubscriptionState | null, now: Date = new Date()): boolean {
  return canWrite(sub, now);
}

export function seatsRemaining(sub: SubscriptionState | null, members: number, pending: number) {
  return Math.max(0, seatLimit(sub) - members - pending);
}

/** Bytes formatted for a limit line: "50 MB", "10 GB", "Unlimited". */
export function formatLimitBytes(bytes: number | null): string {
  if (bytes === null) return 'Unlimited';
  if (bytes >= 1024 ** 3) return `${Math.round(bytes / 1024 ** 3)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

/** Plain sentence for the banner; null when there is nothing to say. */
export function subscriptionNotice(
  sub: SubscriptionState | null,
  now: Date = new Date(),
): string | null {
  if (!sub || sub.status === 'none') {
    return 'This workspace is read-only. Everything already recorded stays readable — choose a plan to write again.';
  }
  if (sub.status === 'canceled') {
    return 'This workspace is read-only — its plan has ended. Everything already recorded stays readable; nothing has been deleted.';
  }
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
