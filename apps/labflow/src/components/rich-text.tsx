import type { ReactNode } from 'react';
import { parseRichText, type Inline } from '@/lib/rich-text';

/**
 * Shows formatted text: bold, italic, lists, indents and the rest. Built as
 * React elements, never as HTML, so nothing typed into a box can inject
 * markup. `renderText` lets a caller turn plain stretches into something
 * more (chat turns "EXP-004" into a link).
 */
export function RichText({
  text,
  renderText = (t) => t,
  className = 'space-y-1 text-sm leading-6',
}: {
  text: string;
  renderText?: (text: string, key: string) => ReactNode;
  className?: string;
}) {
  const inline = (parts: Inline[], key: string) =>
    parts.map((p, i) => {
      const k = `${key}-${i}`;
      if (p.kind === 'bold') return <strong key={k}>{renderText(p.text, k)}</strong>;
      if (p.kind === 'italic') return <em key={k}>{renderText(p.text, k)}</em>;
      if (p.kind === 'strike') return <s key={k}>{renderText(p.text, k)}</s>;
      if (p.kind === 'code') {
        return (
          <code key={k} className="rounded bg-raised px-1 py-0.5 font-mono text-[0.85em]">
            {p.text}
          </code>
        );
      }
      return <span key={k}>{renderText(p.text, k)}</span>;
    });

  return (
    <div className={className}>
      {parseRichText(text).map((b, i) => {
        const k = `b${i}`;
        const pad = (depth: number) => ({ paddingLeft: `${depth * 1.25}rem` });
        switch (b.kind) {
          case 'gap':
            return <div key={k} aria-hidden className="h-1.5" />;
          case 'heading':
            return (
              <p key={k} className={b.level === 1 ? 'pt-1 text-base font-semibold' : 'pt-1 font-semibold'}>
                {inline(b.inline, k)}
              </p>
            );
          case 'quote':
            return (
              <blockquote key={k} className="border-l-2 border-line pl-3 text-muted">
                {inline(b.inline, k)}
              </blockquote>
            );
          case 'item':
            return (
              <div key={k} className="flex gap-2" style={pad(b.depth)}>
                <span aria-hidden className="w-5 shrink-0 text-right text-muted">
                  {b.list === 'check' ? (b.checked ? '☑' : '☐') : b.marker}
                </span>
                {b.list === 'check' ? <span className="sr-only">{b.checked ? 'Done: ' : 'To do: '}</span> : null}
                <span className={b.checked ? 'min-w-0 text-muted line-through' : 'min-w-0'}>{inline(b.inline, k)}</span>
              </div>
            );
          default:
            return (
              <p key={k} className="whitespace-pre-wrap break-words" style={pad(b.depth)}>
                {inline(b.inline, k)}
              </p>
            );
        }
      })}
    </div>
  );
}
