import Link from 'next/link';
import { Discussion } from '@/components/discussion';
import { InviteForm } from '@/components/invite-form';
import { UpgradePanel } from '@/components/upgrade-panel';
import { Badge, Card, CardHeader, PageHeader } from '@/components/ui';
import { formatBytes, formatDate } from '@/lib/display';
import { requireSession } from '@/server/authz';
import { workspacePlan } from '@/server/paywall';
import { listDiscussion, listFiles, listWorkspaceMembers } from '@/server/queries';

export const metadata = { title: 'Team' };
export const dynamic = 'force-dynamic';

/**
 * The workspace channel: one conversation for the whole lab, rather than one
 * per project.
 *
 * It is the same threaded discussion used on a project, pointed at a row with
 * no project and no experiment. Group meeting notes, a question about who has
 * the good pipettes, a link to a result worth everyone seeing.
 */
export default async function TeamPage() {
  const session = await requireSession();
  const { limits } = await workspacePlan(session);

  if (!limits.discussion) {
    return (
      <>
        <PageHeader title="Team" />
        <UpgradePanel
          title="Team conversation"
          what="One channel for the whole lab, alongside the threads on each project and run."
          why="The free plan is a single person, so there is nobody to talk to on it yet. Add people on a paid plan and this is where the lab talks."
        />
      </>
    );
  }

  const [messages, members, files] = await Promise.all([
    listDiscussion(session, { workspace: true }),
    listWorkspaceMembers(session),
    listFiles(session),
  ]);
  const recent = files.slice(0, 6);

  return (
    <>
      <PageHeader
        title="Team"
        description="One conversation for the whole lab. Discussion about a particular run belongs on that run, where it stays attached to the result it explains."
      />

      <div className="grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="lg:col-span-2">
          <Discussion
            messages={messages}
            workspace
            title="Lab channel"
            currentUserId={session.userId}
            returnTo="/team"
          />
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="People" description={`${members.length} in this workspace`} />
            <ul className="divide-y divide-line">
              {members.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.name ?? m.email}</p>
                    <p className="truncate text-xs text-muted">{m.email}</p>
                  </div>
                  <Badge>{m.role}</Badge>
                </li>
              ))}
            </ul>
          </Card>

          {/* Adding someone belongs where you can see who is already here,
              not two pages away under Settings. */}
          <InviteForm canInvite={session.role !== 'member'} />

          <Card>
            <CardHeader
              title="Latest files"
              description="Uploaded anywhere in the workspace"
            />
            {recent.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">
                Nothing uploaded yet. Files are attached to the run that produced them, which is
                what makes them findable a year later.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {recent.map((f) => (
                  <li key={f.id} className="px-5 py-3">
                    <Link
                      href={`/api/files/${f.id}`}
                      className="block truncate text-sm underline underline-offset-2"
                    >
                      {f.filename}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {formatBytes(f.byteSize)} · {formatDate(f.createdAt)}
                      {f.experimentTitle ? ` · ${f.experimentTitle}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-line px-5 py-3">
              <Link
                href="/files"
                className="text-sm text-muted underline underline-offset-2 hover:text-fg"
              >
                All files
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
