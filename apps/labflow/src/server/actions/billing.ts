'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { isPlanId } from '@/lib/plans';
import { absoluteUrl } from '../mailer';
import { requireSession } from '../authz';
import * as q from '../queries';
import { syncSubscriptionFromPayPal } from '../billing-sync';
import {
  BillingNotConfiguredError,
  PayPalError,
  billingProblem,
  cancelPayPalSubscription,
  createSubscription,
  reviseSubscription,
} from '../paypal';
import type { ActionState } from './types';

/**
 * Sends the workspace owner to PayPal to approve a subscription.
 *
 * A lab already paying is moved to the new plan instead (PayPal's "revise"),
 * so it is never subscribed twice.
 */
export async function startCheckoutAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession();
  if (session.role === 'member') {
    return { error: 'Only an owner or admin can change the plan for this lab.' };
  }

  const plan = String(formData.get('plan') ?? '');
  const interval = formData.get('interval') === 'year' ? 'year' : 'month';
  if (!isPlanId(plan) || plan === 'free') return { error: 'Choose one of the paid plans.' };

  const problem = billingProblem();
  if (problem) {
    return { error: `Payments are not configured on this deployment, so PayPal cannot open. Nothing was charged. ${problem}` };
  }

  let url: string;
  try {
    const existing = await q.getSubscription(session);
    const returnUrl = absoluteUrl('/api/paypal/return');
    const cancelUrl = absoluteUrl('/billing?checkout=cancelled');
    if (existing?.paypalSubscriptionId && (existing.status === 'active' || existing.status === 'past_due')) {
      url = (await reviseSubscription(existing.paypalSubscriptionId, { plan, interval, returnUrl, cancelUrl })).approveUrl;
    } else {
      url = (
        await createSubscription({
          plan,
          interval,
          workspaceId: session.workspaceId,
          email: session.userEmail,
          returnUrl,
          cancelUrl,
        })
      ).approveUrl;
    }
  } catch (error) {
    if (error instanceof BillingNotConfiguredError || error instanceof PayPalError) {
      return { error: `${error.message} Nothing was charged.` };
    }
    throw error;
  }
  redirect(url);
}

/**
 * Re-reads the plan from PayPal: the rescue for someone who has paid while the
 * workspace still says otherwise, which is what a lost webhook looks like.
 */
export async function syncBillingAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  const session = await requireSession();
  if (session.role === 'member') return { error: 'Only an owner or admin can refresh billing.' };
  const problem = billingProblem();
  if (problem) return { error: problem };
  try {
    const result = await syncSubscriptionFromPayPal(session.workspaceId);
    if (!result.ok) return { error: result.reason };
    revalidatePath('/', 'layout');
    return { ok: true, message: `PayPal says this lab's plan is ${result.status}.` };
  } catch (error) {
    if (error instanceof BillingNotConfiguredError || error instanceof PayPalError) {
      return { error: `${error.message} Nothing was changed.` };
    }
    throw error;
  }
}

/**
 * Cancels the lab's subscription with PayPal, from inside Labquill, in one
 * step: nobody should have to find PayPal's settings to stop paying. Nothing
 * more is charged; the plan runs to the end of the period already paid for.
 */
export async function cancelPlanAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession();
  if (session.role === 'member') return { error: 'Only an owner or admin can cancel the plan.' };
  if (formData.get('confirm') !== 'cancel') return { error: 'Tick the box to confirm.' };
  const existing = await q.getSubscription(session);
  if (!existing?.paypalSubscriptionId || existing.status === 'canceled') {
    return { error: 'This lab has no PayPal plan to cancel.' };
  }
  try {
    await cancelPayPalSubscription(existing.paypalSubscriptionId, `Cancelled in Labquill by ${session.userEmail}`);
    await syncSubscriptionFromPayPal(session.workspaceId, existing.paypalSubscriptionId);
  } catch (error) {
    if (error instanceof BillingNotConfiguredError || error instanceof PayPalError) {
      return { error: `${error.message} The plan was not cancelled; try again, or cancel it in your PayPal account under Automatic payments.` };
    }
    throw error;
  }
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Cancelled. Nothing more will be charged, and a confirmation is on its way by email.' };
}
