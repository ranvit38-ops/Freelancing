import Link from 'next/link';
import { Card, CardHeader, EmptyState, PageHeader } from '@/components/ui';
import { gapsByResearcher } from '@/lib/completeness';
import { experimentCode, experimentStatusLabel, formatDate, pluralise } from '@/lib/display';
import { requireSession } from '@/server/authz';
import { listRecordChecks } from '@/server/queries';

export const metadata = { title: 'Record check' };
export const dynamic = 'force-dynamic';

/**
 * Every started run whose record is missing something, grouped by who ran it.
 * The same mechanical checklist as each experiment page, so a PI can see thin
 * records while the person who ran them still remembers the details.
 */
export default async function RecordCheckPage() {
  const session = await requireSession();
  const rows = await listRecordChecks(session);
  const groups = gapsByResearcher(rows);
  const thin = groups.reduce((n, g) => n + g.gaps.length, 0);

  return (
    <>
      <PageHeader
        back={{ href: '/experiments', label: 'Experiments' }}
        title="Record check"
        description={
          rows.length === 0
            ? 'Nothing to check yet. Runs appear here once they are past "planned".'
            : `${pluralise(thin, 'record')} of ${rows.length} started ${rows.length === 1 ? 'run is' : 'runs are'} missing something.`
        }
      />

      {groups.length === 0 ? (
        <Card>
          <EmptyState
            title={rows.length === 0 ? 'No started runs' : 'Every started run passes the checklist'}
            description="This checks whether information is written down. It does not verify that the work is correct or reproducible."
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <Card key={group.researcher}>
              <CardHeader
                title={group.researcher}
                description={`${pluralise(group.gaps.length, 'record')} to fill in`}
              />
              <ul className="divide-y divide-line">
                {group.gaps.map(({ record, outstanding, score }) => (
                  <li key={record.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <Link
                        href={`/experiments/${record.id}`}
                        className="min-w-0 text-sm font-medium hover:underline"
                      >
                        <span className="font-mono text-subtle">{experimentCode(record.number)}</span>{' '}
                        {record.title}
                      </Link>
                      <span className="text-xs text-subtle">
                        {record.projectName} · {experimentStatusLabel[record.status]} · updated{' '}
                        {formatDate(record.updatedAt)}
                      </span>
                      <span className="ml-auto text-xs text-muted">{score}% documented</span>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      To fill in: {outstanding.map((c) => c.label.toLowerCase()).join(', ')}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
          <p className="text-xs text-subtle">
            This checks whether information is written down. It does not verify that the work is
            correct or that the experiment is reproducible.
          </p>
        </div>
      )}
    </>
  );
}
