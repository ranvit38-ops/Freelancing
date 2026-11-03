import Link from 'next/link';
import { InviteForm } from '@/components/invite-form';
import { MemberControls } from '@/components/membership-controls';
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
                {canManage ? (
                  <Link
                    href={`/activity?person=${m.id}`}
                    className="hidden text-xs text-muted underline-offset-2 hover:text-fg hover:underline sm:block"
                  >
                    Activity
                  </Link>
                ) : null}
                {m.id !== session.userId &&
                (session.role === 'owner' || (session.role === 'admin' && m.role === 'member')) ? (
                  <MemberControls
                    userId={m.id}
                    role={m.role}
                    name={m.name ?? m.email}
                    canChangeRole={session.role === 'owner'}
                    canRemove
                  />
                ) : (
                  <Badge tone={m.role === 'owner' ? 'accent' : 'neutral'}>{m.role}</Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-5">
          <JoinLink
            link={joinCode ? await linkForViewer(`/join?code=${encodeURIComponent(joinCode)}`) : null}
            canManage={canManage}
          />
          <InviteForm canInvite={canManage} />
          <Card className="p-5">
            <h2 className="text-sm font-semibold tracking-tight">Who can do what</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="font-medium">Member</dt>
                <dd className="text-muted">
                  Records experiments, notes and files, and reads everything in the lab that is not someone&apos;s
                  private file or direct message.
                </dd>
              </div>
              <div>
                <dt className="font-medium">Admin</dt>
                <dd className="text-muted">
                  Everything a member can, plus inviting and removing members, the activity log of who put in or
                  changed what, and removing notes.
                </dd>
              </div>
              <div>
                <dt className="font-medium">Owner</dt>
                <dd className="text-muted">
                  Everything, including making anyone an admin or owner. A lab always keeps at least one owner.
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
