'use client';

import { useEffect, useState } from 'react';
import { cx } from './ui';

type Choice = 'system' | 'light' | 'dark';
const KEY = 'labvia-theme';

/** Applies a choice to the document. "system" removes the attribute entirely. */
function apply(choice: Choice) {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

export function ThemeToggle() {
  const [choice, setChoice] = useState<Choice>('system');

  // The stored choice is read on mount rather than during render, because the
  // server has no localStorage and a mismatch would blow up hydration.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(KEY);
    } catch {
      stored = null;
    }
    if (stored === 'light' || stored === 'dark' || stored === 'system') setChoice(stored);
  }, []);

  function pick(next: Choice) {
    setChoice(next);
    apply(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // Private browsing refuses to store. The choice still applies for now.
    }
  }

  const options: { value: Choice; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex rounded-lg border border-line bg-raised p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={choice === o.value}
          onClick={() => pick(o.value)}
          className={cx(
            'rounded-md px-3 py-1.5 text-sm transition-colors',
            choice === o.value
              ? 'bg-surface font-medium text-fg shadow-sm'
              : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Applies the stored theme before the page paints.
 *
 * Without this the first frame is light and then snaps to dark, which reads as
 * a bug. It has to be inline and synchronous in <head>, so it is a script tag
 * rather than an effect.
 */
export function ThemeScript() {
  const source = `(function(){try{var t=localStorage.getItem('${KEY}');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})()`;
  return <script dangerouslySetInnerHTML={{ __html: source }} />;
}
