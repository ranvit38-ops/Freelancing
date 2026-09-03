import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StatusBadge } from '@/components/records';
import { Card, CardHeader, DefinitionList, EmptyState, PageHeader, Prose } from '@/components/ui';
import { experimentCode, formatDate } from '@/lib/display';
import { NotFoundInWorkspaceError, requireSession } from '@/server/authz';
import { experimentsForSample, getSample } from '@/server/queries';

export const dynamic = 'force-dynamic';

export default async function SamplePage({ params }: { params: { sampleId: string } }) {
  const session = await requireSession();
  try {
    const sample = await getSample(session, params.sampleId);
    const used = await experimentsForSample(session, sample.id);

    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader eyebrow="Sample" title={<span className="font-mono">{sample.code}</span>} />
        <div className="space-y-5">
          <Card className="p-5">
            <DefinitionList
              items={[
                { term: 'Created', value: formatDate(sample.createdAt) },
                {
                  term: 'Derived from',
                  value: sample.parentSampleId ? (
                    <Link href={`/samples/${sample.parentSampleId}`} className="underline underline-offset-2">
                      Parent sample
                    </Link>
                  ) : (
                    '—'
                  ),
                },
              ]}
            />
            <div className="mt-5 space-y-4 border-t border-line pt-5">
              <div>
                <h2 className="text-xs font-medium uppercase tracking-wider text-subtle">Description</h2>
                <div className="mt-1"><Prose text={sample.description} /></div>
              </div>
              <div>
                <h2 className="text-xs font-medium uppercase tracking-wider text-subtle">Notes</h2>
                <div className="mt-1"><Prose text={sample.notes} /></div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Used in experiments" description={`${used.length} recorded`} />
            {used.length === 0 ? (
              <EmptyState title="Not used in any experiment yet" />
            ) : (
              <ul className="divide-y divide-line">
                {used.map((e) => (
                  <li key={e.id}>
                    <Link href={`/experiments/${e.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-raised">
                      <span className="w-20 shrink-0 font-mono text-xs text-subtle">
                        {experimentCode(e.number)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{e.title}</span>
                      <StatusBadge status={e.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    );
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) notFound();
    throw error;
  }
}
