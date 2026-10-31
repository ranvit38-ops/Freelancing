'use client';

import { useActionState } from 'react';
import { Badge, Card, FormError, cx } from './ui';
import { SubmitButton } from './submit-button';
import { cancelPlanAction, startCheckoutAction, syncBillingAction } from '@/server/actions/billing';
import { noState } from '@/server/actions/types';
import Link from 'next/link';
import { PLANS, PLAN_ORDER, RENEWAL_TERMS, type PlanId } from '@/lib/plans';

/** The plan cards. Choosing one opens PayPal to approve the subscription. */
export function PlanPicker({
  currentPlan,
  currentInterval,
  canManage,
}: {
  currentPlan: PlanId | null;
  /** Set only while a PayPal subscription is live, so its own button can say so. */
  currentInterval: 'month' | 'year' | null;
  canManage: boolean;
}) {
  const [state, action] = useActionState(startCheckoutAction, noState);

  return (
    <div className="space-y-4">
      {/* Auto-renewal laws want this beside the button that commits to it. */}
      <p className="rounded-lg border border-line bg-raised px-4 py-3 text-sm text-muted" data-renewal-terms>
        {RENEWAL_TERMS} By subscribing you agree to the{' '}
        <Link href="/terms" className="underline underline-offset-2">
          Terms
        </Link>
        .
      </p>
      <FormError>{state.error}</FormError>
      <div className="grid gap-4 lg:grid-cols-3">
        {PLAN_ORDER.map((id) => {
          const plan = PLANS[id];
          const current = currentPlan === id;
          return (
            <Card
              key={id}
              className={cx('flex flex-col p-5', current && 'border-accent ring-1 ring-accent/25')}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-medium tracking-tight">{plan.name}</h3>
                {current ? <Badge tone="accent">Current plan</Badge> : null}
              </div>
              <p className="mt-1 text-sm text-muted">{plan.blurb}</p>
              <p className="mt-4">
                <span className="text-3xl font-semibold tabular-nums tracking-tight">
                  ${plan.monthly}
                </span>
                <span className="text-sm text-muted"> /month</span>
              </p>
              <p className="mt-1 text-xs text-subtle">
                {id === 'free'
                  ? 'No card, no expiry.'
                  : `or $${plan.yearly}/year, which is two months free.`}{' '}
                Up to {plan.seats} {plan.seats === 1 ? 'person' : 'people'}.
              </p>
              <ul className="mt-4 flex-1 space-y-1.5 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              {/* Free is what a workspace falls back to, not something to buy.
                  Checkout refuses it, so offering a button here would only ever
                  produce an error. */}
              {id === 'free' ? (
                <p className="mt-5 text-xs text-subtle">
                  Where a workspace sits with no plan, and where it returns if a plan ends.
                  Nothing is deleted.
                </p>
              ) : (
                <form action={action} className="mt-5 space-y-2">
                  <input type="hidden" name="plan" value={id} />
                  {(['month', 'year'] as const).map((interval) => {
                    const mine = current && currentInterval === interval;
                    const price = interval === 'month' ? plan.monthly : plan.yearly;
                    return (
                      <SubmitButton
                        key={interval}
                        name="interval"
                        value={interval}
                        tone={interval === 'month' && !current ? 'primary' : 'secondary'}
                        className="w-full"
                        disabled={!canManage || mine}
                        pendingLabel="Opening PayPal…"
                      >
                        {mine
                          ? `Your current plan, $${price.toLocaleString('en-US')} a ${interval}`
                          : `${plan.name}, $${price.toLocaleString('en-US')} a ${interval}`}
                      </SubmitButton>
                    );
                  })}
                </form>
              )}
            </Card>
          );
        })}
      </div>
      {canManage ? null : (
        <p className="text-sm text-muted">
          Only an owner or admin can choose a plan for this lab.
        </p>
      )}
    </div>
  );
}

/** Cancel inside Labquill, in one step, without hunting through PayPal. */
export function CancelPlanForm({ activeUntil }: { activeUntil: string | null }) {
  const [state, action] = useActionState(cancelPlanAction, noState);
  if (state.ok) {
    return (
      <p role="status" className="text-sm text-ok">
        {state.message}
      </p>
    );
  }
  return (
    <form action={action} className="space-y-2">
      <FormError>{state.error}</FormError>
      <label className="flex items-start gap-2 text-sm text-muted">
        <input type="checkbox" name="confirm" value="cancel" required className="mt-1" />
        <span>
          Cancel this plan. Nothing more will be charged{activeUntil ? `; it stays active until ${activeUntil}` : ''}, and after
          that the lab becomes read-only. Nothing is deleted.
        </span>
      </label>
      <SubmitButton tone="secondary" size="sm" pendingLabel="Cancelling with PayPal…">
        Cancel plan
      </SubmitButton>
    </form>
  );
}

/**
 * Re-reads the plan from PayPal.
 *
 * Here for the case where someone has paid and the workspace still says
 * otherwise, which is what a lost webhook looks like from the inside.
 */
export function SyncBillingButton() {
  const [state, action] = useActionState(syncBillingAction, noState);
  return (
    <form action={action} className="space-y-2">
      <FormError>{state.error}</FormError>
      {state.ok ? (
        <p role="status" className="text-sm text-ok">
          {state.message}
        </p>
      ) : null}
      <SubmitButton tone="ghost" size="sm" pendingLabel="Asking PayPal…">
        Paid but still not showing? Refresh from PayPal
      </SubmitButton>
    </form>
  );
}
