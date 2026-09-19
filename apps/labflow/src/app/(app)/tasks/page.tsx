import Link from 'next/link';
import { TaskComposer } from '@/components/task-forms';
import { TaskRow } from '@/components/task-row';
import { Card, CardHeader, EmptyState, PageHeader } from '@/components/ui';
import { requireSession } from '@/server/authz';
import { listProjects, listTasks, listWorkspaceMembers } from '@/server/queries';

export const metadata = { title: 'Who is doing what' };
export const dynamic = 'force-dynamic';

/**
 * The lab's work, in the order a person actually wants it.
 *
 * Mine first, unclaimed second, everyone else's last. A board sorted by
 * project or by date makes you hunt for your own name, and the question this
 * page is opened with is always "what am I meant to be doing".
 */
export default async function TasksPage() {
  const session = await requireSession();
  const [tasks, members, projects] = await Promise.all([
    listTasks(session),
    listWorkspaceMembers(session),
    listProjects(session),
  ]);

  const live = tasks.filter((t) => t.status !== 'done');
  const mine = live.filter((t) => t.assignedTo === session.userId);
  const unclaimed = live.filter((t) => t.assignedTo === null);
  const others = live.filter((t) => t.assignedTo !== null && t.assignedTo !== session.userId);
  const done = tasks.filter((t) => t.status === 'done').slice(0, 15);

  const sections = [
    {
      key: 'mine',
      title: 'Yours',
      description: 'What the lab is expecting from you.',
      items: mine,
      empty: 'Nothing assigned to you right now.',
    },
    {
      key: 'unclaimed',
      title: 'Nobody has picked these up',
      description: 'Work the lab agreed on that has no name against it yet.',
      items: unclaimed,
      empty: 'Everything has someone on it.',
    },
    {
      key: 'others',
      title: 'Everyone else',
      description: 'So you can see what is already being done before you start it again.',
      items: others,
      empty: 'Nobody else has anything open.',
    },
  ];

  return (
    <>
      <PageHeader
        title="Who is doing what"
        description="Delegate a piece of work, say how it is going on the task itself, and let the rest of the lab answer there. The thread stays attached, so whoever picks this up in six months can read how it went."
      />

      <div className="grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="space-y-5 lg:col-span-2">
          {tasks.length === 0 ? (
            <EmptyState
              title="No tasks yet"
              description="Add the first one on the right. The thing you would otherwise say out loud in a meeting and nobody would write down."
            />
          ) : (
            sections.map((section) => (
              <Card key={section.key}>
                <CardHeader
                  title={section.title}
                  description={`${section.items.length} · ${section.description}`}
                />
                {section.items.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-muted">{section.empty}</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {section.items.map((task) => (
                      <TaskRow key={task.id} task={task} members={members} />
                    ))}
                  </ul>
                )}
              </Card>
            ))
          )}

          {done.length > 0 ? (
            <Card>
              <CardHeader title="Finished" description="The fifteen most recent." />
              <ul className="divide-y divide-line">
                {done.map((task) => (
                  <li key={task.id} className="px-5 py-2.5">
                    <Link
                      href={`/tasks/${task.id}`}
                      className="text-sm text-muted line-through underline-offset-2 hover:text-fg hover:no-underline"
                    >
                      {task.title}
                    </Link>
                    {task.assigneeName ? (
                      <span className="ml-2 text-xs text-subtle">{task.assigneeName}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div>
          <TaskComposer members={members} projects={projects} />
        </div>
      </div>
    </>
  );
}
