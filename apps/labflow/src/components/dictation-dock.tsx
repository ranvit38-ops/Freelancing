'use client';

import { useEffect, useRef, useState } from 'react';
import { useDictation } from './use-dictation';
import { cx } from './ui';

type Field = HTMLInputElement | HTMLTextAreaElement;

/** Text you would say out loud: not passwords, emails, numbers or dates. */
function dictatable(el: EventTarget | null): el is Field {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) return ['text', 'search', ''].includes(el.type) && !el.readOnly && !el.disabled;
  return false;
}

function fieldName(el: Field): string {
  const label = el.labels?.[0]?.textContent?.trim() || el.getAttribute('aria-label') || el.placeholder || 'this box';
  return label.replace(/\s*\(optional\)\s*$/i, '').slice(0, 60);
}

/**
 * Sets a field the way typing does, so React's onChange and the form both see
 * it: the value setter on the prototype, then an input event.
 */
function setFieldValue(el: Field, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Speak into any text box in the app.
 *
 * One button, bottom left, for every form: click into a box (an experiment's
 * notes, a task, a chat message), press Speak, talk, press again to stop. The
 * words go in where the cursor was. Shown only where the browser can listen
 * (Chrome, Edge, Safari); LabBot's own box has its own button.
 */
export function DictationDock() {
  const target = useRef<Field | null>(null);
  const dock = useRef<HTMLDivElement>(null);
  const base = useRef<{ before: string; after: string }>({ before: '', after: '' });
  const [name, setName] = useState('');
  // Shown only while a text box has the cursor (or while listening), so it is
  // not one more thing on every screen.
  const [focused, setFocused] = useState(false);
  const dictation = useDictation((heard) => {
    const el = target.current;
    if (!el || !el.isConnected) return;
    const { before, after } = base.current;
    const sep = before && !/\s$/.test(before) ? ' ' : '';
    setFieldValue(el, `${before}${sep}${heard.trimStart()}${after}`);
  });

  useEffect(() => {
    function onFocus(event: FocusEvent) {
      const el = event.target;
      if (!dictatable(el) || el.id === 'labbot-question') return;
      target.current = el;
      setName(fieldName(el));
      setFocused(true);
    }
    function onBlur(event: FocusEvent) {
      // Tabbing from the box to the Speak button keeps it shown.
      if (event.target === target.current && !dock.current?.contains(event.relatedTarget as Node | null)) setFocused(false);
    }
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onBlur);
    return () => {
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', onBlur);
    };
  }, []);

  if (!dictation.supported || (!focused && !dictation.listening)) return null;

  function toggle() {
    if (dictation.listening) {
      dictation.stop();
      target.current?.focus();
      return;
    }
    const el = target.current;
    if (!el || !el.isConnected) return;
    const at = el.selectionStart ?? el.value.length;
    base.current = { before: el.value.slice(0, at), after: el.value.slice(el.selectionEnd ?? at) };
    dictation.start('');
  }

  const ready = Boolean(name);
  return (
    <div ref={dock} onBlur={(e) => !dock.current?.contains(e.relatedTarget as Node | null) && e.relatedTarget !== target.current && setFocused(false)} className="fixed bottom-5 left-4 z-30 flex max-w-[calc(100vw-10rem)] flex-col items-start gap-1 lg:left-[16rem]">
      <button
        type="button"
        // Keeps the cursor in the box: a click on the button would otherwise move focus off it.
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggle}
        disabled={!ready && !dictation.listening}
        aria-pressed={dictation.listening}
        title={ready ? `Speak into ${name}` : 'Click into a text box first'}
        className={cx(
          'inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium shadow-lg transition-colors disabled:cursor-not-allowed disabled:opacity-60',
          dictation.listening ? 'border-danger bg-danger text-accent-fg' : 'border-line bg-surface text-fg hover:border-accent hover:text-accent',
        )}
      >
        <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
          <rect x="7" y="2.5" width="6" height="10" rx="3" />
          <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" strokeLinecap="round" />
        </svg>
        <span className="truncate">{dictation.listening ? `Stop · into ${name}` : ready ? `Speak into ${name}` : 'Speak'}</span>
      </button>
      <p role="status" className={cx('rounded-md bg-surface/95 px-2 py-0.5 text-xs', dictation.error ? 'text-danger' : 'text-muted', !dictation.listening && !dictation.error && 'sr-only')}>
        {dictation.error || (dictation.listening ? 'Listening. Your browser turns speech into text using its own speech service.' : '')}
      </p>
    </div>
  );
}
