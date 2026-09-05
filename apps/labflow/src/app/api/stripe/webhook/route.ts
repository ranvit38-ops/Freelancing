import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { applySubscriptionEvent, claimStripeEvent } from '@/server/queries';
import { mapStatus, planForPrice, seatPriceId, stripe } from '@/server/billing';

export const runtime = 'nodejs';

/**
 * Stripe webhook — the only place subscription state is written.
 *
 * The signature is verified against the raw body before anything is trusted;
 * without that check anyone could POST themselves a free plan. Stripe retries
 * on any non-2xx, and may deliver the same event twice, so each event id is
 * claimed once and replays become no-ops.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, secret);
  } catch {
    // Never log the body here: it is unverified and attacker-controlled.
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (!(await claimStripeEvent(event.id))) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const workspaceId = session.client_reference_id ?? session.metadata?.workspaceId;
        if (!workspaceId || !session.subscription) break;
        const subscription = await stripe().subscriptions.retrieve(String(session.subscription));
        await store(workspaceId, subscription);
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const workspaceId = subscription.metadata?.workspaceId;
        if (!workspaceId) break;
        await store(workspaceId, subscription);
        break;
      }
      default:
        break;
    }
  } catch (error) {
    // A 500 tells Stripe to retry, which is what we want for a transient fault.
    console.error('[labflow] stripe webhook handling failed', error);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/** Derives the plan and seat count from the subscription's own line items. */
async function store(workspaceId: string, subscription: Stripe.Subscription) {
  const seatPrice = seatPriceId();
  let plan: string | null = null;
  let extraSeats = 0;

  for (const item of subscription.items.data) {
    const priceId = item.price.id;
    if (seatPrice && priceId === seatPrice) extraSeats += item.quantity ?? 0;
    else plan = planForPrice(priceId) ?? plan;
  }
  // Fall back to what checkout recorded if the price ids have since changed.
  plan = plan ?? subscription.metadata?.plan ?? null;

  await applySubscriptionEvent({
    workspaceId,
    plan,
    status: mapStatus(subscription.status),
    extraSeats,
    currentPeriodEnd: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null,
    stripeCustomerId:
      typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
    stripeSubscriptionId: subscription.id,
  });
}
