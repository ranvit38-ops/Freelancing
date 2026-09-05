import { NextActionsList } from '@/components/next-actions-list';
import { Card, CardHeader, PageHeader } from '@/components/ui';
import { buildNextActions, severityLabel, type ActionSeverity } from '@/lib/next-actions';
import { requireSession } from '@/server/authz';
import { nextActionSignals } from '@/server/queries';

export const metadata = { title: 'What needs attention' };
export const dynamic = 'force-dynamic';

const ORDER: ActionSeverity[] = ['blocking', 'attention', 'idea'];

export default async function ActionsPage() {
  const session = await requireSession();
  const signals = await nextActionSignals(session);
  const actions = buildNextActions(signals.experiments, signals.protocols);

  return (
    <>
      <PageHeader
        title="What needs attention"
        description="Derived from your records, not generated. Every item is something that is missing from the write-up — never a judgement about the science."
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {ORDER.map((severity) => (
          <Card key={severity} className="p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-subtle">
              {severityLabel[severity]}
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
              {actions.filter((a) => a.severity === severity).length}
            </div>
          </Card>
        ))}
      </div>

      <div className="space-y-5">
        {ORDER.map((severity) => {
          const group = actions.filter((a) => a.severity === severity);
          if (group.length === 0) return null;
          return (
            <Card key={severity}>
              <CardHeader title={severityLabel[severity]} description={`${group.length} items`} />
              <NextActionsList actions={group} />
            </Card>
          );
        })}
        {actions.length === 0 ? (
          <Card>
            <NextActionsList actions={[]} />
          </Card>
        ) : null}
      </div>
    </>
  );
}
