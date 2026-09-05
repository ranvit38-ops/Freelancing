import Link from 'next/link';
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui';
import { requireSession } from '@/server/authz';
import { listProtocols } from '@/server/queries';

export const metadata = { title: 'Protocols' };
export const dynamic = 'force-dynamic';

export default async function ProtocolsPage() {
  const session = await requireSession();
  const protocols = await listProtocols(session);

  return (
    <>
      <PageHeader
        title="Protocols"
        description="Versioned methods. Experiments reference the exact version they followed."
        actions={<ButtonLink href="/protocols/new">New protocol</ButtonLink>}
      />
      <Card>
        {protocols.length === 0 ? (
          <EmptyState
            title="No protocols yet"
            description="Adding one lets experiments record which version they used — the single most useful thing for comparing runs later."
            action={<ButtonLink href="/protocols/new" size="sm">Add a protocol</ButtonLink>}
          />
        ) : (
          <ul className="divide-y divide-line">
            {protocols.map((p) => (
              <li key={p.id}>
                <Link href={`/protocols/${p.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-raised">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {p.description ?? p.projectName ?? 'Shared across the workspace'}
                    </span>
                  </span>
                  <Badge tone="accent">v{p.latestVersion ?? 1}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
