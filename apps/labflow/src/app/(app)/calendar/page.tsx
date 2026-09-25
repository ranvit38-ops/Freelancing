import Link from 'next/link';
import { EventForm } from '@/components/event-form';
import { Card, CardHeader, PageHeader, cx } from '@/components/ui';
import { displayTime, monthGrid, monthKey, monthName, parseMonth, shiftMonth } from '@/lib/calendar';
import { todayIso } from '@/lib/tasks';
import { deleteEventAction } from '@/server/actions/calendar';
import { requireSession } from '@/server/authz';
import { listCalendar } from '@/server/queries';

export const metadata = { title: 'Calendar' };
export const dynamic = 'force-dynamic';

type Item =
  | { kind: 'event'; id: string; title: string; time: string | null; notes: string | null; who: string | null }
  | { kind: 'deadline'; id: string; title: string; done: boolean; who: string | null };

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * The lab's month: meetings and bookings anyone adds, and every task deadline
 * shown on the day it falls.
 *
 * A grid on a wide screen, an agenda on a phone: seven columns at phone width
 * leaves each day too narrow to read a title in.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: { m?: string; d?: string };
}) {
  const session = await requireSession();
  const today = todayIso();
  const month = parseMonth(searchParams.m, today);
  const days = monthGrid(month);
  const { events, deadlines } = await listCalendar(session, days[0]!, days.at(-1)!);

  const byDay = new Map<string, Item[]>();
  const add = (day: string, item: Item) => byDay.set(day, [...(byDay.get(day) ?? []), item]);
  for (const e of events) {
    add(e.onDate, { kind: 'event', id: e.id, title: e.title, time: e.atTime, notes: e.notes, who: e.creatorName });
  }
  for (const t of deadlines) {
    if (!t.dueOn) continue;
    add(t.dueOn, {
      kind: 'deadline',
      id: t.id,
      title: t.title,
      done: t.status === 'done',
      who: t.forEveryone ? 'Whole lab' : t.assigneeName,
    });
  }

  const key = monthKey(month);
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.d ?? '') ? searchParams.d! : today;
  const inMonth = (day: string) => day.startsWith(key);
  const agenda = days.filter((d) => inMonth(d) && byDay.has(d));

  return (
    <>
      <PageHeader title="Calendar" description="Lab events, and every task deadline on the day it is due." />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{monthName(month)}</h2>
            <div className="flex items-center gap-1">
              <MonthLink href={`/calendar?m=${monthKey(shiftMonth(month, -1))}`} label="Previous month">
                ←
              </MonthLink>
              <Link
                href="/calendar"
                className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-raised"
              >
                Today
              </Link>
              <MonthLink href={`/calendar?m=${monthKey(shiftMonth(month, 1))}`} label="Next month">
                →
              </MonthLink>
            </div>
          </div>

          {/* Month grid, wide screens */}
          <div className="hidden overflow-hidden rounded-xl border border-line bg-surface md:block">
            <div className="grid grid-cols-7 border-b border-line bg-raised text-xs font-medium text-muted">
              {WEEKDAYS.map((d) => (
                <div key={d} className="px-2 py-2">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const items = byDay.get(day) ?? [];
                return (
                  <div
                    key={day}
                    className={cx(
                      'min-h-[6.5rem] border-b border-r border-line p-1.5 [&:nth-child(7n)]:border-r-0',
                      !inMonth(day) && 'bg-raised/60',
                      day === selected && 'ring-2 ring-inset ring-accent/40',
                    )}
                  >
                    <Link
                      href={`/calendar?m=${key}&d=${day}`}
                      aria-label={`Add something on ${day}`}
                      className={cx(
                        'mb-1 inline-grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs tabular-nums hover:bg-raised',
                        day === today ? 'bg-accent font-semibold text-accent-fg hover:bg-accent' : inMonth(day) ? 'text-fg' : 'text-subtle',
                      )}
                    >
                      {Number(day.slice(8))}
                    </Link>
                    <ul className="space-y-0.5">
                      {items.slice(0, 3).map((item) => (
                        <li key={`${item.kind}-${item.id}`}>
                          <Chip item={item} />
                        </li>
                      ))}
                      {items.length > 3 ? (
                        <li className="px-1 text-[11px] text-muted">+{items.length - 3} more</li>
                      ) : null}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Agenda, phones */}
          <Card className="md:hidden">
            <CardHeader title="This month" />
            {agenda.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted">Nothing on the calendar this month yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {agenda.map((day) => (
                  <li key={day} className="px-5 py-3">
                    <p className={cx('text-xs font-semibold', day === today ? 'text-accent' : 'text-muted')}>
                      {new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric',
                        timeZone: 'UTC',
                      })}
                      {day === today ? ' · Today' : ''}
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {byDay.get(day)!.map((item) => (
                        <li key={`${item.kind}-${item.id}`}>
                          <Chip item={item} />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <p className="flex flex-wrap gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-accent/70" /> Event
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-warn/70" /> Task deadline
            </span>
          </p>
        </div>

        <div className="space-y-5">
          <EventForm key={selected} defaultDate={selected} />
          <DayDetail day={selected} items={byDay.get(selected) ?? []} />
        </div>
      </div>
    </>
  );
}

function MonthLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-lg border border-line text-sm hover:bg-raised"
    >
      {children}
    </Link>
  );
}

function Chip({ item }: { item: Item }) {
  if (item.kind === 'deadline') {
    return (
      <Link
        href={`/tasks/${item.id}`}
        title={`Task due: ${item.title}${item.who ? ` (${item.who})` : ''}`}
        className={cx(
          'block truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium hover:opacity-80',
          item.done ? 'bg-raised text-subtle line-through' : 'bg-warn/15 text-warn',
        )}
      >
        Due: {item.title}
      </Link>
    );
  }
  return (
    <span
      title={`${item.title}${item.notes ? ` · ${item.notes}` : ''}`}
      className="block truncate rounded-md bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent"
    >
      {item.time ? `${displayTime(item.time)} ` : ''}
      {item.title}
    </span>
  );
}

/** What is on the chosen day, with the one thing you can do to an event: remove it. */
function DayDetail({ day, items }: { day: string; items: Item[] }) {
  const label = new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return (
    <Card>
      <CardHeader title={label} />
      {items.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">Nothing on this day.</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}`} className="flex items-start gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                {item.kind === 'event' ? (
                  <>
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-muted">
                      {displayTime(item.time)}
                      {item.who ? ` · added by ${item.who}` : ''}
                    </p>
                    {item.notes ? <p className="mt-1 text-sm text-muted">{item.notes}</p> : null}
                  </>
                ) : (
                  <>
                    <Link href={`/tasks/${item.id}`} className="text-sm font-medium hover:underline">
                      {item.title}
                    </Link>
                    <p className="text-xs text-muted">
                      Task deadline{item.who ? ` · ${item.who}` : ''}
                      {item.done ? ' · done' : ''}
                    </p>
                  </>
                )}
              </div>
              {item.kind === 'event' ? (
                <form action={deleteEventAction}>
                  <input type="hidden" name="eventId" value={item.id} />
                  <button
                    aria-label={`Remove ${item.title}`}
                    className="rounded-md px-2 py-1 text-xs text-subtle hover:bg-raised hover:text-danger"
                  >
                    Remove
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
