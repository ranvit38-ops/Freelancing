import Link from 'next/link';
import { ConfirmSubmit } from '@/components/file-upload';
import { FileDrop } from '@/components/file-drop';
import { FileShare } from '@/components/file-share';
import { Badge, Card, CardHeader, EmptyState, PageHeader, cx } from '@/components/ui';
import { experimentCode, formatBytes, formatDate, pluralise } from '@/lib/display';
import { deleteFileAction } from '@/server/actions/records';
import { requireSession } from '@/server/authz';
import { fileStorage } from '@/lib/pilot';
import { databaseStorageUse } from '@/server/storage';
import { fileShareNames, listFiles, listWorkspaceMembers } from '@/server/queries';

export const metadata = { title: 'Files' };
export const dynamic = 'force-dynamic';

/** Spreadsheets Labvia can read an experiment out of. */
const READABLE = /\.(csv|tsv|xlsx)$/i;

/**
 * The lab's files, and your own.
 *
 * Two views of one list rather than two stores: a file uploaded by you and
 * shared with the lab shows in both, and a private one only under yours. The
 * privacy itself is enforced in the query, not here — this page just asks.
 */
export default async function FilesPage({
  searchParams,
}: {
  searchParams: { q?: string; view?: string };
}) {
  const session = await requireSession();
  const view = searchParams.view === 'mine' ? 'mine' : searchParams.view === 'shared' ? 'shared' : 'lab';
  const mine = view === 'mine';
  const [all, members, storage] = await Promise.all([
    listFiles(session),
    listWorkspaceMembers(session),
    fileStorage() === 'database' ? databaseStorageUse() : null,
  ]);
  const shares = await fileShareNames(session, [...new Set(all.filter((f) => f.private).map((f) => f.id))]);
  const others = members.filter((m) => m.id !== session.userId);
  const sharedIds = new Map([...shares].map(([fileId, people]) => [fileId, people.map((p) => p.id)]));

  const scoped =
    view === 'mine'
      ? all.filter((f) => f.uploadedById === session.userId)
      : view === 'shared'
        ? all.filter((f) => f.private && f.uploadedById !== session.userId)
        : all.filter((f) => !f.private);
  const sharedWithMeCount = new Set(all.filter((f) => f.private && f.uploadedById !== session.userId).map((f) => f.id)).size;
  const query = (searchParams.q ?? '').trim().toLowerCase();
  const files = query
    ? scoped.filter((f) =>
        [f.filename, f.experimentTitle, f.projectName, f.uploaderName]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(query)),
      )
    : scoped;

  const tab = (active: boolean) =>
    cx(
      'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
      active ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
    );

  return (
    <>
      <PageHeader
        title="Files"
        description="Everything the lab has uploaded, and your own files. Drop a spreadsheet in and Labvia can turn it into an experiment."
      />
      {storage ? (
        <p
          className={cx(
            '-mt-3 mb-5 text-xs',
            storage.usedBytes > storage.limitBytes * 0.8 ? 'text-warn' : 'text-subtle',
          )}
        >
          Storage: {formatBytes(storage.usedBytes)} of {formatBytes(storage.limitBytes)} used on this server.
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="space-y-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-xl bg-raised p-1" role="tablist" aria-label="Whose files">
              <Link href="/files" role="tab" aria-selected={view === 'lab'} className={tab(view === 'lab')}>
                Lab files
              </Link>
              <Link href="/files?view=shared" role="tab" aria-selected={view === 'shared'} className={tab(view === 'shared')}>
                Shared with me{sharedWithMeCount ? ` · ${sharedWithMeCount}` : ''}
              </Link>
              <Link href="/files?view=mine" role="tab" aria-selected={mine} className={tab(mine)}>
                My files
              </Link>
            </div>
            <form className="flex gap-2">
              {view !== 'lab' ? <input type="hidden" name="view" value={view} /> : null}
              <label htmlFor="q" className="sr-only">
                Filter files
              </label>
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={searchParams.q ?? ''}
                placeholder="Find a file"
                className="h-9 w-48 rounded-lg border border-line bg-surface px-3 text-sm"
              />
            </form>
          </div>

          <Card>
            <CardHeader
              title={mine ? 'Uploaded by you' : view === 'shared' ? 'Shared with you' : 'Shared with the lab'}
              description={pluralise(files.length, 'file')}
            />
            {files.length === 0 ? (
              <EmptyState
                title={
                  query
                    ? `Nothing matches “${searchParams.q}”`
                    : mine
                      ? 'You have not uploaded anything yet'
                      : view === 'shared'
                        ? 'Nobody has shared a file with just you yet'
                        : 'No files yet'
                }
                description={query ? undefined : 'Drop files on the right to upload them.'}
              />
            ) : (
              <ul className="divide-y divide-line">
                {files.map((f) => (
                  <li key={`${f.id}:${f.experimentId ?? 'none'}`} className="px-5 py-3.5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <a
                        href={f.sourceUrl ?? `/api/files/${f.id}`}
                        className="min-w-0 flex-1 truncate text-sm font-medium underline-offset-2 hover:underline"
                      >
                        {f.filename}
                      </a>
                      {f.private && f.uploadedById === session.userId ? (
                        <Badge>{shares.get(f.id)?.length ? `Shared with ${shares.get(f.id)!.map((p) => p.name).join(', ')}` : 'Only you'}</Badge>
                      ) : null}
                      {f.private && f.uploadedById !== session.userId ? <Badge>Shared with you</Badge> : null}
                      {f.uploadedById === session.userId && !f.sourceUrl ? (
                        <FileShare
                          fileId={f.id}
                          members={others}
                          current={!f.private ? 'everyone' : sharedIds.get(f.id)?.length ? 'people' : 'me'}
                          sharedWith={sharedIds.get(f.id) ?? []}
                        />
                      ) : null}
                      {READABLE.test(f.filename) && !f.experimentId ? (
                        <Link
                          href={`/experiments/new?file=${f.id}`}
                          className="shrink-0 rounded-lg border border-accent/30 bg-accent/5 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/10"
                        >
                          Make an experiment from this
                        </Link>
                      ) : null}
                      {f.uploadedById === session.userId || session.role !== 'member' ? (
                        <form action={deleteFileAction} className="shrink-0">
                          <input type="hidden" name="fileId" value={f.id} />
                          {f.experimentId ? (
                            <input type="hidden" name="experimentId" value={f.experimentId} />
                          ) : null}
                          <ConfirmSubmit
                            tone="ghost"
                            size="sm"
                            message={`Delete ${f.filename}? This cannot be undone.`}
                          >
                            Delete
                          </ConfirmSubmit>
                        </form>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {formatBytes(f.byteSize)} · {formatDate(f.createdAt)}
                      {f.uploaderName ? ` · ${f.uploaderName}` : ''}
                      {f.experimentId ? (
                        <>
                          {' · '}
                          <Link
                            href={`/experiments/${f.experimentId}`}
                            className="underline underline-offset-2 hover:text-fg"
                          >
                            {experimentCode(f.experimentNumber!)} {f.experimentTitle}
                          </Link>
                        </>
                      ) : null}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card>
          <CardHeader title="Upload" description="Choose who it is for. They are told when it arrives." />
          <div className="px-5 py-4">
            <FileDrop members={others} />
          </div>
        </Card>
      </div>
    </>
  );
}
