import { BillingPortalButton, PlanPicker, SyncBillingButton } from '@/components/billing-forms';
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
import { PILOT_PLAN, pilotMode } from '@/lib/pilot';
import { PilotFeedbackForm } from '@/components/pilot-feedback-form';
import { billingProblem } from '@/server/billing';
import { requireSession } from '@/server/authz';
import { getSubscription, myPilotFeedback, seatUsage } from '@/server/queries';

export const metadata = { title: 'Billing' };
export const dynamic = 'force-dynamic';

export default async function BillingPage({
  searchParams,
}: {
  searchParams: { checkout?: string };
}) {
  const session = await requireSession();

  // A pilot deployment has nothing to bill, so this route asks the only
  // question the pilot exists to answer instead of selling a plan to someone
  // who was promised the product for nothing.
  if (pilotMode()) return <PilotView session={session} />;

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
          Payment set up, and the plan below is what Stripe says you are on.
        </p>
      ) : null}
      {/* The payment went through. Stripe had just not finished creating the
          subscription when the customer landed back here, which is normal and
          resolves on its own. Never imply the charge failed. */}
      {searchParams.checkout === 'pending' ? (
        <p role="status" className="mb-5 rounded-lg border border-ok/25 bg-ok/5 px-4 py-3 text-sm text-ok">
          Payment received. Stripe is still finishing the subscription, which usually takes a few
          seconds. Reload this page, or use the refresh button below if it has not caught up.
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
                term: 'People',
                value: `${usage.members + usage.pending} of ${seatLimit(sub)} used${
                  usage.pending > 0 ? ` (${usage.pending} invited)` : ''
                }`,
              },
              {
                term: 'Room left',
                value: (() => {
                  const free = seatsRemaining(sub, usage.members, usage.pending);
                  if (free === 0) return 'none, the plan is full';
                  return `${free} more ${free === 1 ? 'person' : 'people'}`;
                })(),
              },
              {
                term: sub?.status === 'trialing' ? 'Trial ends' : 'Renews',
                value: formatDate(
                  sub?.status === 'trialing' ? sub.trialEndsAt : (sub?.currentPeriodEnd ?? null),
                ),
              },
              {
                term: 'Monthly',
                value: sub?.plan ? `$${monthlyTotal(sub.plan)}` : 'not recorded',
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
          {/* Shown to any manager, not only to workspaces that already have a
              Stripe customer. The case worth rescuing is someone who paid and
              whose workspace does not know it, and that workspace looks exactly
              like one that never paid. */}
          {canManage ? (
            <div className="mt-4 border-t border-line pt-4">
              <SyncBillingButton />
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="How payment works" />
          <div className="space-y-3 px-5 py-4 text-sm leading-6 text-muted">
            <p>
              Choosing a plan opens Stripe Checkout. Card details go straight to Stripe and never
              touch Labvia, so there is no card data here to leak.
            </p>
            <p>
              After that it is automatic: Stripe raises an invoice each month, charges the card on
              file, emails the receipt, and retries a failed payment before anything is cut off.
            </p>
            <p>
              Billing address and tax ID are collected at checkout, because a university finance
              office will not accept an invoice without them.
            </p>
            {billingProblem() ? (
              <p className="rounded-lg border border-warn/25 bg-warn/5 px-3 py-2 text-warn">
                Payments are not configured on this deployment, so checkout cannot open and nothing
                can be charged. {billingProblem()}
              </p>
            ) : null}
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

/**
 * The pilot's own billing page.
 *
 * It states the real price rather than hiding it. "Would you pay for this" is
 * unanswerable without a number attached, and a lab that finds out the price
 * only after the pilot ends feels handled rather than asked.
 */
async function PilotView({ session }: { session: Awaited<ReturnType<typeof requireSession>> }) {
  const existing = await myPilotFeedback(session);
  const plan = PLANS[PILOT_PLAN];

  return (
    <>
      <PageHeader
        title="What is it worth?"
        description="This lab is on a free pilot. Nothing here charges anything, and there is no card on file to charge."
      />

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold tracking-tight">What you have</h2>
          <DefinitionList
            items={[
              { term: 'Plan', value: <Badge tone="accent">{plan.name}, free</Badge> },
              { term: 'People', value: `Up to ${plan.seats}` },
              { term: 'Ends', value: 'No end date while the pilot runs' },
              { term: 'Cost to you', value: 'Nothing, and no card was asked for' },
              { term: 'Normally', value: `$${plan.monthly} a month for the whole lab` },
            ]}
          />
          <p className="mt-4 border-t border-line pt-4 text-sm leading-6 text-muted">
            Every feature is switched on, including the ones the paid plans
            charge for. That is deliberate: a feature you never saw working is
            one you cannot judge, and a pilot that hides half the product tells
            neither of us anything.
          </p>
        </Card>

        <Card>
          <CardHeader
            title="Why you are being asked"
            description="Straight answer, including the unflattering one."
          />
          <div className="space-y-3 px-5 py-4 text-sm leading-6 text-muted">
            <p>
              Labvia is new. Whether it is worth building further depends on
              whether labs like yours would actually pay for it, and the only
              people who can answer that are labs who have used it on real work.
            </p>
            <p>
              Saying no costs you nothing and does not switch anything off. A
              polite yes that is not true is the one answer that helps nobody,
              because it is the one that leads to a year spent on the wrong
              thing.
            </p>
            <p>
              Nothing you record here is deleted at the end of the pilot, and
              everything stays exportable.
            </p>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Four questions"
          description="Only the first needs an answer. Two minutes at most."
        />
        <PilotFeedbackForm
          existing={
            existing
              ? {
                  wouldPay: existing.wouldPay,
                  monthlyValue: existing.monthlyValue,
                  blocker: existing.blocker,
                  decisionMaker: existing.decisionMaker,
                }
              : null
          }
        />
      </Card>
    </>
  );
}
