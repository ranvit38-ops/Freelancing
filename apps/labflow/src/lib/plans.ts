/**
 * Seat-based plans.
 *
 * Priced against what an academic lab actually faces: LabArchives is roughly
 * £/$330 per user per year for academics, while Benchling, SciNote and eLabFTW
 * all have a free tier. So Labquill is priced per *lab*, not per seat, and lands
 * well under the paid comparator, a five-person lab pays about a third of what
 * LabArchives charges for the same five people.
 *
 * There is deliberately no per-person add-on. A lab that outgrows its plan
 * moves up a plan. That keeps the price a lab can state in one sentence, and
 * keeps PayPal down to three products with nothing metered.
 */

export type PlanId = 'free' | 'lab' | 'group' | 'department';

export type Plan = {
  id: PlanId;
  name: string;
  /** Monthly price in whole currency units. */
  monthly: number;
  /** Two months free, the usual annual discount. */
  yearly: number;
  /** People who may be in the workspace. The way to get more is a bigger plan. */
  seats: number;
  blurb: string;
  features: string[];
  limits: Limits;
};

/**
 * What a plan allows. Free is deliberately thin: enough to see Labquill work,
 * not enough to run a lab on. When a paid plan lapses the workspace becomes
 * read-only, records stay visible and nothing is ever deleted, because a
 * research tool that destroys data on a timer is one nobody will trust.
 */
export type Limits = {
  projects: number | null;
  experiments: number | null;
  /** Total upload bytes across the workspace. */
  storageBytes: number | null;
  /** AI requests per calendar month, every AI feature counted alike. A lab's own key is not limited. */
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
    seats: 3,
    blurb: 'The whole product, sized for trying it.',
    features: [
      'Up to 3 people, talking to each other',
      '1 project, 10 experiments',
      '50 MB of uploads',
      'Every feature the paid plans have',
      '5 AI requests a month, or no limit with your own Claude key',
    ],
    limits: {
      // Free is the whole product at small scale, not a crippled demo. A lab
      // cannot judge a collaboration tool alone, and a feature they never saw
      // working is a feature they will not pay for. What is limited is the
      // things that grow with real use: projects, runs, storage, AI questions.
      // Those bite within weeks of actually adopting it, which is the point.
      projects: 1,
      experiments: 10,
      storageBytes: 50 * 1024 * 1024,
      aiPerMonth: 5,
      compare: true,
      researchMemory: true,
      pptxExport: true,
      pubmed: true,
      discussion: true,
      // The two that stay paid are not software. They are promises about
      // people: someone answering fast, and someone raising an invoice.
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
      '200 AI requests a month, or no limit with your own Claude key',
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
    features: ['10 people', 'Everything in Lab', '750 AI requests a month', '50 GB of uploads', 'Priority support', 'Invoice or PO billing'],
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
      '2,500 AI requests a month',
      'Onboarding session',
    ],
    limits: {
      ...UNLIMITED,
      storageBytes: 200 * GB,
      aiPerMonth: 2500,
      prioritySupport: true,
      invoiceBilling: true,
    },
  },
};

export const PLAN_ORDER: PlanId[] = ['free', 'lab', 'group', 'department'];
/** Only these can be bought; free is what you fall back to. */
export const PAID_PLANS: PlanId[] = ['lab', 'group', 'department'];

/** A new workspace gets this long to try Labquill before it needs a plan. */
export const TRIAL_DAYS = 14;

export type SubscriptionState = {
  plan: PlanId | null;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'none';
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
  if (sub.plan && paidActive(sub, now)) return sub.plan;
  return 'free';
}

/** What the workspace may do right now. */
export function limitsFor(sub: SubscriptionState | null, now: Date = new Date()): Limits {
  return PLANS[effectivePlan(sub, now)].limits;
}

/** People this workspace may hold. Fixed by the plan; more people means a bigger plan. */
export function seatLimit(sub: SubscriptionState | null, now: Date = new Date()): number {
  return PLANS[effectivePlan(sub, now)].seats;
}

function trialLive(sub: SubscriptionState, now: Date): boolean {
  return Boolean(sub.trialEndsAt) && new Date(sub.trialEndsAt!).getTime() > now.getTime();
}

function paidActive(sub: SubscriptionState, now: Date): boolean {
  // past_due is a grace period, not a lockout, the card retry may still work.
  if (sub.status === 'active' || sub.status === 'past_due') return true;
  // Cancelled, but the period already paid for has not ended: the Terms
  // promise the plan until then, and nothing more is charged.
  return sub.status === 'canceled' && paidThrough(sub, now);
}

function paidThrough(sub: SubscriptionState, now: Date): boolean {
  return Boolean(sub.currentPeriodEnd) && new Date(sub.currentPeriodEnd!).getTime() > now.getTime();
}

/**
 * Whether the workspace may write at all.
 *
 * Free is writable within its limits. Only a plan that was paid for and then
 * ended goes read-only, and nothing is ever deleted for non-payment.
 *
 * A workspace that never paid, and one whose trial ran out, both land on the
 * free plan rather than being locked out. Locking them out would mean nobody
 * could evaluate the product without a card, which is the opposite of what a
 * free tier is for. The free limits are what create the pressure to upgrade;
 * a wall is not.
 */
export function canWrite(sub: SubscriptionState | null, now: Date = new Date()): boolean {
  if (!sub) return true; // never subscribed: free
  if (sub.status === 'canceled') return paidThrough(sub, now); // paid, then ended (once the paid period runs out)
  if (sub.status === 'none') return true; // never paid: free
  if (sub.status === 'trialing') return true; // trial over drops to free, not out
  return paidActive(sub, now);
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
  if (!sub || sub.status === 'none') return null; // free: the plan banner says it
  if (sub.status === 'canceled') {
    if (paidThrough(sub, now)) {
      return `The plan is cancelled and nothing more will be charged. It stays active until ${new Date(sub.currentPeriodEnd!).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}; after that the lab becomes read-only, and nothing is deleted.`;
    }
    return 'This lab is read-only because its plan has ended. Everything already recorded stays readable, and nothing has been deleted.';
  }
  if (sub.status === 'past_due') {
    return 'The last payment failed. Update the card to avoid losing access.';
  }
  if (sub.status === 'trialing') {
    if (!sub.trialEndsAt) return null;
    const days = Math.ceil((new Date(sub.trialEndsAt).getTime() - now.getTime()) / 86_400_000);
    if (days <= 0) {
      return 'The trial has ended, so this workspace is on the free plan. Choose a plan for the rest.';
    }
    return `${days} day${days === 1 ? '' : 's'} left in the trial.`;
  }
  return null;
}

/** What a workspace on this plan pays each month. The plan price, and nothing else. */
export function monthlyTotal(plan: PlanId): number {
  return PLANS[plan].monthly;
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
  trialEndsAt: Date | string | null;
  currentPeriodEnd: Date | string | null;
} | null): SubscriptionState | null {
  if (!row) return null;
  return {
    plan: row.plan && isPlanId(row.plan) ? row.plan : null,
    status: row.status,
    trialEndsAt: row.trialEndsAt,
    currentPeriodEnd: row.currentPeriodEnd,
  };
}

/**
 * Shown beside the buttons that start a subscription, and in the emails about
 * it: that it renews, and how to stop it. PayPal's approval page shows the
 * price and period itself.
 */
export const RENEWAL_TERMS =
  'Plans renew automatically at the end of each month or year, at the price shown, until you cancel. ' +
  'Cancel any time in Labquill under Billing, then Cancel plan, or in your PayPal account under Automatic payments; ' +
  'the plan stays active until the end of the period you have paid for, and nothing more is charged.';

/** Said when a lab has used its month of AI requests: what the next plan gives, and the own-key way out. */
export function allowanceUsed(plan: PlanId): string {
  const next = PLAN_ORDER[PLAN_ORDER.indexOf(plan) + 1];
  const count = (id: PlanId) => PLANS[id].limits.aiPerMonth.toLocaleString('en-US');
  const more = next ? ` ${PLANS[next].name} includes ${count(next)} a month.` : '';
  return (
    `The ${PLANS[plan].name} plan includes ${count(plan)} AI requests a month, and this lab has used them.` +
    `${more} Or a lab owner can add the lab's own Claude key in Settings, which has no limit.`
  );
}
