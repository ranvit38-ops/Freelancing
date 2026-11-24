import { FileLink, FileThumb } from '@/components/file-link';
import { notFound } from 'next/navigation';
import { ProtocolVersionForm } from '@/components/simple-forms';
import { Badge, Card, CardHeader, PageHeader, Prose } from '@/components/ui';
import Link from 'next/link';
import { experimentCode, formatBytes, formatDate, pluralise } from '@/lib/display';
import { NotFoundInWorkspaceError, requireSession } from '@/server/authz';
import {
  getProtocolWithVersions,
  listProtocolFileOptions,
  listProtocolFiles,
  protocolVersionUsage,
} from '@/server/queries';
import { FileDrop } from '@/components/file-drop';
import { diffCounts, foldDiff, lineDiff } from '@/lib/line-diff';
import { cx } from '@/components/ui';
import { removeProtocolFileAction } from '@/server/actions/records';

export const dynamic = 'force-dynamic';

export default async function ProtocolPage(props: { params: Promise<{ protocolId: string }> }) {
  const params = await props.params;
  const session = await requireSession();
  try {
    const { protocol, versions } = await getProtocolWithVersions(session, params.protocolId);
    const [usage, fileOptions, folder] = await Promise.all([
      protocolVersionUsage(session, protocol.id),
      listProtocolFileOptions(session),
      listProtocolFiles(session, protocol.id),
    ]);

    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader
          eyebrow="Protocol"
          title={protocol.name}
          description={protocol.description ?? undefined}
        />
        <div className="space-y-5">
          <Card>
            <details className="group" data-update-protocol>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
                <span>
                  <span className="block text-sm font-semibold">Update this protocol</span>
                  <span className="block text-xs text-muted">Upload the revised file, or edit the method. The old version is kept.</span>
                </span>
                <span aria-hidden className="text-muted transition-transform group-open:rotate-180">⌄</span>
              </summary>
            <ProtocolVersionForm
              protocolId={protocol.id}
              files={
                // The current file is always offered, even when it is older
                // than the newest fifty, or the form would silently drop it.
                versions[0]?.fileId && !fileOptions.some((f) => f.id === versions[0]!.fileId)
                  ? [{ id: versions[0].fileId, filename: versions[0].filename ?? 'Current file' }, ...fileOptions]
                  : fileOptions
              }
              current={{ body: versions[0]?.body ?? null, fileId: versions[0]?.fileId ?? null }}
            />
            </details>
          </Card>

          <Card>
            <CardHeader
              title="Everything that goes with it"
              description="Photos of the steps, instrument settings, the manual, blank tables for recording by hand. Anyone running it finds them here."
            />
            {folder.length > 0 ? (
              <ul className="divide-y divide-line border-b border-line">
                {folder.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <FileThumb id={f.id} filename={f.filename} isDocument={f.isDocument} sourceUrl={f.sourceUrl} />
                    <FileLink id={f.id} filename={f.filename} isDocument={f.isDocument} sourceUrl={f.sourceUrl} className="min-w-0 flex-1 truncate" />
                    <span className="shrink-0 text-xs text-subtle">{f.sourceUrl ? 'Link' : formatBytes(f.byteSize)}</span>
                    {f.uploadedById === session.userId || session.role !== 'member' ? (
                      <form action={removeProtocolFileAction} className="shrink-0">
                        <input type="hidden" name="protocolId" value={protocol.id} />
                        <input type="hidden" name="fileId" value={f.id} />
                        <button type="submit" className="text-xs text-muted hover:text-fg">
                          Take out
                        </button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="px-5 py-4">
              <FileDrop members={[]} into={{ protocolId: protocol.id, label: protocol.name }} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Version history" description={`${versions.length} versions`} />
            <ol className="divide-y divide-line">
              {versions.map((v, k) => (
                <li key={v.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge tone="accent">v{v.version}</Badge>
                    <span className="text-xs text-subtle">
                      {v.authorName ?? 'Unknown'} · {formatDate(v.createdAt)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium">
                    {v.changeNote ?? 'No change note recorded'}
                  </p>
                  {v.fileId ? (
                    <FileLink
                      id={v.fileId}
                      filename={v.filename ?? 'file'}
                      isDocument={v.fileIsDocument ?? false}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-line bg-raised px-2.5 py-1 text-sm no-underline hover:border-accent/40"
                    >
                      Open {v.filename}
                    </FileLink>
                  ) : null}
                  {(() => {
                    const used = usage.filter((u) => u.versionId === v.id && u.experimentId);
                    return (
                      <div className="mt-2">
                        <p className="text-xs text-subtle">
                          {used.length === 0
                            ? 'No experiment recorded using this version.'
                            : `Used by ${pluralise(used.length, 'experiment')}:`}
                        </p>
                        {used.length > 0 ? (
                          <ul className="mt-1 flex flex-wrap gap-1.5">
                            {used.map((u) => (
                              <li key={u.experimentId}>
                                <Link
                                  href={`/experiments/${u.experimentId}`}
                                  className="inline-flex rounded-md border border-line bg-raised px-2 py-0.5 text-xs hover:border-accent/40 hover:text-fg"
                                >
                                  {experimentCode(u.experimentNumber!)} · {u.experimentTitle}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    );
                  })()}
                  <VersionChanges
                    before={versions[k + 1] ?? null}
                    after={v}
                  />
                  {v.body ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm text-muted hover:text-fg">
                        Show method
                      </summary>
                      <div className="mt-2 rounded-lg border border-line bg-raised p-3">
                        <Prose text={v.body} />
                      </div>
                    </details>
                  ) : null}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    );
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) notFound();
    throw error;
  }
}

type VersionRow = { body: string | null; fileId: string | null; filename: string | null };

/** "See what changed": the lines added and removed since the version before, and a new file. */
function VersionChanges({ before, after }: { before: VersionRow | null; after: VersionRow }) {
  if (!before) return null;
  const diff = lineDiff(before.body ?? '', after.body ?? '');
  const { added, removed } = diffCounts(diff);
  const fileChanged = before.fileId !== after.fileId;
  if (!added && !removed && !fileChanged) {
    return <p className="mt-2 text-xs text-subtle">Same method and file as the version before.</p>;
  }
  return (
    <details className="mt-2" data-version-diff>
      <summary className="cursor-pointer text-sm font-medium text-accent hover:underline">
        See what changed
        <span className="ml-2 font-normal text-muted">
          {[added ? `+${added}` : '', removed ? `−${removed}` : '', fileChanged ? 'new file' : ''].filter(Boolean).join(' · ')}
        </span>
      </summary>
      <div className="mt-2 overflow-x-auto rounded-lg border border-line bg-raised p-2 font-mono text-xs leading-5">
        {fileChanged ? (
          <p className="px-2 pb-1 font-sans text-muted">
            File: {before.filename ?? 'none'} → {after.filename ?? 'none'}
          </p>
        ) : null}
        {foldDiff(diff).map((c, i) =>
          c.type === 'skip' ? (
            <p key={i} className="px-2 text-subtle">
              … {c.count} unchanged {c.count === 1 ? 'line' : 'lines'}
            </p>
          ) : (
            <p
              key={i}
              className={cx(
                'whitespace-pre-wrap px-2',
                c.type === 'add' && 'bg-ok/10 text-ok',
                c.type === 'del' && 'bg-danger/10 text-danger line-through decoration-danger/40',
              )}
            >
              <span aria-hidden className="mr-2 select-none">{c.type === 'add' ? '+' : c.type === 'del' ? '−' : ' '}</span>
              <span className="sr-only">{c.type === 'add' ? 'Added: ' : c.type === 'del' ? 'Removed: ' : ''}</span>
              {c.text || ' '}
            </p>
          ),
        )}
      </div>
    </details>
  );
}
