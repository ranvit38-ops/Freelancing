import Link from 'next/link';
import { ConfirmSubmit } from '@/components/file-upload';
import { FileDrop } from '@/components/file-drop';
import { FileShare } from '@/components/file-share';
import { NewDocumentButton } from '@/components/new-document';
import { driveAppId } from '@/lib/drive';
import { Badge, Card, CardHeader, EmptyState, PageHeader, cx } from '@/components/ui';
import { experimentCode, formatBytes, formatDate, pluralise } from '@/lib/display';
import { deleteFileAction } from '@/server/actions/records';
import { requireSession } from '@/server/authz';
import { fileStorage } from '@/lib/pilot';
import { databaseStorageUse } from '@/server/storage';
import {
  fileHomes,
  fileShareNames,
  listExperiments,
  listFiles,
  listProjects,
  listProtocols,
  listWorkspaceMembers,
} from '@/server/queries';
import { FileUnder, type FilingTargets } from '@/components/file-under';

export const metadata = { title: 'Files' };
export const dynamic = 'force-dynamic';

/** Spreadsheets Labquill can read an experiment out of. */
const READABLE = /\.(csv|tsv|xlsx)$/i;
/** What lab protocols are usually kept as. */
const PROTOCOL_LIKE = /\.(pdf|docx?|odt|rtf)$/i;

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
  const [all, members, storage, homes, projects, protocols, experiments] = await Promise.all([
    listFiles(session),
    listWorkspaceMembers(session),
    fileStorage() === 'database' ? databaseStorageUse() : null,
    fileHomes(session),
    listProjects(session),
    listProtocols(session),
    listExperiments(session),
  ]);
  // Where a file can be filed: real projects, protocols, and the newest runs.
  const exampleProjects = new Set(projects.filter((p) => p.isExample).map((p) => p.id));
  const targets: FilingTargets = {
    projects: projects.filter((p) => !p.isExample).map((p) => ({ id: p.id, name: p.name })),
    protocols: protocols.map((p) => ({ id: p.id, name: p.name })),
    experiments: experiments
      .filter((e) => !exampleProjects.has(e.projectId))
      .slice(0, 60)
      .map((e) => ({ id: e.id, label: `${experimentCode(e.number)} ${e.title} (${e.projectName})` })),
  };
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
        description="Everything the lab has uploaded or written, and your own files. A protocol PDF or Word file becomes a protocol with “Use as a protocol”. Data from a run belongs on that experiment’s page."
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
            <NewDocumentButton />
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
                      {f.isDocument ? (
                        <Link
                          href={`/docs/${f.id}`}
                          className="min-w-0 flex-1 truncate text-sm font-medium underline-offset-2 hover:underline"
                        >
                          {f.filename.replace(/\.md$/i, '')}
                        </Link>
                      ) : (
                        <a
                          href={f.sourceUrl ?? `/api/files/${f.id}`}
                          className="min-w-0 flex-1 truncate text-sm font-medium underline-offset-2 hover:underline"
                        >
                          {f.filename}
                        </a>
                      )}
                      {f.isDocument ? <Badge tone="accent">Document</Badge> : null}
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
                      {READABLE.test(f.filename) && !f.experimentId && !f.isDocument ? (
                        <Link
                          href={`/experiments/new?file=${f.id}`}
                          className="shrink-0 rounded-lg border border-accent/30 bg-accent/5 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/10"
                        >
                          Make an experiment from this
                        </Link>
                      ) : null}
                      {!f.private && !f.experimentId && (f.isDocument || PROTOCOL_LIKE.test(f.filename)) ? (
                        <Link
                          href={`/protocols/new?file=${f.id}`}
                          className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-muted hover:border-accent/40 hover:text-fg"
                        >
                          Use as a protocol
                        </Link>
                      ) : null}
                      {!f.private ? <FileUnder fileId={f.id} targets={targets} /> : null}
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
                      {f.isDocument
                        ? `Edited ${formatDate(f.updatedAt ?? f.createdAt)}`
                        : `${formatBytes(f.byteSize)} · ${formatDate(f.createdAt)}`}
                      {f.uploaderName ? ` · ${f.isDocument ? 'started by ' : ''}${f.uploaderName}` : ''}
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
                      {(homes.get(f.id) ?? []).map((home) => (
                        <span key={home.href}>
                          {' · '}
                          <Link href={home.href} className="underline underline-offset-2 hover:text-fg">
                            {home.label}
                          </Link>
                        </span>
                      ))}
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
            <FileDrop
              members={others}
              drive={{
                clientId: process.env.GOOGLE_API_KEY ? (process.env.GOOGLE_CLIENT_ID ?? null) : null,
                apiKey: process.env.GOOGLE_API_KEY ?? null,
                appId: driveAppId(process.env.GOOGLE_CLIENT_ID),
              }}
            />
          </div>
        </Card>
      </div>
    </>
  );
}
