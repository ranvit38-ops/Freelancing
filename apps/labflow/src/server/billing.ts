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
 *   2. Put the price ids in STRIPE_PRICE_LAB / _GROUP / _DEPARTMENT / _SEAT.
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

export function billingConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      Object.values(PRICE_ENV).every((key) => process.env[key]),
  );
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

/** Optional: a metered price for seats beyond the plan. */
export function seatPriceId(): string | null {
  return process.env.STRIPE_PRICE_SEAT ?? null;
}

/** Maps a Stripe price id back to the plan it represents. */
export function planForPrice(priceId: string): PlanId | null {
  for (const plan of Object.keys(PRICE_ENV) as PaidPlanId[]) {
    if (process.env[PRICE_ENV[plan]] === priceId) return plan;
  }
  return null;
}

/** Stripe's subscription statuses, narrowed to the ones LabFlow acts on. */
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
