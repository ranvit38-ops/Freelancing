import { InviteForm } from '@/components/invite-form';
import { JoinLink } from '@/components/join-link';
import { Badge, Card, CardHeader, PageHeader } from '@/components/ui';
import { linkForViewer } from '@/server/origin';
import { requireSession } from '@/server/authz';
import { getJoinCode, listWorkspaceMembers } from '@/server/queries';

export const metadata = { title: 'People' };
export const dynamic = 'force-dynamic';

/**
 * Who is in the lab, and how to bring the rest of them in.
 *
 * The lab channel that used to live here moved to Chat, where people look
 * for a conversation. This page is now just the roster and the two ways in:
 * one link for everyone, or a named invitation.
 */
export default async function PeoplePage() {
  const session = await requireSession();
  const [members, joinCode] = await Promise.all([listWorkspaceMembers(session), getJoinCode(session)]);
  const canManage = session.role !== 'member';

  return (
    <>
      <PageHeader
        title="People"
        description={`Everyone in ${session.workspaceName}. Share the join link in your group chat and the whole lab is in.`}
      />

      <div className="grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="lg:col-span-2">
          <CardHeader title="In this lab" description={`${members.length} ${members.length === 1 ? 'person' : 'people'}`} />
          <ul className="divide-y divide-line">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-5 py-3">
                <div
                  aria-hidden
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/10 text-xs font-semibold text-accent"
                >
                  {(m.name ?? m.email)
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((w) => w[0]?.toUpperCase())
                    .join('')}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {m.name ?? m.email}
                    {m.id === session.userId ? <span className="ml-1.5 text-xs font-normal text-subtle">you</span> : null}
                  </p>
                  <p className="truncate text-xs text-muted">{m.email}</p>
                </div>
                <Badge tone={m.role === 'owner' ? 'accent' : 'neutral'}>{m.role}</Badge>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-5">
          <JoinLink
            link={joinCode ? linkForViewer(`/join?code=${encodeURIComponent(joinCode)}`) : null}
            canManage={canManage}
          />
          <InviteForm canInvite={canManage} />
        </div>
      </div>
    </>
  );
}
