import Link from 'next/link';
import { ChatRoom } from '@/components/chat-room';
import { PageHeader, cx } from '@/components/ui';
import { UpgradePanel } from '@/components/upgrade-panel';
import { requireSession } from '@/server/authz';
import { workspacePlan } from '@/server/paywall';
import { listDiscussion, listProjects } from '@/server/queries';

export const metadata = { title: 'Chat' };
export const dynamic = 'force-dynamic';

/**
 * The lab's conversations: one channel for everyone, one per project.
 *
 * These are the same threads that used to live on the Team page and on each
 * project's Discussion tab, gathered in the one place people expect to talk.
 * Nothing moved in the database; only where you read it.
 */
export default async function ChatPage({ searchParams }: { searchParams: { c?: string } }) {
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

  const projects = await listProjects(session);

  const project = projects.find((p) => p.id === searchParams.c) ?? null;
  const channel = project
    ? { key: project.id, name: slug(project.name), projectId: project.id }
    : { key: 'lab', name: 'lab', projectId: null };

  const messages = await listDiscussion(
    session,
    project ? { projectId: project.id } : { workspace: true },
  );

  const channels = [
    { key: 'lab', name: 'lab', href: '/chat' },
    ...projects.map((p) => ({ key: p.id, name: slug(p.name), href: `/chat?c=${p.id}` })),
  ];

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
        </nav>
        <ChatRoom
          key={channel.key}
          channel={{ name: channel.name, projectId: channel.projectId }}
          messages={messages}
          currentUserId={session.userId}
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
