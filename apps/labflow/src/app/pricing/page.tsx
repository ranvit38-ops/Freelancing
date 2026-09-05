import Link from 'next/link';
import { Badge, ButtonLink, Card, cx } from '@/components/ui';
import { EXTRA_SEAT_PRICE, PLANS, PLAN_ORDER, formatLimitBytes, type PlanId } from '@/lib/plans';

export const metadata = {
  title: 'Pricing',
  description: 'LabFlow is priced per lab, not per person. Free to try, no card required.',
};

const ROWS: { label: string; value: (id: PlanId) => string }[] = [
  { label: 'People', value: (id) => String(PLANS[id].seats) },
  {
    label: 'Projects',
    value: (id) => (PLANS[id].limits.projects === null ? 'Unlimited' : String(PLANS[id].limits.projects)),
  },
  {
    label: 'Experiments',
    value: (id) =>
      PLANS[id].limits.experiments === null ? 'Unlimited' : String(PLANS[id].limits.experiments),
  },
  { label: 'Uploads', value: (id) => formatLimitBytes(PLANS[id].limits.storageBytes) },
  {
    label: 'LabBot questions',
    value: (id) =>
      Number.isFinite(PLANS[id].limits.aiPerMonth)
        ? `${PLANS[id].limits.aiPerMonth}/month`
        : 'Unlimited',
  },
  { label: 'Compare experiments', value: (id) => (PLANS[id].limits.compare ? '✓' : '—') },
  { label: 'Research memory', value: (id) => (PLANS[id].limits.researchMemory ? '✓' : '—') },
  { label: 'PowerPoint updates', value: (id) => (PLANS[id].limits.pptxExport ? '✓' : '—') },
  { label: 'PubMed grounding', value: (id) => (PLANS[id].limits.pubmed ? '✓' : '—') },
  { label: 'Discussion', value: (id) => (PLANS[id].limits.discussion ? '✓' : '—') },
  { label: 'Priority support', value: (id) => (PLANS[id].limits.prioritySupport ? '✓' : '—') },
  { label: 'Invoice or PO billing', value: (id) => (PLANS[id].limits.invoiceBilling ? '✓' : '—') },
];

export default function PricingPage() {
  return (
    <div className="bg-bg">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden className="h-5 w-5 rounded-md bg-accent" />
            LabFlow
          </Link>
          <ButtonLink href="/signup" size="sm">
            Start free
          </ButtonLink>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Priced per lab, not per person.
          </h1>
          <p className="mt-4 text-lg leading-7 text-muted">
            A five-person lab pays $49 a month — about a third of what per-seat academic notebooks
            charge for the same five people. Start free, no card required.
          </p>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-4">
          {PLAN_ORDER.map((id) => {
            const plan = PLANS[id];
            const highlight = id === 'lab';
            return (
              <Card
                key={id}
                className={cx('flex flex-col p-5', highlight && 'border-accent ring-1 ring-accent/25')}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="font-medium tracking-tight">{plan.name}</h2>
                  {highlight ? <Badge tone="accent">Most labs</Badge> : null}
                </div>
                <p className="mt-1 text-sm text-muted">{plan.blurb}</p>
                <p className="mt-4">
                  <span className="text-3xl font-semibold tabular-nums tracking-tight">
                    ${plan.monthly}
                  </span>
                  <span className="text-sm text-muted">{plan.monthly === 0 ? '' : ' /month'}</span>
                </p>
                <p className="mt-1 text-xs text-subtle">
                  {plan.monthly === 0
                    ? 'Free forever, for one person.'
                    : `or $${plan.yearly}/year — two months free`}
                </p>
                <ul className="mt-4 flex-1 space-y-1.5 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <ButtonLink
                  href="/signup"
                  tone={highlight ? 'primary' : 'secondary'}
                  className="mt-5 w-full"
                >
                  {plan.monthly === 0 ? 'Start free' : `Start with ${plan.name}`}
                </ButtonLink>
              </Card>
            );
          })}
        </div>

        <p className="mt-4 text-sm text-muted">
          Need more people on any paid plan? Extra seats are ${EXTRA_SEAT_PRICE} per person per
          month. Every paid plan starts with a 14-day trial.
        </p>

        <h2 className="mt-16 text-2xl font-semibold tracking-tight">Compare plans</h2>
        <Card className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Feature comparison across LabFlow plans</caption>
            <thead>
              <tr className="border-b border-line text-left">
                <th scope="col" className="w-56 px-5 py-3 text-xs font-medium uppercase tracking-wider text-subtle">
                  Feature
                </th>
                {PLAN_ORDER.map((id) => (
                  <th key={id} scope="col" className="px-5 py-3 font-medium">
                    {PLANS[id].name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ROWS.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="px-5 py-3 text-left font-medium">
                    {row.label}
                  </th>
                  {PLAN_ORDER.map((id) => (
                    <td key={id} className="px-5 py-3 tabular-nums">
                      {row.value(id)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <section className="mt-16 max-w-3xl">
          <h2 className="text-2xl font-semibold tracking-tight">Questions labs actually ask</h2>
          <dl className="mt-6 space-y-6">
            {[
              {
                q: 'What happens if we stop paying?',
                a: 'The workspace becomes read-only. Every record, file and dataset stays exactly where it is and stays readable — nothing is ever deleted for non-payment. Start a plan again and you can write again.',
              },
              {
                q: 'Can we pay by invoice or purchase order?',
                a: 'Yes, on Group and Department. Billing address and tax ID are collected at checkout so the invoice satisfies a university finance office.',
              },
              {
                q: 'Is our research data used to train models?',
                a: 'No. Records are never used to train models, and only the specific records retrieved for a question are ever sent to one.',
              },
              {
                q: 'What counts as a person?',
                a: 'Anyone who can open the workspace. An invitation you have sent but nobody has accepted holds a seat until it is accepted or revoked.',
              },
            ].map((item) => (
              <div key={item.q}>
                <dt className="font-medium">{item.q}</dt>
                <dd className="mt-1.5 text-sm leading-6 text-muted">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-muted">
          Records stay yours. Nothing here is used to train models.
        </div>
      </footer>
    </div>
  );
}
