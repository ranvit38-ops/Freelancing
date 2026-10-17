import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Discussion } from '@/components/discussion';
import { Badge, Card, CardHeader, PageHeader } from '@/components/ui';
import { formatDate } from '@/lib/display';
import { EVERYONE, dueLabel, todayIso } from '@/lib/tasks';
import { requireSession } from '@/server/authz';
import { NotFoundInWorkspaceError } from '@/server/not-found';
import { assignTaskAction, deleteTaskAction, setTaskStatusAction } from '@/server/actions/tasks';
import { getTask, listDiscussion, listWorkspaceMembers } from '@/server/queries';

export const dynamic = 'force-dynamic';

/**
 * One task, and the conversation about it.
 *
 * The thread is the point. "I ran it, here is the gel, the third lane looks
 * wrong" belongs against the work it describes, not in a channel where it
 * scrolls away, so that the person who inherits this in a year can read what
 * happened rather than ask someone who has graduated.
 */
export default async function TaskPage({ params }: { params: { taskId: string } }) {
  const session = await requireSession();

  let task;
  try {
    task = await getTask(session, params.taskId);
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) notFound();
    throw error;
  }

  const [messages, members] = await Promise.all([
    listDiscussion(session, { taskId: task.id }),
    listWorkspaceMembers(session),
  ]);

  const tone = task.status === 'done' ? 'ok' : task.status === 'doing' ? 'warn' : 'neutral';

  return (
    <>
      <PageHeader
        title={task.title}
        description={
          task.projectName
            ? `In ${task.projectName}. Added ${formatDate(task.createdAt)}.`
            : `Added ${formatDate(task.createdAt)}.`
        }
      />

      <div className="grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="lg:col-span-2">
          <Discussion
            messages={messages}
            taskId={task.id}
            title="Progress"
            currentUserId={session.userId}
            returnTo={`/tasks/${task.id}`}
          />
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Status" />
            <div className="space-y-3 px-5 py-4">
              <div className="flex items-center gap-2">
                <Badge tone={tone}>{task.status}</Badge>
                {task.dueOn && task.status !== 'done' ? (
                  <span className="text-xs font-medium text-muted">{dueLabel(task.dueOn, todayIso()).text}</span>
                ) : null}
              </div>

              <form action={setTaskStatusAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="taskId" value={task.id} />
                {(['open', 'doing', 'done'] as const)
                  .filter((s) => s !== task.status)
                  .map((s) => (
                    <button
                      key={s}
                      name="status"
                      value={s}
                      className="h-8 rounded-lg border border-line px-2.5 text-xs font-medium transition-colors hover:bg-raised"
                    >
                      {s === 'doing' ? 'Mark in progress' : s === 'done' ? 'Mark done' : 'Reopen'}
                    </button>
                  ))}
              </form>
            </div>
          </Card>

          <Card>
            <CardHeader title="Who is doing it" />
            <form action={assignTaskAction} className="space-y-3 px-5 py-4">
              <input type="hidden" name="taskId" value={task.id} />
              <select
                name="assignedTo"
                defaultValue={task.forEveryone ? EVERYONE : (task.assignedTo ?? '')}
                aria-label="Assign this task"
                className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg"
              >
                <option value="">Nobody yet</option>
                <option value={EVERYONE}>Everyone in the lab</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name ?? m.email}
                  </option>
                ))}
              </select>
              <button className="h-9 w-full rounded-lg border border-line text-sm font-medium transition-colors hover:bg-raised">
                Save
              </button>
            </form>
          </Card>

          {task.detail ? (
            <Card>
              <CardHeader title="Notes" description="From whoever added this." />
              <p className="whitespace-pre-wrap px-5 py-4 text-sm text-muted">{task.detail}</p>
            </Card>
          ) : null}

          <div className="flex items-center justify-between gap-3 px-1">
            <Link href="/tasks" className="text-sm text-muted underline underline-offset-2 hover:text-fg">
              All tasks
            </Link>
            <form action={deleteTaskAction}>
              <input type="hidden" name="taskId" value={task.id} />
              <button className="text-sm text-muted underline underline-offset-2 hover:text-danger">
                Delete
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
