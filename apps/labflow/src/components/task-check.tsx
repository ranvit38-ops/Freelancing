'use client';

import { useState, useTransition } from 'react';
import { setTaskStatusAction } from '@/server/actions/tasks';
import { cx } from './ui';

/**
 * The one click that finishes a task.
 *
 * It ticks the moment it is pressed and saves behind it; the row moves to
 * Done when the save lands. Clicking a ticked one reopens it, which is the
 * undo for a slip of the finger. Finishing a task used to be two buttons
 * (Start, then Done) and people stopped bothering.
 */
export function TaskCheck({ taskId, done, title }: { taskId: string; done: boolean; title: string }) {
  const [checked, setChecked] = useState(done);
  const [saving, startSaving] = useTransition();

  function toggle() {
    const next = !checked;
    setChecked(next);
    const form = new FormData();
    form.set('taskId', taskId);
    form.set('status', next ? 'done' : 'open');
    startSaving(async () => {
      try {
        await setTaskStatusAction(form);
      } catch {
        // Put it back as it was; the list still shows the truth.
        setChecked(!next);
      }
    });
  }

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? `Reopen "${title}"` : `Mark "${title}" done`}
      title={checked ? 'Done. Click to reopen' : 'Mark done'}
      onClick={toggle}
      disabled={saving}
      className={cx(
        'grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 text-[11px] font-bold leading-none transition-colors',
        checked ? 'border-ok bg-ok text-white' : 'border-line hover:border-ok hover:bg-ok/10',
        saving && 'opacity-70',
      )}
    >
      {checked ? '✓' : ''}
    </button>
  );
}
