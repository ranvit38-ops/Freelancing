import { NextResponse } from 'next/server';
import { claimPayPalEvent } from '@/server/queries';
import { getPayPalSubscription, verifyWebhook } from '@/server/paypal';
import { storeSubscription } from '@/server/billing-sync';

export const runtime = 'nodejs';

/**
 * PayPal webhook: renewals, failed payments, suspensions and cancellations.
 *
 * Verified with PayPal before anything is trusted; without that anyone could
 * POST themselves a paid plan. The event itself is only a nudge: the
 * subscription is then read from PayPal, so a forged or stale body changes
 * nothing. PayPal retries on any non-2xx and may deliver twice, so each event
 * id is claimed once.
 */
type Event = {
  id?: string;
  event_type?: string;
  resource_type?: string;
  resource?: { id?: string; billing_agreement_id?: string };
};

export async function POST(request: Request) {
  if (!process.env.PAYPAL_WEBHOOK_ID) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }
  const raw = await request.text();
  let verified = false;
  try {
    verified = await verifyWebhook(request.headers, raw);
  } catch (error) {
    // PayPal unreachable: a 500 makes it retry later.
    console.error('[labflow] PayPal webhook verification failed', error);
    return NextResponse.json({ error: 'Could not verify' }, { status: 500 });
  }
  // Never log the body here: it is unverified and attacker-controlled.
  if (!verified) return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });

  const event = JSON.parse(raw) as Event;
  const subscriptionId =
    event.resource_type === 'subscription' ? event.resource?.id : event.resource?.billing_agreement_id;
  if (!event.id || !subscriptionId) return NextResponse.json({ received: true, ignored: true });
  if (!(await claimPayPalEvent(event.id))) return NextResponse.json({ received: true, duplicate: true });

  try {
    const sub = await getPayPalSubscription(subscriptionId);
    if (sub.custom_id) await storeSubscription(sub.custom_id, sub);
  } catch (error) {
    console.error(`[labflow] PayPal webhook ${event.event_type} handling failed`, error);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
