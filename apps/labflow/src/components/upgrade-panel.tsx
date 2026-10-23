import Link from 'next/link';
import { ButtonLink, Card } from './ui';
import { PLANS, type PlanId } from '@/lib/plans';

/**
 * What a feature the current plan does not include looks like.
 *
 * It shows the feature rather than hiding it. A prospect who is bounced to the
 * billing page learns only that they cannot have something; one who sees what
 * it does, and the cheapest plan that includes it, has a reason to pay.
 */
export function UpgradePanel({
  title,
  what,
  why,
  plan = 'lab',
}: {
  title: string;
  /** One sentence on what the feature does. */
  what: string;
  /** One sentence on why it is worth having. */
  why: string;
  plan?: PlanId;
}) {
  const target = PLANS[plan];
  return (
    <Card className="p-6 sm:p-8">
      <p className="text-xs font-medium uppercase tracking-wider text-subtle">
        Included from {target.name}, ${target.monthly} a month
      </p>
      <h2 className="mt-2 text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted">{what}</p>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted">{why}</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <ButtonLink href="/billing">See plans</ButtonLink>
        <Link href="/pricing" className="text-sm text-muted underline underline-offset-2 hover:text-fg">
          Compare every plan
        </Link>
      </div>
      <p className="mt-4 text-xs text-subtle">
        Nothing you have already recorded is affected, and nothing is ever deleted.
      </p>
    </Card>
  );
}
