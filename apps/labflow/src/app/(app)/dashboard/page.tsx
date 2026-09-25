import Link from 'next/link';
import { ButtonLink, Card, CardHeader, EmptyState, PageHeader, cx } from '@/components/ui';
import { ExperimentList } from '@/components/records';
import { displayTime } from '@/lib/calendar';
import { greetingName, pluralise, projectStatusLabel } from '@/lib/display';
import { byDeadline, dueLabel, todayIso } from '@/lib/tasks';
import { requireSession } from '@/server/authz';
import { dashboardData, listCalendar, listDiscussion, listTasks, usageCounts } from '@/server/queries';

export const metadata = { title: 'Home' };
export const dynamic = 'force-dynamic';

/**
 * The first screen, and the one a busy PI judges the whole product by.
 *
 * Four questions, answered without a click: what am I meant to be doing, what
 * is happening this week, what is the lab talking about, and where is the
 * work. Plus one obvious way to record something new.
 */
export default async function HomePage() {
  const session = await requireSession();
  const today = todayIso();
  const weekEnd = new Date(Date.parse(`${today}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);

  const [data, tasks, week, channel, usage] = await Promise.all([
    dashboardData(session),
    listTasks(session),
    listCalendar(session, today, weekEnd),
    listDiscussion(session, { workspace: true }),
    usageCounts(session),
  ]);

  const mine = tasks
    .filter((t) => t.status !== 'done' && (t.assignedTo === session.userId || t.forEveryone))
    .sort(byDeadline);
  const latest = channel.slice(-4).reverse();
  const activeProjects = data.projects.filter((p) => p.status === 'active' || p.status === 'planning');
  // A lab nobody has talked in and nobody has handed work out in is new.
  // Three empty boxes are a poor first impression; a short path is better.
  const isNew = tasks.length === 0 && channel.length === 0;

  const upcoming = [
    ...week.events.map((e) => ({ key: `e-${e.id}`, day: e.onDate, title: e.title, sub: displayTime(e.atTime), href: `/calendar?d=${e.onDate}`, deadline: false })),
    ...week.deadlines
      .filter((t) => t.status !== 'done' && t.dueOn)
      .map((t) => ({ key: `t-${t.id}`, day: t.dueOn!, title: t.title, sub: t.forEveryone ? 'Whole lab' : (t.assigneeName ?? 'Unassigned'), href: `/tasks/${t.id}`, deadline: true })),
  ].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

  return (
    <>
      <PageHeader
        eyebrow={session.workspaceName}
        title={`Hi, ${greetingName(session.userName)}`}
        description={
          mine.length === 0
            ? 'Nothing is waiting on you.'
            : `${pluralise(mine.length, 'task')} on your plate.`
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/experiments/new">Record an experiment</ButtonLink>
            <ButtonLink href="/tasks" tone="secondary">
              Add a task
            </ButtonLink>
          </div>
        }
      />

      {isNew ? (
        <GettingStarted
          steps={[
            { done: usage.experiments > 0, href: '/experiments/new', title: 'Record an experiment', text: 'Drop a spreadsheet from your instrument. Labvia fills in the rest.' },
            { done: tasks.length > 0, href: '/tasks', title: 'Hand out a task', text: 'Give someone a piece of work and a deadline.' },
            { done: false, href: '/team', title: 'Bring in your lab', text: 'Share one join link in your group chat.' },
          ]}
        />
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="lg:col-span-2">
          <CardHeader title="Your tasks" action={<SeeAll href="/tasks" />} />
          {mine.length === 0 ? (
            <EmptyState
              title="All clear"
              description="Nothing is assigned to you. Tasks for you, or for the whole lab, show up here."
            />
          ) : (
            <ul className="divide-y divide-line">
              {mine.slice(0, 5).map((t) => {
                const due = dueLabel(t.dueOn, today);
                return (
                  <li key={t.id}>
                    <Link href={`/tasks/${t.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-raised">
                      <span
                        aria-hidden
                        className={cx(
                          'h-2.5 w-2.5 shrink-0 rounded-full',
                          t.status === 'doing' ? 'bg-warn' : 'border-2 border-line',
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{t.title}</span>
                        <span className="block truncate text-xs text-muted">
                          {t.forEveryone ? 'Whole lab' : 'You'}
                          {t.projectName ? ` · ${t.projectName}` : ''}
                        </span>
                      </span>
                      {t.dueOn ? (
                        <span
                          className={cx(
                            'shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium',
                            due.tone === 'overdue' ? 'bg-danger/10 text-danger' : due.tone === 'soon' ? 'bg-warn/10 text-warn' : 'text-muted',
                          )}
                        >
                          {due.text}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="This week" action={<SeeAll href="/calendar" label="Calendar" />} />
          {upcoming.length === 0 ? (
            <EmptyState title="A quiet week" description="Nothing on the calendar for the next seven days." />
          ) : (
            <ul className="divide-y divide-line">
              {upcoming.slice(0, 6).map((u) => (
                <li key={u.key}>
                  <Link href={u.href} className="flex gap-3 px-5 py-2.5 hover:bg-raised">
                    <span className="w-10 shrink-0 text-center">
                      <span className="block text-[11px] uppercase text-subtle">
                        {new Date(`${u.day}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}
                      </span>
                      <span className={cx('block text-sm font-semibold tabular-nums', u.day === today && 'text-accent')}>
                        {Number(u.day.slice(8))}
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {u.deadline ? 'Due: ' : ''}
                        {u.title}
                      </span>
                      <span className="block truncate text-xs text-muted">{u.sub}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Latest in #lab" action={<SeeAll href="/chat" label="Open chat" />} />
          {latest.length === 0 ? (
            <EmptyState
              title="No messages yet"
              description="Say hello to the lab, or share the join link from People so there is someone to talk to."
            />
          ) : (
            <ul className="divide-y divide-line">
              {latest.map((m) => (
                <li key={m.id}>
                  <Link href="/chat" className="block px-5 py-3 hover:bg-raised">
                    <span className="block text-xs font-semibold">{m.authorName ?? 'Former member'}</span>
                    <span className="line-clamp-2 text-sm text-muted">{m.body}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Projects" action={<SeeAll href="/projects" />} />
          {activeProjects.length === 0 ? (
            <EmptyState
              title="No projects yet"
              action={<ButtonLink href="/projects/new" size="sm">New project</ButtonLink>}
            />
          ) : (
            <ul className="divide-y divide-line">
              {activeProjects.slice(0, 5).map((p) => (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`} className="block px-5 py-3 hover:bg-raised">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {pluralise(p.experimentCount, 'experiment')} · {projectStatusLabel[p.status]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader title="Recent experiments" action={<SeeAll href="/experiments" />} />
          <ExperimentList
            experiments={data.recent}
            showProject
            empty={
              <EmptyState
                title="No experiments yet"
                description="Drop a spreadsheet from your instrument and Labvia fills in the experiment for you."
                action={<ButtonLink href="/experiments/new" size="sm">Record an experiment</ButtonLink>}
              />
            }
          />
        </Card>
      </div>
    </>
  );
}

function SeeAll({ href, label = 'See all' }: { href: string; label?: string }) {
  return (
    <Link href={href} className="text-sm text-muted underline-offset-2 hover:text-fg hover:underline">
      {label}
    </Link>
  );
}

/** Three first steps for a brand-new lab. Gone once the lab is in use. */
function GettingStarted({ steps }: { steps: { done: boolean; href: string; title: string; text: string }[] }) {
  return (
    <section aria-label="Getting started" className="mb-5 rounded-xl border border-accent/20 bg-accent/5 p-5">
      <h2 className="text-sm font-semibold">Three things to try first</h2>
      <ol className="mt-3 grid gap-3 sm:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step.href}>
            <Link
              href={step.href}
              className="flex h-full gap-3 rounded-lg border border-line bg-surface p-3 transition-colors hover:border-accent/40"
            >
              <span
                aria-hidden
                className={cx(
                  'grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold',
                  step.done ? 'bg-ok/15 text-ok' : 'bg-accent/10 text-accent',
                )}
              >
                {step.done ? '✓' : i + 1}
              </span>
              <span>
                <span className="block text-sm font-medium">{step.title}</span>
                <span className="mt-0.5 block text-xs text-muted">{step.text}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
