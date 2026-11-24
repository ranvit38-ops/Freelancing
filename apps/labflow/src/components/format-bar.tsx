'use client';

import { useEffect, useRef, useState } from 'react';
import { continueList, indent, outdent, toggleHeading, toggleList, toggleWrap, type Edit } from '@/lib/rich-text';
import { cx } from './ui';

/**
 * Bold, italic, lists and indents for every multi-line box in the app.
 *
 * One bar, shown just above whichever box has the cursor, rather than a
 * toolbar on every form. The formatting is written as plain characters
 * (**bold**, - item), which every page shows formatted. Keyboard: Ctrl or
 * Cmd with B, I, Shift+X (strike), ] (indent), [ (outdent); Enter carries a
 * list on. A box marked data-no-format (pasted tables, lists of IDs) is left
 * alone.
 */

function formattable(el: EventTarget | null): el is HTMLTextAreaElement {
  return el instanceof HTMLTextAreaElement && !el.readOnly && !el.disabled && !el.closest('[data-no-format]') && el.id !== 'labbot-question';
}

function apply(el: HTMLTextAreaElement, edit: (e: Edit) => Edit | null): boolean {
  const next = edit({ value: el.value, start: el.selectionStart, end: el.selectionEnd });
  if (!next) return false;
  // As typing does, so React's onChange and the form both see it.
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(el, next.value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.setSelectionRange(next.start, next.end);
  // A controlled box can re-render after the input event; put the selection
  // back after it, unless the person has already moved on: a late frame must
  // never pull the cursor back over what they typed since.
  cancelAnimationFrame(restore);
  restore = requestAnimationFrame(() => {
    if (el.isConnected && el.value === next.value) el.setSelectionRange(next.start, next.end);
  });
  return true;
}

let restore = 0;
/** Any key or click after a format action wins over the pending selection fix-up. */
function userMoved() {
  cancelAnimationFrame(restore);
}

const ACTIONS: { label: string; keys: string; show: React.ReactNode; edit: (e: Edit) => Edit }[] = [
  { label: 'Bold', keys: 'Ctrl+B', show: <b>B</b>, edit: (e) => toggleWrap(e, '**') },
  { label: 'Italic', keys: 'Ctrl+I', show: <i className="font-serif">I</i>, edit: (e) => toggleWrap(e, '*') },
  { label: 'Strikethrough', keys: 'Ctrl+Shift+X', show: <s>S</s>, edit: (e) => toggleWrap(e, '~~') },
  { label: 'Heading', keys: '', show: <span className="font-semibold">H</span>, edit: toggleHeading },
  { label: 'Bulleted list', keys: '', show: '•≡', edit: (e) => toggleList(e, 'bullet') },
  { label: 'Numbered list', keys: '', show: '1.', edit: (e) => toggleList(e, 'number') },
  { label: 'Checklist', keys: '', show: '☐', edit: (e) => toggleList(e, 'check') },
  { label: 'Outdent', keys: 'Ctrl+[', show: '⇤', edit: outdent },
  { label: 'Indent', keys: 'Ctrl+]', show: '⇥', edit: indent },
];

export function FormatBar() {
  const target = useRef<HTMLTextAreaElement | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const place = () => {
      const el = target.current;
      if (!el || !el.isConnected) return setAt(null);
      const r = el.getBoundingClientRect();
      // Off screen: hide rather than float over something else.
      if (r.bottom < 40 || r.top > window.innerHeight) return setAt(null);
      const width = bar.current?.offsetWidth ?? 300;
      setAt({ left: Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)), top: Math.max(4, r.top - 38) });
    };
    const onFocus = (event: FocusEvent) => {
      if (!formattable(event.target)) return;
      target.current = event.target;
      place();
    };
    const onBlur = (event: FocusEvent) => {
      if (event.target !== target.current) return;
      if (bar.current?.contains(event.relatedTarget as Node | null)) return;
      target.current = null;
      setAt(null);
    };
    const onKey = (event: KeyboardEvent) => {
      const el = event.target;
      if (!formattable(el) || event.defaultPrevented || event.isComposing) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      let edit: ((e: Edit) => Edit | null) | null = null;
      if (mod && !event.shiftKey && key === 'b') edit = (e) => toggleWrap(e, '**');
      else if (mod && !event.shiftKey && key === 'i') edit = (e) => toggleWrap(e, '*');
      else if (mod && event.shiftKey && key === 'x') edit = (e) => toggleWrap(e, '~~');
      else if (mod && event.key === ']') edit = indent;
      else if (mod && event.key === '[') edit = outdent;
      else if (event.key === 'Enter' && !mod && !event.shiftKey && !event.altKey) edit = continueList;
      if (edit && apply(el, edit)) event.preventDefault();
    };
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onBlur);
    // Bubbling, so a box's own Enter (chat's send) runs first and wins.
    document.addEventListener('keydown', onKey);
    document.addEventListener('keydown', userMoved, true);
    document.addEventListener('pointerdown', userMoved, true);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', onBlur);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keydown', userMoved, true);
      document.removeEventListener('pointerdown', userMoved, true);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, []);

  return (
    <div
      ref={bar}
      role="toolbar"
      aria-label="Formatting"
      data-format-bar
      onBlur={(e) => {
        if (!bar.current?.contains(e.relatedTarget as Node | null) && e.relatedTarget !== target.current) {
          target.current = null;
          setAt(null);
        }
      }}
      className={cx(
        'fixed z-40 flex items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5 shadow-lg',
        !at && 'invisible',
      )}
      style={at ?? { left: 0, top: 0 }}
    >
      {ACTIONS.map((a) => (
        <button
          key={a.label}
          type="button"
          tabIndex={at ? 0 : -1}
          aria-label={a.label}
          title={a.keys ? `${a.label} (${a.keys})` : a.label}
          // Keeps the cursor and selection in the box.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const el = target.current;
            if (!el) return;
            apply(el, a.edit);
            el.focus();
          }}
          className="grid h-7 min-w-7 place-items-center rounded-md px-1.5 text-sm text-fg hover:bg-raised"
        >
          {a.show}
        </button>
      ))}
    </div>
  );
}
