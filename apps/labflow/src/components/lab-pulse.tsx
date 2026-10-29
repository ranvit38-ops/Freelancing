import Link from 'next/link';
import { Card, CardHeader, cx } from './ui';
import { QUIET_AFTER_DAYS, type PulseRow } from '@/lib/pulse';

function lastSeen(days: number | null): string {
  if (days === null) return 'Nothing recorded yet';
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

/**
 * Running the lab from one card: who recorded what this week, whose records
 * are thin, and who has gone quiet. Every number opens the detail behind it.
 */
export function LabPulse({ rows }: { rows: PulseRow[] }) {
  const quiet = rows.filter((r) => r.quietDays === null || r.quietDays >= QUIET_AFTER_DAYS).length;
  const thin = rows.reduce((n, r) => n + r.recordsToFill, 0);
  return (
    <Card className="mb-5">
      <CardHeader
        title="Your lab this week"
        description={[
          thin ? `${thin} ${thin === 1 ? 'record needs' : 'records need'} more detail` : 'Every started record is complete',
          quiet ? `${quiet} ${quiet === 1 ? 'person has' : 'people have'} recorded nothing in a week` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        action={
          <span className="flex gap-4 text-sm">
            <Link href="/experiments/record-check" className="text-muted underline-offset-2 hover:text-fg hover:underline">
              Record check
            </Link>
            <Link href="/activity" className="text-muted underline-offset-2 hover:text-fg hover:underline">
              Activity
            </Link>
          </span>
        }
      />
      {/* Phones get a list: five columns do not fit, and the last one matters most. */}
      <ul className="divide-y divide-line sm:hidden">
        {rows.map((r) => {
          const isQuiet = r.quietDays === null || r.quietDays >= QUIET_AFTER_DAYS;
          return (
            <li key={r.id} className="px-5 py-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <Link href={`/activity?person=${r.id}`} className="font-medium hover:underline">
                  {r.name ?? r.email}
                </Link>
                <span className={cx('shrink-0 text-xs', isQuiet ? 'text-warn' : 'text-muted')}>
                  {lastSeen(r.quietDays)}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {r.runsThisWeek} {r.runsThisWeek === 1 ? 'run' : 'runs'} · {r.notesThisWeek}{' '}
                {r.notesThisWeek === 1 ? 'note' : 'notes'} this week
                {r.recordsToFill > 0 ? (
                  <>
                    {' · '}
                    <Link href="/experiments/record-check" className="text-warn hover:underline">
                      {r.recordsToFill} to fill in
                    </Link>
                  </>
                ) : null}
              </p>
            </li>
          );
        })}
      </ul>
      <div tabIndex={0} role="region" aria-label="This week by person" className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-subtle">
              <th scope="col" className="px-5 py-2 font-medium">Person</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Runs this week</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Notes this week</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Records to fill in</th>
              <th scope="col" className="px-5 py-2 text-right font-medium">Last recorded</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => {
              const isQuiet = r.quietDays === null || r.quietDays >= QUIET_AFTER_DAYS;
              return (
                <tr key={r.id}>
                  <td className="px-5 py-2.5">
                    <Link href={`/activity?person=${r.id}`} className="font-medium hover:underline">
                      {r.name ?? r.email}
                    </Link>
                    {r.role !== 'member' ? <span className="ml-1.5 text-xs text-subtle">{r.role}</span> : null}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.runsThisWeek}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.notesThisWeek}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {r.recordsToFill > 0 ? (
                      <Link href="/experiments/record-check" className="text-warn underline-offset-2 hover:underline">
                        {r.recordsToFill}
                      </Link>
                    ) : (
                      <span className="text-subtle">0</span>
                    )}
                  </td>
                  <td className={cx('whitespace-nowrap px-5 py-2.5 text-right', isQuiet ? 'text-warn' : 'text-muted')}>
                    {lastSeen(r.quietDays)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
