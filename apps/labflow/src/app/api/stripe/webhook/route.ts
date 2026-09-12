import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { claimStripeEvent } from '@/server/queries';
import { stripe } from '@/server/billing';
import { storeSubscription as store } from '@/server/billing-sync';

export const runtime = 'nodejs';

/**
 * Stripe webhook, the only place subscription state is written.
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
