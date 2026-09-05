import { InviteForm } from '@/components/invite-form';
import { CreateWorkspaceForm } from '@/components/workspace-switcher';
import { Badge, Button, Card, CardHeader, DefinitionList, PageHeader } from '@/components/ui';
import { aiConfigured } from '@/lib/env';
import { formatDate } from '@/lib/display';
import { requireSession } from '@/server/authz';
import { revokeInviteAction } from '@/server/actions/invites';
import { listInvites, listWorkspaceMembers } from '@/server/queries';

export const metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await requireSession();
  const [members, invites] = await Promise.all([
    listWorkspaceMembers(session),
    listInvites(session),
  ]);
  const canInvite = session.role !== 'member';

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
          {invites.length > 0 ? (
            <div className="border-t border-line px-5 py-3">
              <h3 className="text-xs font-medium uppercase tracking-wider text-subtle">
                Pending invitations
              </h3>
              <ul className="mt-2 space-y-2">
                {invites.map((invite) => (
                  <li key={invite.id} className="flex items-center gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate">{invite.email}</span>
                    <Badge>{invite.role}</Badge>
                    {canInvite ? (
                      <form action={revokeInviteAction}>
                        <input type="hidden" name="inviteId" value={invite.id} />
                        <Button type="submit" tone="ghost" size="sm" className="px-1 text-xs">
                          Revoke
                        </Button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>

        <InviteForm canInvite={canInvite} />

        <CreateWorkspaceForm />

        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-1 text-sm font-semibold tracking-tight">LabBot</h2>
          <p className="text-sm text-muted">
            LabBot calls a language model with a focused slice of your records — never the whole
            database — and can search PubMed alongside them.
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
