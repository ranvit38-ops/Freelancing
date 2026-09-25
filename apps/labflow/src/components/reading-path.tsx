'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ReadingStep } from '@/lib/reading-path';
import { cx } from './ui';

/**
 * The numbered path, with a tick for each thing read and progress across the
 * top. Ticks are kept in this browser: they are a personal bookmark, not
 * something the lab needs to see.
 */
export function ReadingPath({ steps, storageKey }: { steps: ReadingStep[]; storageKey: string }) {
  const [done, setDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) setDone(new Set(JSON.parse(saved) as string[]));
    } catch {
      // Storage blocked: ticks just will not persist.
    }
  }, [storageKey]);

  function toggle(key: string) {
    setDone((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        // As above.
      }
      return next;
    });
  }

  const count = steps.filter((s) => done.has(s.key)).length;
  const groups = [...new Set(steps.map((s) => s.group))];
  let n = 0;

  return (
    <div>
      <div className="px-5 pb-4">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            {count} of {steps.length} read
          </span>
          {count === steps.length && steps.length > 0 ? <span className="font-medium text-ok">All caught up 🎉</span> : null}
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-raised">
          <div
            className="h-full rounded-full bg-ok transition-all"
            style={{ width: `${steps.length ? (count / steps.length) * 100 : 0}%` }}
          />
        </div>
      </div>
      {groups.map((group) => (
        <section key={group} className="border-t border-line">
          <h3 className="px-5 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-subtle">{group}</h3>
          <ol>
            {steps
              .filter((s) => s.group === group)
              .map((s) => {
                n += 1;
                const read = done.has(s.key);
                return (
                  <li key={s.key} className="flex items-start gap-3 px-5 py-2.5">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={read}
                      aria-label={read ? `Mark “${s.title}” unread` : `Mark “${s.title}” read`}
                      onClick={() => toggle(s.key)}
                      className={cx(
                        'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 text-xs font-semibold',
                        read ? 'border-ok bg-ok text-white' : 'border-line text-muted hover:border-ok',
                      )}
                    >
                      {read ? '✓' : n}
                    </button>
                    <div className="min-w-0">
                      <Link
                        href={s.href}
                        onClick={() => {
                          if (!read) toggle(s.key);
                        }}
                        className={cx('text-sm font-medium hover:underline', read && 'text-muted')}
                      >
                        {s.title}
                      </Link>
                      <p className="text-xs text-muted">{s.why}</p>
                    </div>
                  </li>
                );
              })}
          </ol>
        </section>
      ))}
    </div>
  );
}
