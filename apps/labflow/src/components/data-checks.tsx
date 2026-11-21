import { Card, CardHeader, cx } from './ui';
import type { DataChecks, Finding, Level } from '@/lib/data-checks';

const LEVEL: Record<Level, { label: string; icon: string; tone: string }> = {
  ok: { label: 'Fine', icon: '✓', tone: 'bg-ok/15 text-ok' },
  warn: { label: 'Check', icon: '!', tone: 'bg-warn/15 text-warn' },
  flag: { label: 'Needs action', icon: '!', tone: 'bg-danger/15 text-danger' },
};

export function FindingList({ items, compact = false }: { items: Finding[]; compact?: boolean }) {
  return (
    <ul className="space-y-2">
      {items.map((f, i) => (
        <li key={i} className={cx('flex gap-2.5', compact ? 'text-xs leading-5 text-muted' : 'text-sm leading-6')}>
          <span aria-hidden className={cx('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold', LEVEL[f.level].tone)}>
            {LEVEL[f.level].icon}
          </span>
          <span>
            <span className="sr-only">{LEVEL[f.level].label}: </span>
            {f.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * What the numbers say and what to do next, from stated thresholds. Sits at
 * the top of a dataset, above the plot, because it is the question people
 * open a dataset to answer.
 */
export function DataChecksCard({
  result,
  knockdown,
  keep,
}: {
  result: DataChecks;
  knockdown: number;
  /** Other query values (plot axes) to keep when the bar is changed. */
  keep: Record<string, string>;
}) {
  const isQpcr = result.kind.startsWith('qPCR');
  return (
    <Card>
      <CardHeader
        title="Next step"
        description={
          <>
            {result.kind} · <span className="tabular-nums">{result.summary}</span>
          </>
        }
      />
      <div className="space-y-5 p-5">
        <div className="rounded-lg border border-accent/20 bg-accent-soft px-4 py-3">
          <FindingList items={result.next} />
        </div>

        {isQpcr ? (
          <form className="flex flex-wrap items-end gap-3">
            {Object.entries(keep).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <label htmlFor="kd" className="text-sm">
              <span className="mb-1.5 block font-medium">Your knockdown bar (%)</span>
              <input
                id="kd"
                name="kd"
                type="number"
                min={1}
                max={99}
                defaultValue={knockdown}
                className="h-9 w-28 rounded-lg border border-line bg-surface px-3 text-sm tabular-nums"
              />
            </label>
            <button type="submit" className="h-9 rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-raised">
              Recheck
            </button>
          </form>
        ) : null}

        <section aria-labelledby="checks-title">
          <h3 id="checks-title" className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">
            Checks
          </h3>
          <FindingList items={result.checks} />
        </section>

        {result.bars.length ? (
          <figure>
            <figcaption className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">{result.chartTitle}</figcaption>
            <ul className="space-y-1.5">
              {result.bars.map((b, i) => (
                <li key={i} className="grid grid-cols-[minmax(5rem,12rem)_1fr_4rem] items-center gap-3 text-xs">
                  <span className="truncate font-mono text-muted" title={b.label}>
                    {b.label}
                  </span>
                  <span aria-hidden className="relative h-3.5 rounded-sm bg-raised">
                    <span
                      className={cx('absolute inset-y-0 left-0 rounded-sm', b.flag ? 'bg-danger' : 'bg-accent')}
                      style={{ width: `${Math.min(100, (b.value / result.max) * 100)}%` }}
                    />
                    {result.refLine ? (
                      <span className="absolute -inset-y-1 w-0.5 bg-fg" style={{ left: `${(result.refLine.value / result.max) * 100}%` }} />
                    ) : null}
                  </span>
                  <span className={cx('text-right font-mono tabular-nums', b.flag ? 'font-semibold text-danger' : 'text-fg')}>
                    {b.display}
                    {b.flag ? <span className="sr-only">, needs attention</span> : null}
                  </span>
                </li>
              ))}
            </ul>
            {result.refLine ? (
              <p className="mt-2 text-xs text-muted">
                The line marks {result.refLine.label}; red bars fall short of it.
              </p>
            ) : null}
          </figure>
        ) : null}

        <p className="text-xs text-subtle">
          Worked out from the numbers with fixed rules of thumb, not AI: {result.rules.join(' ')} Check it against your
          own SOP before acting.
        </p>
      </div>
    </Card>
  );
}
