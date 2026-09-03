import Link from 'next/link';
import { Badge, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui';
import { experimentCode, formatBytes, formatDate, pluralise } from '@/lib/display';
import { requireSession } from '@/server/authz';
import { listFiles } from '@/server/queries';

export const metadata = { title: 'Files' };
export const dynamic = 'force-dynamic';

export default async function FilesPage({ searchParams }: { searchParams: { q?: string } }) {
  const session = await requireSession();
  const all = await listFiles(session);
  const query = (searchParams.q ?? '').trim().toLowerCase();
  const files = query
    ? all.filter((f) =>
        [f.filename, f.experimentTitle, f.projectName]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(query)),
      )
    : all;

  return (
    <>
      <PageHeader
        title="Files"
        description="Every file in this workspace, shown with the experiment that produced it — the thing a shared drive can never tell you."
      />

      {/* A GET form so a filtered view is linkable. */}
      <form className="mb-5 flex gap-2">
        <label htmlFor="q" className="sr-only">
          Filter files
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={searchParams.q ?? ''}
          placeholder="Filter by file, experiment or project"
          className="h-9 w-full max-w-md rounded-lg border border-line bg-surface px-3 text-sm"
        />
        <button
          type="submit"
          className="h-9 shrink-0 rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-raised"
        >
          Filter
        </button>
      </form>

      <Card>
        <CardHeader title="All files" description={pluralise(files.length, 'file')} />
        {files.length === 0 ? (
          <EmptyState
            title={query ? `No files match “${searchParams.q}”` : 'No files uploaded yet'}
            description={
              query
                ? undefined
                : 'Attach a file to an experiment and it appears here, linked to that record.'
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {files.map((f) => (
              <li key={`${f.id}:${f.experimentId ?? 'none'}`} className="px-5 py-3.5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <a
                    href={`/api/files/${f.id}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium underline underline-offset-2"
                  >
                    {f.filename}
                  </a>
                  {f.datasetId ? (
                    <Link href={`/datasets/${f.datasetId}`}>
                      <Badge tone="accent">Parsed dataset</Badge>
                    </Link>
                  ) : null}
                  <span className="shrink-0 text-xs text-subtle">{formatBytes(f.byteSize)}</span>
                  <span className="shrink-0 text-xs text-subtle">{formatDate(f.createdAt)}</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {f.experimentId ? (
                    <>
                      <Link
                        href={`/experiments/${f.experimentId}`}
                        className="underline underline-offset-2 hover:text-fg"
                      >
                        {experimentCode(f.experimentNumber!)} · {f.experimentTitle}
                      </Link>
                      {f.projectId ? (
                        <>
                          {' — '}
                          <Link
                            href={`/projects/${f.projectId}`}
                            className="underline underline-offset-2 hover:text-fg"
                          >
                            {f.projectName}
                          </Link>
                        </>
                      ) : null}
                    </>
                  ) : (
                    'Not attached to an experiment'
                  )}
                  {f.uploaderName ? ` · uploaded by ${f.uploaderName}` : null}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
