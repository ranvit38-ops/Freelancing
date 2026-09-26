import Link from 'next/link';
import { TaskComposer } from '@/components/task-forms';
import { TaskCheck } from '@/components/task-check';
import { TaskRow, type TaskSummary } from '@/components/task-row';
import { Card, CardHeader, PageHeader, cx } from '@/components/ui';
import { byDeadline, dueLabel, todayIso } from '@/lib/tasks';
import { requireSession } from '@/server/authz';
import { listProjects, listTasks, listWorkspaceMembers } from '@/server/queries';

export const metadata = { title: 'Tasks' };
export const dynamic = 'force-dynamic';

/**
 * The lab's work, in the order a person wants it.
 *
 * Yours first, then what the whole lab owes, then what nobody has picked up,
 * then everyone else's. Within each, the soonest deadline first, because that
 * is the order the work gets done in.
 */
/** The three counters at the top are also the three ways to narrow the list. */
const VIEWS = {
  mine: { title: 'On your plate', empty: 'Nothing on your plate.' },
  week: { title: 'Due this week', empty: 'Nothing of yours is due in the next seven days.' },
  overdue: { title: 'Overdue', empty: 'Nothing overdue. Well done.' },
} as const;
type View = keyof typeof VIEWS;

export default async function TasksPage({ searchParams }: { searchParams: { view?: string } }) {
  const view: View | null = searchParams.view && searchParams.view in VIEWS ? (searchParams.view as View) : null;
  const session = await requireSession();
  const [tasks, members, projects] = await Promise.all([
    listTasks(session),
    listWorkspaceMembers(session),
    listProjects(session),
  ]);
  const today = todayIso();

  const live = tasks.filter((t) => t.status !== 'done').sort(byDeadline);
  const mine = live.filter((t) => t.assignedTo === session.userId);
  const lab = live.filter((t) => t.forEveryone);
  const unclaimed = live.filter((t) => !t.assignedTo && !t.forEveryone);
  const others = live.filter((t) => t.assignedTo && t.assignedTo !== session.userId);
  const done = tasks.filter((t) => t.status === 'done').slice(0, 20);

  const onMe = [...mine, ...lab];
  const overdueList = onMe.filter((t) => dueLabel(t.dueOn, today).tone === 'overdue');
  const weekList = onMe.filter((t) => dueLabel(t.dueOn, today).tone === 'soon');
  const overdue = overdueList.length;
  const thisWeek = weekList.length;

  const sections: { key: string; title: string; hint: string; items: TaskSummary[]; empty: string }[] = view
    ? [
        {
          key: 'mine',
          title: VIEWS[view].title,
          hint: 'Yours and the whole lab’s, soonest deadline first',
          items: view === 'mine' ? onMe : view === 'week' ? weekList : overdueList,
          empty: VIEWS[view].empty,
        },
      ]
    : [
    { key: 'mine', title: 'Yours', hint: 'Assigned to you', items: mine, empty: 'Nothing assigned to you. Nice.' },
    { key: 'lab', title: 'Whole lab', hint: 'Everyone is expected to do these', items: lab, empty: 'Nothing for the whole lab right now.' },
    { key: 'free', title: 'Up for grabs', hint: 'Nobody has picked these up yet', items: unclaimed, empty: 'Everything has someone on it.' },
    { key: 'others', title: 'Everyone else', hint: 'So you can see what is already being done', items: others, empty: 'Nobody else has anything open.' },
      ];

  const row = (t: TaskSummary) => (
    <TaskRow key={t.id} task={t} members={members} currentUserId={session.userId} today={today} />
  );

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Hand out work, set a deadline, and say how it is going on the task itself."
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Stat href="/tasks?view=mine" active={view === 'mine'} label="on your plate" value={onMe.length} />
        <Stat href="/tasks?view=week" active={view === 'week'} label="due this week" value={thisWeek} tone={thisWeek ? 'warn' : undefined} />
        <Stat href="/tasks?view=overdue" active={view === 'overdue'} label="overdue" value={overdue} tone={overdue ? 'danger' : undefined} />
        {view ? (
          <Link href="/tasks" className="ml-1 text-sm font-medium text-accent underline-offset-2 hover:underline">
            Show all tasks
          </Link>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="space-y-5 lg:col-span-2">
          {sections.map((section) =>
            // Empty sections other than your own are noise; yours stays so
            // "nothing assigned" is a statement rather than a missing box.
            section.items.length === 0 && section.key !== 'mine' ? null : (
              <Card key={section.key}>
                <CardHeader title={`${section.title} · ${section.items.length}`} description={section.hint} />
                {section.items.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-muted">{section.empty}</p>
                ) : (
                  <ul className="divide-y divide-line">{section.items.map(row)}</ul>
                )}
              </Card>
            ),
          )}

          {done.length > 0 && !view ? (
            <details className="rounded-xl border border-line bg-surface">
              <summary className="cursor-pointer px-5 py-3 text-sm font-medium">
                Done · {done.length}
              </summary>
              <ul className="divide-y divide-line border-t border-line">
                {done.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <TaskCheck taskId={t.id} done title={t.title} />
                    <Link href={`/tasks/${t.id}`} className="text-muted line-through hover:text-fg hover:no-underline">
                      {t.title}
                    </Link>
                    <span className="ml-2 text-xs text-subtle">
                      {t.forEveryone ? 'Whole lab' : (t.assigneeName ?? '')}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>

        <div>
          <TaskComposer members={members} projects={projects} currentUserId={session.userId} />
        </div>
      </div>
    </>
  );
}

function Stat({
  href,
  active,
  label,
  value,
  tone,
}: {
  href: string;
  active: boolean;
  label: string;
  value: number;
  tone?: 'warn' | 'danger';
}) {
  return (
    <Link
      href={active ? '/tasks' : href}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'rounded-xl border px-4 py-2.5 transition-colors hover:border-accent/40',
        active && 'ring-2 ring-accent/40',
        tone === 'danger'
          ? 'border-danger/25 bg-danger/5 text-danger'
          : tone === 'warn'
            ? 'border-warn/25 bg-warn/5 text-warn'
            : 'border-line bg-surface',
      )}
    >
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      <span className="ml-1.5 text-sm">{label}</span>
    </Link>
  );
}
