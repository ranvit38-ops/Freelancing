'use client';

import { useFormState } from 'react-dom';
import { Badge, Card, FormError, cx } from './ui';
import { SubmitButton } from './submit-button';
import { openBillingPortalAction, startCheckoutAction } from '@/server/actions/billing';
import { noState } from '@/server/actions/types';
import { EXTRA_SEAT_PRICE, PLANS, PLAN_ORDER, type PlanId } from '@/lib/plans';

/** The plan cards. Choosing one opens Stripe Checkout. */
export function PlanPicker({
  currentPlan,
  canManage,
}: {
  currentPlan: PlanId | null;
  canManage: boolean;
}) {
  const [state, action] = useFormState(startCheckoutAction, noState);

  return (
    <div className="space-y-4">
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
                or ${plan.yearly}/year — two months free. Extra people ${EXTRA_SEAT_PRICE}/month each.
              </p>
              <ul className="mt-4 flex-1 space-y-1.5 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <form action={action} className="mt-5">
                <input type="hidden" name="plan" value={id} />
                <SubmitButton
                  tone={current ? 'secondary' : 'primary'}
                  className="w-full"
                  disabled={!canManage}
                  pendingLabel="Opening Stripe…"
                >
                  {current ? 'Change plan' : `Choose ${plan.name}`}
                </SubmitButton>
              </form>
            </Card>
          );
        })}
      </div>
      {canManage ? null : (
        <p className="text-sm text-muted">
          Only an owner or admin can choose a plan for this workspace.
        </p>
      )}
    </div>
  );
}

/** Card, invoices and cancellation all live in Stripe's own portal. */
export function BillingPortalButton() {
  const [state, action] = useFormState(openBillingPortalAction, noState);
  return (
    <form action={action} className="space-y-2">
      <FormError>{state.error}</FormError>
      <SubmitButton tone="secondary" size="sm" pendingLabel="Opening…">
        Manage billing, card and invoices
      </SubmitButton>
    </form>
  );
}
