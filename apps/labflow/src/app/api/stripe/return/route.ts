import { NextResponse } from 'next/server';
import { getSession } from '@/server/auth';
import { absoluteUrl } from '@/server/mailer';
import { syncSubscriptionFromStripe } from '@/server/billing-sync';

export const runtime = 'nodejs';

/**
 * Where Stripe sends a customer after they pay.
 *
 * The webhook is still the main path, but it is a separate delivery that can be
 * late, misconfigured, or lost, and the customer's own browser arrives here
 * with proof of the purchase in hand. Reading it here means the plan is live by
 * the time they see the page, and a webhook that never comes costs nothing.
 *
 * Both paths write the same state, so whichever lands first wins and the other
 * is a no-op.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(absoluteUrl('/login'));

  const checkoutSessionId = new URL(request.url).searchParams.get('session_id');
  try {
    const result = await syncSubscriptionFromStripe(session.workspaceId, checkoutSessionId);
    if (!result.ok) {
      // Stripe sometimes needs a moment after checkout. The webhook covers
      // that, so say the payment went through rather than alarming someone
      // who has just been charged.
      console.info(`[labflow] checkout return could not sync yet: ${result.reason}`);
      return NextResponse.redirect(absoluteUrl('/billing?checkout=pending'));
    }
  } catch (error) {
    console.error('[labflow] checkout return sync failed', error);
    return NextResponse.redirect(absoluteUrl('/billing?checkout=pending'));
  }

  return NextResponse.redirect(absoluteUrl('/billing?checkout=success'));
}
