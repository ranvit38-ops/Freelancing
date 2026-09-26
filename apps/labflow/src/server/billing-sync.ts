import type Stripe from 'stripe';
import { applySubscriptionEvent, getSubscriptionByWorkspace } from './queries';
import { mapStatus, planForPrice, stripe } from './billing';

/**
 * Writes what Stripe says about a workspace's subscription.
 *
 * Stripe is the only authority on who has paid. This file exists so that
 * authority can be *asked*, rather than only listened for. A webhook that never
 * arrives is the one failure that costs a real customer: they are charged,
 * nothing unlocks, and the app has no idea anything happened.
 */

/** Derives the plan from the subscription's own line items, then stores it. */
export async function storeSubscription(workspaceId: string, subscription: Stripe.Subscription) {
  let plan: string | null = null;
  for (const item of subscription.items.data) {
    plan = planForPrice(item.price.id) ?? plan;
  }
  // Fall back to what checkout recorded if the price ids have since changed.
  plan = plan ?? subscription.metadata?.plan ?? null;

  await applySubscriptionEvent({
    workspaceId,
    plan,
    status: mapStatus(subscription.status),
    currentPeriodEnd: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null,
    stripeCustomerId:
      typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
    stripeSubscriptionId: subscription.id,
  });
}

export type SyncResult =
  | { ok: true; plan: string | null; status: string }
  | { ok: false; reason: string };

/**
 * Asks Stripe directly what this workspace is paying for, and records it.
 *
 * Two ways in, because a first purchase and a later one fail differently:
 *
 *  - `checkoutSessionId`, straight off the redirect Stripe sends the customer
 *    back with. This is the only handle that exists before any subscription has
 *    ever been stored, so it is what rescues a first purchase whose webhook was
 *    lost.
 *  - the stored customer id, for every time after that.
 *
 * Safe to call repeatedly. It writes the same state the webhook would, so the
 * two racing produces one outcome rather than two.
 */
export async function syncSubscriptionFromStripe(
  workspaceId: string,
  checkoutSessionId?: string | null,
): Promise<SyncResult> {
  const client = stripe();

  if (checkoutSessionId) {
    const checkout = await client.checkout.sessions.retrieve(checkoutSessionId);
    // The id came back through the customer's browser, so it is not trusted
    // until Stripe's own copy says it belongs to this workspace.
    const claimed = checkout.client_reference_id ?? checkout.metadata?.workspaceId;
    if (claimed !== workspaceId) {
      return { ok: false, reason: 'That checkout belongs to a different workspace.' };
    }
    if (!checkout.subscription) {
      return { ok: false, reason: 'Stripe has not finished setting up the subscription yet.' };
    }
    const subscription = await client.subscriptions.retrieve(String(checkout.subscription));
    await storeSubscription(workspaceId, subscription);
    return { ok: true, plan: subscription.metadata?.plan ?? null, status: subscription.status };
  }

  const existing = await getSubscriptionByWorkspace(workspaceId);
  if (!existing?.stripeCustomerId) {
    return { ok: false, reason: 'This workspace has no Stripe customer yet.' };
  }

  // Newest first, so a re-subscription wins over the cancelled one before it.
  const list = await client.subscriptions.list({
    customer: existing.stripeCustomerId,
    status: 'all',
    limit: 10,
  });
  const subscription = list.data.sort((a, b) => b.created - a.created)[0];
  if (!subscription) {
    return { ok: false, reason: 'Stripe has no subscription for this customer.' };
  }

  await storeSubscription(workspaceId, subscription);
  return { ok: true, plan: subscription.metadata?.plan ?? null, status: subscription.status };
}
