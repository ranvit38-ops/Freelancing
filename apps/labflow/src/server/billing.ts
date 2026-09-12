import Stripe from 'stripe';
import { PLANS, type PlanId } from '@/lib/plans';

/**
 * Stripe, via Checkout and the Customer Portal.
 *
 * Both are hosted by Stripe, so no card details ever reach this server and
 * there is no PCI surface to defend. Money lands in the connected bank account
 * on Stripe's normal payout schedule.
 *
 * SETUP REQUIRED before this can take a payment:
 *   1. Create the products and recurring prices in the Stripe dashboard.
 *   2. Put the price ids in STRIPE_PRICE_LAB / _GROUP / _DEPARTMENT.
 *   3. Add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.
 *   4. Point a webhook endpoint at /api/stripe/webhook for the
 *      checkout.session.completed and customer.subscription.* events.
 */

export class BillingNotConfiguredError extends Error {
  constructor() {
    super(
      'Payments are not configured on this deployment. Set STRIPE_SECRET_KEY and the plan price ids.',
    );
    this.name = 'BillingNotConfiguredError';
  }
}

/** Free has no Stripe price; it is what a workspace falls back to. */
const PRICE_ENV: Record<PaidPlanId, string> = {
  lab: 'STRIPE_PRICE_LAB',
  group: 'STRIPE_PRICE_GROUP',
  department: 'STRIPE_PRICE_DEPARTMENT',
};

type PaidPlanId = Exclude<PlanId, 'free'>;

/**
 * What is stopping this deployment taking a payment, in words, or null when
 * nothing is.
 *
 * Naming the actual gap matters more than it looks. A deployment with perfect
 * Stripe keys and no public address is broken in a way that says nothing about
 * Stripe, and being told to check the keys sends you looking in the one place
 * the fault is not.
 */
export function billingProblem(): string | null {
  if (!process.env.STRIPE_SECRET_KEY) {
    return 'STRIPE_SECRET_KEY is not set, so this deployment cannot reach Stripe.';
  }
  const missing = (Object.keys(PRICE_ENV) as PaidPlanId[])
    .filter((plan) => !process.env[PRICE_ENV[plan]])
    .map((plan) => PRICE_ENV[plan]);
  if (missing.length > 0) {
    return `${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not set, so those plans have no price to charge.`;
  }
  // A checkout with no public address sends the customer back to localhost
  // after paying. Refuse rather than take the money and strand them.
  if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_APP_URL) {
    return 'NEXT_PUBLIC_APP_URL is not set, so Stripe would send customers back to localhost after paying.';
  }
  return null;
}

export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new BillingNotConfiguredError();
  return new Stripe(key, { apiVersion: '2024-06-20' });
}

export function priceIdFor(plan: PaidPlanId): string {
  const id = process.env[PRICE_ENV[plan]];
  if (!id) throw new BillingNotConfiguredError();
  return id;
}

/** Maps a Stripe price id back to the plan it represents. */
export function planForPrice(priceId: string): PlanId | null {
  for (const plan of Object.keys(PRICE_ENV) as PaidPlanId[]) {
    if (process.env[PRICE_ENV[plan]] === priceId) return plan;
  }
  return null;
}

/** Stripe's subscription statuses, narrowed to the ones Labvia acts on. */
export function mapStatus(
  status: Stripe.Subscription.Status,
): 'trialing' | 'active' | 'past_due' | 'canceled' | 'none' {
  switch (status) {
    case 'trialing':
      return 'trialing';
    case 'active':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    default:
      return 'none';
  }
}

export function planName(plan: PlanId): string {
  return PLANS[plan].name;
}
