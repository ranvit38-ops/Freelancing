import Link from 'next/link';
import { ChatRoom } from '@/components/chat-room';
import { PageHeader, cx } from '@/components/ui';
import { UpgradePanel } from '@/components/upgrade-panel';
import { requireSession } from '@/server/authz';
import { workspacePlan } from '@/server/paywall';
import { listDiscussion, listDmThreads, listProjects, listWorkspaceMembers } from '@/server/queries';
import { dmKey, dmParticipants } from '@/lib/dm';

export const metadata = { title: 'Chat' };
export const dynamic = 'force-dynamic';

/**
 * The lab's conversations: one channel for everyone, one per project.
 *
 * These are the same threads that used to live on the Team page and on each
 * project's Discussion tab, gathered in the one place people expect to talk.
 * Nothing moved in the database; only where you read it.
 */
export default async function ChatPage({
  searchParams,
}: {
  searchParams: { c?: string; dm?: string; with?: string };
}) {
  const session = await requireSession();

  // Without this, a plan that does not include conversation would show a
  // chat whose Send silently does nothing.
  const { limits } = await workspacePlan(session);
  if (!limits.discussion) {
    return (
      <>
        <PageHeader title="Chat" />
        <UpgradePanel
          title="Lab chat"
          what="One channel for the whole lab and one for every project."
          why="Your current plan does not include it. Nothing already written is affected, and it comes back the moment the plan does."
        />
      </>
    );
  }

  const [projects, members, threads] = await Promise.all([
    listProjects(session),
    listWorkspaceMembers(session),
    listDmThreads(session),
  ]);
  const nameOf = new Map(members.map((m) => [m.id, m.name || m.email]));
  const others = members.filter((m) => m.id !== session.userId);
  const dmTitle = (key: string) =>
    (dmParticipants(key) ?? [])
      .filter((id) => id !== session.userId)
      .map((id) => nameOf.get(id) ?? 'Former member')
      .join(', ');

  // A DM is opened either by its key or by a person ("message Maya"), and
  // both land in the same thread. Only people in this lab can be messaged.
  const requestedDm = searchParams.with
    ? others.some((m) => m.id === searchParams.with)
      ? dmKey([session.userId, searchParams.with])
      : null
    : searchParams.dm && dmParticipants(searchParams.dm)?.includes(session.userId)
      ? searchParams.dm
      : null;

  const project = requestedDm ? null : (projects.find((p) => p.id === searchParams.c) ?? null);
  const channel = requestedDm
    ? { key: `dm:${requestedDm}`, name: dmTitle(requestedDm) || 'Direct message', projectId: null, dm: true }
    : project
      ? { key: project.id, name: slug(project.name), projectId: project.id, dm: false }
      : { key: 'lab', name: 'lab', projectId: null, dm: false };

  const messages = await listDiscussion(
    session,
    requestedDm ? { dmKey: requestedDm } : project ? { projectId: project.id } : { workspace: true },
  );

  const channels = [
    { key: 'lab', name: 'lab', href: '/chat' },
    ...projects.map((p) => ({ key: p.id, name: slug(p.name), href: `/chat?c=${p.id}` })),
  ];
  const threadKeys = new Set(threads.map((t) => t.dmKey));
  // People you have not talked to yet, so starting a conversation is one click.
  const newPeople = others.filter((m) => !threadKeys.has(dmKey([session.userId, m.id])));

  return (
    <>
      <PageHeader title="Chat" />
      <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="Channels" className="min-w-0">
          <p className="mb-2 hidden px-2 text-xs font-medium uppercase tracking-wider text-subtle lg:block">
            Channels
          </p>
          <ul className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible">
            {channels.map((c) => (
              <li key={c.key} className="shrink-0">
                <Link
                  href={c.href}
                  aria-current={c.key === channel.key ? 'page' : undefined}
                  className={cx(
                    'block truncate rounded-lg px-3 py-1.5 text-sm transition-colors',
                    c.key === channel.key
                      ? 'bg-accent/10 font-medium text-accent'
                      : 'text-muted hover:bg-raised hover:text-fg',
                  )}
                >
                  # {c.name}
                </Link>
              </li>
            ))}
          </ul>

          <p className="mb-2 mt-5 hidden px-2 text-xs font-medium uppercase tracking-wider text-subtle lg:block">
            Direct messages
          </p>
          <ul className="mt-2 flex gap-1.5 overflow-x-auto pb-1 lg:mt-0 lg:flex-col lg:gap-0.5 lg:overflow-visible">
            {threads.map((t) => {
              const active = channel.key === `dm:${t.dmKey}`;
              return (
                <li key={t.dmKey} className="shrink-0">
                  <Link
                    href={`/chat?dm=${t.dmKey}`}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'flex items-center gap-2 truncate rounded-lg px-3 py-1.5 text-sm transition-colors',
                      active
                        ? 'bg-accent/10 font-medium text-accent'
                        : t.unread
                          ? 'font-semibold text-fg hover:bg-raised'
                          : 'text-muted hover:bg-raised hover:text-fg',
                    )}
                  >
                    <span className="truncate">{dmTitle(t.dmKey) || 'Former member'}</span>
                    {t.unread && !active ? (
                      <span aria-label="unread" className="h-2 w-2 shrink-0 rounded-full bg-accent" />
                    ) : null}
                  </Link>
                </li>
              );
            })}
            {newPeople.map((m) => {
              const active = channel.key === `dm:${dmKey([session.userId, m.id])}`;
              return (
                <li key={m.id} className="shrink-0">
                  <Link
                    href={`/chat?with=${m.id}`}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'block truncate rounded-lg px-3 py-1.5 text-sm transition-colors',
                      active ? 'bg-accent/10 font-medium text-accent' : 'text-subtle hover:bg-raised hover:text-fg',
                    )}
                  >
                    {m.name || m.email}
                  </Link>
                </li>
              );
            })}
            {others.length === 0 ? (
              <li className="px-3 py-1.5 text-xs text-subtle">
                Invite your lab from{' '}
                <Link href="/team" className="underline">
                  People
                </Link>{' '}
                to message them.
              </li>
            ) : null}
          </ul>
        </nav>
        <ChatRoom
          key={channel.key}
          channel={{ key: channel.key, name: channel.name, projectId: channel.projectId, dm: channel.dm }}
          messages={messages}
          currentUserId={session.userId}
          currentUserName={session.userName}
        />
      </div>
    </>
  );
}

/** "PFAS Removal Study" reads as #pfas-removal-study, the way channels are named. */
function slug(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'project'
  );
}
