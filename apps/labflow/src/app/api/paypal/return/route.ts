import { NextResponse } from 'next/server';
import { getSession } from '@/server/auth';
import { absoluteUrl } from '@/server/mailer';
import { syncSubscriptionFromPayPal } from '@/server/billing-sync';

export const runtime = 'nodejs';

/**
 * Where PayPal sends a customer after they approve.
 *
 * The webhook is still the main path, but it is a separate delivery that can
 * be late or lost, and the customer's browser arrives here with the
 * subscription id in hand. Reading it here means the plan is live by the time
 * they see the page. The id is not trusted: PayPal's own copy must say it pays
 * for this lab.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.redirect(absoluteUrl('/login'));

  const subscriptionId = new URL(request.url).searchParams.get('subscription_id');
  try {
    const result = await syncSubscriptionFromPayPal(session.workspaceId, subscriptionId);
    if (!result.ok) {
      console.info(`[labflow] PayPal return could not sync yet: ${result.reason}`);
      return NextResponse.redirect(absoluteUrl('/billing?checkout=pending'));
    }
  } catch (error) {
    console.error('[labflow] PayPal return sync failed', error);
    return NextResponse.redirect(absoluteUrl('/billing?checkout=pending'));
  }
  return NextResponse.redirect(absoluteUrl('/billing?checkout=success'));
}
