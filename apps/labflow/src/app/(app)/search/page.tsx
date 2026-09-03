import Link from 'next/link';
import { Badge, Card, EmptyState, Input, PageHeader } from '@/components/ui';
import { requireSession } from '@/server/authz';
import { search } from '@/server/queries';

export const metadata = { title: 'Search' };
export const dynamic = 'force-dynamic';

const typeLabel = {
  experiment: 'Experiment',
  project: 'Project',
  sample: 'Sample',
  protocol: 'Protocol',
  note: 'Note',
  file: 'File',
} as const;

export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const session = await requireSession();
  const query = (searchParams.q ?? '').trim();
  const results = query.length >= 2 ? await search(session, query) : [];

  return (
    <>
      <PageHeader
        title="Search"
        description="Across experiments, projects, samples, protocols, notes and file names."
      />
      {/* A GET form so results are linkable and the back button behaves. */}
      <form className="mb-5 flex gap-2">
        <label htmlFor="q" className="sr-only">
          Search
        </label>
        <Input
          id="q"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="PFAS 10 ppm"
          autoFocus
          className="max-w-md"
        />
        <button
          type="submit"
          className="h-9 shrink-0 rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent/90"
        >
          Search
        </button>
      </form>

      <Card>
        {query.length < 2 ? (
          <EmptyState
            title="Type at least two characters"
            description="Every word you type must appear in a result — “PFAS 10” narrows further than “PFAS”."
          />
        ) : results.length === 0 ? (
          <EmptyState
            title={`Nothing matches “${query}”`}
            description="Try fewer words, or a sample ID."
          />
        ) : (
          <ul className="divide-y divide-line">
            {results.map((r) => (
              <li key={`${r.type}:${r.id}`}>
                <Link href={r.href} className="flex items-start gap-4 px-5 py-3.5 hover:bg-raised">
                  <span className="w-24 shrink-0 pt-0.5">
                    <Badge>{typeLabel[r.type]}</Badge>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.title}</span>
                    {r.context ? (
                      <span className="mt-0.5 block truncate text-xs text-muted">{r.context}</span>
                    ) : null}
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
