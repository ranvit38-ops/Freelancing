import { Badge, Card, CardHeader, DefinitionList, PageHeader } from '@/components/ui';
import { aiConfigured } from '@/lib/env';
import { formatDate } from '@/lib/display';
import { requireSession } from '@/server/authz';
import { listWorkspaceMembers } from '@/server/queries';

export const metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await requireSession();
  const members = await listWorkspaceMembers(session);

  return (
    <>
      <PageHeader title="Settings" description="Workspace, people and integrations." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold tracking-tight">Workspace</h2>
          <DefinitionList
            items={[
              { term: 'Name', value: session.workspaceName },
              { term: 'Your role', value: <Badge>{session.role}</Badge> },
              { term: 'Signed in as', value: session.userEmail },
            ]}
          />
        </Card>

        <Card>
          <CardHeader title="People" description={`${members.length} in this workspace`} />
          <ul className="divide-y divide-line">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{m.name}</span>
                  <span className="block truncate text-xs text-muted">{m.email}</span>
                </span>
                <Badge>{m.role}</Badge>
                <span className="hidden text-xs text-subtle sm:block">{formatDate(m.joinedAt)}</span>
              </li>
            ))}
          </ul>
          {/* SETUP REQUIRED: inviting teammates needs transactional email. */}
          <p className="border-t border-line px-5 py-3 text-xs text-muted">
            Inviting new members by email is not available yet — it needs an email provider
            configured on this deployment.
          </p>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-1 text-sm font-semibold tracking-tight">AI features</h2>
          <p className="text-sm text-muted">
            Experiment analysis and the project assistant call a language model with a focused
            slice of your records.
          </p>
          <div className="mt-4">
            {aiConfigured() ? (
              <Badge tone="ok">Configured</Badge>
            ) : (
              <div className="rounded-lg border border-warn/25 bg-warn/5 px-4 py-3 text-sm text-warn">
                Not configured. Set <code className="font-mono">ANTHROPIC_API_KEY</code> on the
                server to enable AI features. Until then LabFlow will say so rather than generate
                anything.
              </div>
            )}
          </div>
          <p className="mt-4 text-xs text-subtle">
            Research records are never used to train models. Only the records relevant to a request
            are sent, and each response is stored with the evidence it was given.
          </p>
        </Card>
      </div>
    </>
  );
}
