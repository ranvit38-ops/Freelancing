import { formatDate } from '@/lib/display';
import { PLANS, isPlanId } from '@/lib/plans';
import {
  renewalReminderEmail,
  subscriptionCancelledEmail,
  subscriptionStartedEmail,
} from './account-emails';
import { absoluteUrl, sendEmail } from './mailer';
import {
  getPayPalSubscription,
  mapPayPalStatus,
  planForPayPalPlan,
  priceFor,
  type Interval,
  type PaidPlanId,
  type PayPalSubscription,
} from './paypal';
import {
  applySubscriptionEvent,
  billingContacts,
  claimBillingNotice,
  claimDueRenewalReminders,
  getSubscriptionByWorkspace,
} from './queries';

/**
 * Writes what PayPal says about a workspace's subscription.
 *
 * PayPal is the only authority on who has paid. This exists so that authority
 * can be *asked*, from the return redirect, a webhook, or the refresh button,
 * rather than only listened for: a webhook that never arrives is the failure
 * that costs a real customer.
 */

export type SyncResult = { ok: true; plan: string | null; status: string } | { ok: false; reason: string };

/** Stores one subscription for the lab it says it pays for, and sends the notice it calls for. */
export async function storeSubscription(workspaceId: string, sub: PayPalSubscription): Promise<SyncResult> {
  // custom_id is set by Labquill when the subscription is created and read
  // back from PayPal's own copy, so it cannot be steered by a browser.
  if (sub.custom_id !== workspaceId) return { ok: false, reason: 'That subscription belongs to a different lab.' };

  const status = mapPayPalStatus(sub.status);
  if (status === 'none') return { ok: false, reason: 'PayPal has not finished setting up the subscription yet.' };

  const existing = await getSubscriptionByWorkspace(workspaceId);
  // An older, cancelled subscription must not overwrite the one that replaced it.
  if (
    existing?.paypalSubscriptionId &&
    existing.paypalSubscriptionId !== sub.id &&
    existing.status === 'active' &&
    status === 'canceled'
  ) {
    return { ok: true, plan: existing.plan, status: existing.status };
  }

  const mapped = planForPayPalPlan(sub.plan_id);
  const next = sub.billing_info?.next_billing_time ? new Date(sub.billing_info.next_billing_time) : null;
  // A cancelled subscription has no next payment, but the period already paid
  // for still runs: keep the end date it had, so the lab keeps its plan until then.
  const currentPeriodEnd = next ?? (existing?.paypalSubscriptionId === sub.id ? existing.currentPeriodEnd : null);
  const plan = mapped?.plan ?? (existing?.paypalSubscriptionId === sub.id ? existing.plan : null);
  const interval = mapped?.interval ?? (existing?.billingInterval as Interval | null) ?? null;

  await applySubscriptionEvent({
    workspaceId,
    plan,
    status,
    currentPeriodEnd,
    paypalSubscriptionId: sub.id,
    billingInterval: interval,
  });

  if (plan && isPlanId(plan) && plan !== 'free' && interval && (status === 'active' || status === 'canceled')) {
    // A change of plan or period is a change of terms, so it gets its own confirmation.
    const state = status === 'active' ? `${sub.id}:active:${plan}:${interval}` : `${sub.id}:canceled`;
    if (await claimBillingNotice(workspaceId, state)) {
      await notify(workspaceId, status === 'active' ? subscriptionStartedEmail : subscriptionCancelledEmail, {
        plan,
        interval,
        date: currentPeriodEnd,
      });
    }
  }
  return { ok: true, plan, status };
}

/**
 * Asks PayPal directly what this workspace is paying for, and records it.
 *
 * `subscriptionId` comes off the return redirect, the only handle there is
 * before anything has been stored; after that the stored id is used.
 */
export async function syncSubscriptionFromPayPal(workspaceId: string, subscriptionId?: string | null): Promise<SyncResult> {
  const id = subscriptionId ?? (await getSubscriptionByWorkspace(workspaceId))?.paypalSubscriptionId;
  if (!id) return { ok: false, reason: 'This lab has no PayPal subscription yet.' };
  return storeSubscription(workspaceId, await getPayPalSubscription(id));
}

/** Emails a lab's owners and admins about its billing. Never throws: billing must not fail on email. */
async function notify(
  workspaceId: string,
  build: typeof subscriptionStartedEmail,
  input: { plan: PaidPlanId; interval: Interval; date: Date | null },
) {
  let billingLink: string;
  let termsLink: string;
  try {
    billingLink = absoluteUrl('/billing');
    termsLink = absoluteUrl('/terms');
  } catch (error) {
    console.warn(`[labflow] billing notice not sent: ${(error as Error).message}`);
    return;
  }
  const contacts = await billingContacts(workspaceId);
  for (const contact of contacts) {
    const email = build({
      name: contact.name,
      labName: contact.labName,
      planName: PLANS[input.plan].name,
      price: `$${priceFor(input.plan, input.interval).toLocaleString('en-US')}`,
      interval: input.interval,
      date: input.date ? formatDate(input.date) : null,
      billingLink,
      termsLink,
    });
    await sendEmail({ to: contact.email, ...email }).catch((error: Error) =>
      console.warn(`[labflow] billing notice to ${contact.email} not sent: ${error.message}`),
    );
  }
}

/** Sends the reminders due before yearly renewals. Safe to run on any schedule, on any number of servers. */
export async function sendRenewalReminders(): Promise<number> {
  const due = await claimDueRenewalReminders();
  for (const row of due) {
    if (!row.plan || !isPlanId(row.plan) || row.plan === 'free') continue;
    await notify(row.workspaceId, renewalReminderEmail, { plan: row.plan, interval: 'year', date: row.renewsOn });
  }
  return due.length;
}
