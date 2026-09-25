import Link from 'next/link';
import { AutoSubmitSelect } from './auto-submit-select';
import { TaskCheck } from './task-check';
import { cx } from './ui';
import { assignTaskAction } from '@/server/actions/tasks';
import { EVERYONE, dueLabel, type DueTone } from '@/lib/tasks';

type Member = { id: string; name: string | null; email: string };

export type TaskSummary = {
  id: string;
  title: string;
  status: string;
  dueOn: string | null;
  assignedTo: string | null;
  assigneeName: string | null;
  forEveryone: boolean;
  projectId: string | null;
  projectName: string | null;
};

const DUE_CLASS: Record<DueTone, string> = {
  overdue: 'bg-danger/10 text-danger',
  soon: 'bg-warn/10 text-warn',
  later: 'bg-raised text-muted',
  none: 'text-subtle',
};

/**
 * One task: a tick box to finish it, what it is, when it is due, and who has it.
 *
 * Plain form posts throughout, so the board works on slow conference wifi;
 * the only script is the select that saves as soon as a name is picked.
 */
export function TaskRow({
  task,
  members,
  currentUserId,
  today,
}: {
  task: TaskSummary;
  members: Member[];
  currentUserId: string;
  today: string;
}) {
  const due = dueLabel(task.dueOn, today);
  const unclaimed = !task.assignedTo && !task.forEveryone;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
      <TaskCheck taskId={task.id} done={task.status === 'done'} title={task.title} />
      <div className="min-w-0 flex-1 basis-48">
        <Link href={`/tasks/${task.id}`} className="block truncate text-sm font-medium hover:underline">
          {task.status === 'doing' ? (
            <span aria-label="In progress" className="mr-1.5 inline-block h-2 w-2 rounded-full bg-warn align-middle" />
          ) : null}
          {task.title}
        </Link>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          {task.status !== 'done' && task.dueOn ? (
            <span className={cx('rounded-md px-1.5 py-0.5 font-medium', DUE_CLASS[due.tone])}>{due.text}</span>
          ) : null}
          {task.projectName ? <span className="truncate text-muted">{task.projectName}</span> : null}
        </p>
      </div>

      {unclaimed && task.status !== 'done' ? (
        <form action={assignTaskAction} className="shrink-0">
          <input type="hidden" name="taskId" value={task.id} />
          <input type="hidden" name="assignedTo" value={currentUserId} />
          <button className="h-8 rounded-lg border border-accent/30 bg-accent/5 px-2.5 text-xs font-medium text-accent hover:bg-accent/10">
            I&rsquo;ll take it
          </button>
        </form>
      ) : null}

      <form action={assignTaskAction} className="shrink-0">
        <input type="hidden" name="taskId" value={task.id} />
        <AutoSubmitSelect
          name="assignedTo"
          defaultValue={task.forEveryone ? EVERYONE : (task.assignedTo ?? '')}
          aria-label={`Who is doing "${task.title}"`}
          className="h-8 max-w-[11rem] rounded-lg border border-line bg-surface px-2 text-xs text-fg"
        >
          <option value="">Nobody yet</option>
          <option value={EVERYONE}>Everyone in the lab</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id === currentUserId ? `${m.name ?? m.email} (you)` : (m.name ?? m.email)}
            </option>
          ))}
        </AutoSubmitSelect>
      </form>
    </li>
  );
}
