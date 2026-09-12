'use server';

import { redirect } from 'next/navigation';
import { isPlanId } from '@/lib/plans';
import { absoluteUrl } from '../mailer';
import { requireSession } from '../authz';
import * as q from '../queries';
import { revalidatePath } from 'next/cache';
import { BillingNotConfiguredError, billingProblem, priceIdFor, stripe } from '../billing';
import { syncSubscriptionFromStripe } from '../billing-sync';
import type { ActionState } from './types';

/**
 * Sends the workspace owner to Stripe Checkout.
 *
 * Stripe hosts the card form and, once subscribed, raises and charges a monthly
 * invoice on its own. Billing address and tax id are collected because a
 * university finance office will not accept an invoice without them.
 */
export async function startCheckoutAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  if (session.role === 'member') {
    return { error: 'Only an owner or admin can change the plan for this workspace.' };
  }

  const plan = String(formData.get('plan') ?? '');
  if (!isPlanId(plan) || plan === 'free') {
    return { error: 'Choose one of the paid plans.' };
  }

  const problem = billingProblem();
  if (problem) {
    return {
      error: `Payments are not configured on this deployment, so checkout cannot open. Nothing was charged. ${problem}`,
    };
  }

  let url: string | null;
  try {
    const client = stripe();
    const existing = await q.getSubscription(session);

    // One line, always: the plan. There is no per-person add-on to price in.
    const checkout = await client.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceIdFor(plan), quantity: 1 }],
      customer: existing?.stripeCustomerId ?? undefined,
      customer_email: existing?.stripeCustomerId ? undefined : session.userEmail,
      client_reference_id: session.workspaceId,
      // Read back by the webhook, which has no session of its own.
      subscription_data: {
        metadata: { workspaceId: session.workspaceId, plan },
      },
      metadata: { workspaceId: session.workspaceId, plan },
      // A university finance office rejects an invoice without these.
      billing_address_collection: 'required',
      tax_id_collection: { enabled: true },
      allow_promotion_codes: true,
      success_url: absoluteUrl('/api/stripe/return?session_id={CHECKOUT_SESSION_ID}'),
      cancel_url: absoluteUrl('/billing?checkout=cancelled'),
    });
    url = checkout.url;
  } catch (error) {
    if (error instanceof BillingNotConfiguredError) return { error: error.message };
    console.error('[labflow] stripe checkout failed', error);
    return { error: 'Stripe could not open a checkout session. Nothing was charged.' };
  }

  if (!url) return { error: 'Stripe did not return a checkout link. Nothing was charged.' };
  redirect(url);
}

/**
 * Re-reads the subscription from Stripe.
 *
 * The safety net for the one failure that costs a customer: they paid, the
 * webhook never arrived, and nothing unlocked. Stripe knows the truth; this
 * asks for it.
 */
export async function syncBillingAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  if (session.role === 'member') {
    return { error: 'Only an owner or admin can refresh billing.' };
  }
  const problem = billingProblem();
  if (problem) return { error: problem };

  try {
    const result = await syncSubscriptionFromStripe(session.workspaceId);
    if (!result.ok) return { error: result.reason };
    revalidatePath('/billing');
    revalidatePath('/', 'layout');
    return { ok: true, message: `Stripe says this workspace is ${result.status}.` };
  } catch (error) {
    if (error instanceof BillingNotConfiguredError) return { error: error.message };
    console.error('[labflow] billing sync failed', error);
    return { error: 'Stripe could not be reached. Nothing was changed.' };
  }
}

/** Opens Stripe's own billing portal: card, invoices, cancellation. */
export async function openBillingPortalAction(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  if (session.role === 'member') {
    return { error: 'Only an owner or admin can manage billing.' };
  }

  const subscription = await q.getSubscription(session);
  if (!subscription?.stripeCustomerId) {
    return { error: 'This workspace has no billing account yet. Choose a plan first.' };
  }

  let url: string;
  try {
    const portal = await stripe().billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: absoluteUrl('/billing'),
    });
    url = portal.url;
  } catch (error) {
    if (error instanceof BillingNotConfiguredError) return { error: error.message };
    console.error('[labflow] stripe portal failed', error);
    return { error: 'Stripe could not open the billing portal.' };
  }
  redirect(url);
}

