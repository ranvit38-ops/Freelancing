import Link from 'next/link';
import { TaskComposer } from '@/components/task-forms';
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
export default async function TasksPage() {
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
  const overdue = onMe.filter((t) => dueLabel(t.dueOn, today).tone === 'overdue').length;
  const thisWeek = onMe.filter((t) => dueLabel(t.dueOn, today).tone === 'soon').length;

  const sections: { key: string; title: string; hint: string; items: TaskSummary[]; empty: string }[] = [
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

      <div className="mb-5 flex flex-wrap gap-2">
        <Stat label="on your plate" value={onMe.length} />
        <Stat label="due this week" value={thisWeek} tone={thisWeek ? 'warn' : undefined} />
        <Stat label="overdue" value={overdue} tone={overdue ? 'danger' : undefined} />
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

          {done.length > 0 ? (
            <details className="rounded-xl border border-line bg-surface">
              <summary className="cursor-pointer px-5 py-3 text-sm font-medium">
                Done · {done.length}
              </summary>
              <ul className="divide-y divide-line border-t border-line">
                {done.map((t) => (
                  <li key={t.id} className="px-5 py-2.5 text-sm">
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

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warn' | 'danger' }) {
  return (
    <div
      className={cx(
        'rounded-xl border px-4 py-2.5',
        tone === 'danger'
          ? 'border-danger/25 bg-danger/5 text-danger'
          : tone === 'warn'
            ? 'border-warn/25 bg-warn/5 text-warn'
            : 'border-line bg-surface',
      )}
    >
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      <span className="ml-1.5 text-sm">{label}</span>
    </div>
  );
}
