import Link from 'next/link';
import { ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui';
import { formatDate, pluralise } from '@/lib/display';
import { requireSession } from '@/server/authz';
import { listSamples } from '@/server/queries';

export const metadata = { title: 'Samples' };
export const dynamic = 'force-dynamic';

export default async function SamplesPage() {
  const session = await requireSession();
  const samples = await listSamples(session);

  return (
    <>
      <PageHeader
        title="Samples"
        description="A light register of what was used where — not a full inventory system."
        actions={<ButtonLink href="/samples/new">New sample</ButtonLink>}
      />
      <Card>
        {samples.length === 0 ? (
          <EmptyState
            title="No samples yet"
            description="Samples are also created automatically when you type new IDs into an experiment."
            action={<ButtonLink href="/samples/new" size="sm">Add a sample</ButtonLink>}
          />
        ) : (
          <ul className="divide-y divide-line">
            {samples.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/samples/${s.id}`}
                  className="flex flex-col gap-1 px-5 py-3 hover:bg-raised sm:flex-row sm:items-center sm:gap-4"
                >
                  <span className="w-28 shrink-0 font-mono text-sm">{s.code}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted">
                    {s.description ?? 'No description'}
                  </span>
                  <span className="shrink-0 text-xs text-subtle sm:w-40 sm:text-right">
                    {s.projectName ?? 'No project'}
                  </span>
                  <span className="shrink-0 text-xs text-subtle sm:w-32 sm:text-right">
                    {pluralise(s.experimentCount, 'experiment')}
                  </span>
                  <span className="hidden shrink-0 text-xs text-subtle sm:block sm:w-28 sm:text-right">
                    {formatDate(s.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
