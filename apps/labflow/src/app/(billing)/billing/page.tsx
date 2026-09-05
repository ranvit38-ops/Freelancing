import { BillingPortalButton, PlanPicker } from '@/components/billing-forms';
import { UnlockForm } from '@/components/unlock-form';
import { Badge, Card, CardHeader, DefinitionList, PageHeader } from '@/components/ui';
import { formatDate } from '@/lib/display';
import {
  PLANS,
  monthlyTotal,
  seatLimit,
  seatsRemaining,
  subscriptionNotice,
  toSubscriptionState,
} from '@/lib/plans';
import { billingConfigured } from '@/server/billing';
import { requireSession } from '@/server/authz';
import { getSubscription, seatUsage } from '@/server/queries';

export const metadata = { title: 'Billing' };
export const dynamic = 'force-dynamic';

export default async function BillingPage({
  searchParams,
}: {
  searchParams: { checkout?: string };
}) {
  const session = await requireSession();
  const [row, usage] = await Promise.all([getSubscription(session), seatUsage(session)]);
  const sub = toSubscriptionState(row);
  const notice = subscriptionNotice(sub);
  const canManage = session.role !== 'member';

  return (
    <>
      <PageHeader
        title="Billing"
        description="Plans are per lab, not per person. Stripe raises and charges a monthly invoice automatically."
      />

      {searchParams.checkout === 'success' ? (
        <p role="status" className="mb-5 rounded-lg border border-ok/25 bg-ok/5 px-4 py-3 text-sm text-ok">
          Payment set up. Stripe confirms the subscription in a moment; this page updates once it does.
        </p>
      ) : null}
      {searchParams.checkout === 'cancelled' ? (
        <p className="mb-5 rounded-lg border border-line bg-raised px-4 py-3 text-sm text-muted">
          Checkout was cancelled. Nothing was charged.
        </p>
      ) : null}
      {notice ? (
        <p className="mb-5 rounded-lg border border-warn/25 bg-warn/5 px-4 py-3 text-sm text-warn">
          {notice}
        </p>
      ) : null}

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold tracking-tight">This workspace</h2>
          <DefinitionList
            items={[
              {
                term: 'Plan',
                value: sub?.plan ? (
                  <Badge tone="accent">{PLANS[sub.plan].name}</Badge>
                ) : (
                  <span className="text-subtle">No plan</span>
                ),
              },
              { term: 'Status', value: sub?.status ?? 'none' },
              {
                term: 'Seats',
                value: `${usage.members + usage.pending} of ${seatLimit(sub)} used${
                  usage.pending > 0 ? ` (${usage.pending} invited)` : ''
                }`,
              },
              {
                term: 'Seats free',
                value: String(seatsRemaining(sub, usage.members, usage.pending)),
              },
              {
                term: sub?.status === 'trialing' ? 'Trial ends' : 'Renews',
                value: formatDate(
                  sub?.status === 'trialing' ? sub.trialEndsAt : (sub?.currentPeriodEnd ?? null),
                ),
              },
              {
                term: 'Monthly',
                value: sub?.plan ? `$${monthlyTotal(sub.plan, sub.extraSeats)}` : '—',
              },
            ]}
          />
          {row?.stripeCustomerId && canManage ? (
            <div className="mt-5 border-t border-line pt-4">
              <BillingPortalButton />
              <p className="mt-2 text-xs text-subtle">
                Opens Stripe, where the card, past invoices and cancellation all live.
              </p>
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="How payment works" />
          <div className="space-y-3 px-5 py-4 text-sm leading-6 text-muted">
            <p>
              Choosing a plan opens Stripe Checkout. Card details go straight to Stripe and never
              touch LabFlow, so there is no card data here to leak.
            </p>
            <p>
              After that it is automatic: Stripe raises an invoice each month, charges the card on
              file, emails the receipt, and retries a failed payment before anything is cut off.
            </p>
            <p>
              Billing address and tax ID are collected at checkout, because a university finance
              office will not accept an invoice without them.
            </p>
            {billingConfigured() ? null : (
              <p className="rounded-lg border border-warn/25 bg-warn/5 px-3 py-2 text-warn">
                Payments are not configured on this deployment, so checkout cannot open. Nothing can
                be charged until Stripe keys and price IDs are set.
              </p>
            )}
          </div>
        </Card>
      </div>

      <h2 className="mb-3 text-sm font-semibold tracking-tight">Plans</h2>
      <PlanPicker currentPlan={sub?.plan ?? null} canManage={canManage} />

      {process.env.LABFLOW_OWNER_UNLOCK && canManage ? (
        <div className="mt-6 max-w-md">
          <UnlockForm />
        </div>
      ) : null}
    </>
  );
}
