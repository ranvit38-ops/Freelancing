import Link from 'next/link';
import { Badge } from './ui';
import { assignTaskAction, setTaskStatusAction } from '@/server/actions/tasks';
import { formatDate } from '@/lib/display';

type Member = { id: string; name: string | null; email: string };

export type TaskSummary = {
  id: string;
  title: string;
  status: string;
  dueOn: string | null;
  assignedTo: string | null;
  assigneeName: string | null;
  projectId: string | null;
  projectName: string | null;
};

/** Reads as a sentence about the work, not as a status column. */
const NEXT: Record<string, { status: string; label: string } | null> = {
  open: { status: 'doing', label: 'Start' },
  doing: { status: 'done', label: 'Mark done' },
  done: { status: 'open', label: 'Reopen' },
};

const TONE: Record<string, 'neutral' | 'ok' | 'warn'> = {
  open: 'neutral',
  doing: 'warn',
  done: 'ok',
};

/**
 * One task on the board.
 *
 * Everything here is a plain form post, no client component and no JavaScript
 * needed: moving a task along and handing it to someone else are the two
 * things done most often, and both should survive a bad conference wifi
 * connection.
 */
export function TaskRow({ task, members }: { task: TaskSummary; members: Member[] }) {
  const next = NEXT[task.status];
  // A date that has passed is the one thing on this row worth colouring.
  const overdue = task.dueOn !== null && task.status !== 'done' && task.dueOn < today();

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
      <div className="min-w-0 flex-1">
        <Link
          href={`/tasks/${task.id}`}
          className="block truncate text-sm font-medium underline-offset-2 hover:underline"
        >
          {task.title}
        </Link>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <Badge tone={TONE[task.status] ?? 'neutral'}>{task.status}</Badge>
          {task.projectName ? <span className="truncate">{task.projectName}</span> : null}
          {task.dueOn ? (
            <span className={overdue ? 'font-medium text-danger' : undefined}>
              {overdue ? 'was due ' : 'due '}
              {formatDate(new Date(`${task.dueOn}T00:00:00Z`))}
            </span>
          ) : null}
        </p>
      </div>

      <form action={assignTaskAction} className="shrink-0">
        <input type="hidden" name="taskId" value={task.id} />
        <select
          name="assignedTo"
          defaultValue={task.assignedTo ?? ''}
          aria-label={`Who is doing "${task.title}"`}
          className="h-8 rounded-lg border border-line bg-surface px-2 text-xs text-fg"
        >
          <option value="">Nobody</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name ?? m.email}
            </option>
          ))}
        </select>
        <button className="ml-1.5 h-8 rounded-lg border border-line px-2 text-xs font-medium transition-colors hover:bg-raised">
          Assign
        </button>
      </form>

      {next ? (
        <form action={setTaskStatusAction} className="shrink-0">
          <input type="hidden" name="taskId" value={task.id} />
          <input type="hidden" name="status" value={next.status} />
          <button className="h-8 rounded-lg border border-line px-2.5 text-xs font-medium transition-colors hover:bg-raised">
            {next.label}
          </button>
        </form>
      ) : null}
    </li>
  );
}

/** Today in the same YYYY-MM-DD shape the column stores. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
