import { notFound } from 'next/navigation';
import { ProtocolVersionForm } from '@/components/simple-forms';
import { Badge, Card, CardHeader, PageHeader, Prose } from '@/components/ui';
import Link from 'next/link';
import { experimentCode, formatDate, pluralise } from '@/lib/display';
import { NotFoundInWorkspaceError, requireSession } from '@/server/authz';
import { getProtocolWithVersions, protocolVersionUsage } from '@/server/queries';

export const dynamic = 'force-dynamic';

export default async function ProtocolPage({ params }: { params: { protocolId: string } }) {
  const session = await requireSession();
  try {
    const { protocol, versions } = await getProtocolWithVersions(session, params.protocolId);
    const usage = await protocolVersionUsage(session, protocol.id);

    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader
          eyebrow="Protocol"
          title={protocol.name}
          description={protocol.description ?? undefined}
        />
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Add a version"
              description="Never edit an old version — experiments point at it."
            />
            <ProtocolVersionForm protocolId={protocol.id} />
          </Card>

          <Card>
            <CardHeader title="Version history" description={`${versions.length} versions`} />
            <ol className="divide-y divide-line">
              {versions.map((v) => (
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
