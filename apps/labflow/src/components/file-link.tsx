'use client';

import { useEffect, useRef, useState } from 'react';
import { fileKind, fileTag, previewRows } from '@/lib/file-kind';
import { cx } from './ui';

type Props = {
  id: string;
  filename: string;
  sourceUrl?: string | null;
  isDocument?: boolean;
  className?: string;
  children?: React.ReactNode;
};

/** Where a file opens: its own page, in a new tab, so the list stays where it was. */
export function fileHref(f: { id: string; sourceUrl?: string | null; isDocument?: boolean }): string {
  return f.isDocument ? `/docs/${f.id}` : f.sourceUrl ? f.sourceUrl : `/files/${f.id}`;
}

const texts = new Map<string, Promise<string | null>>();
function loadText(id: string): Promise<string | null> {
  if (!texts.has(id)) {
    texts.set(
      id,
      fetch(`/api/files/${id}/preview`)
        .then((r) => (r.ok ? r.json() : { text: null }))
        .then((j: { text: string | null }) => j.text)
        .catch(() => null),
    );
  }
  return texts.get(id)!;
}

/** What the hover card shows for one file. */
function Preview({ id, filename, sourceUrl, isDocument }: Props) {
  const kind = isDocument ? 'text' : fileKind(filename);
  const [text, setText] = useState<string | null | undefined>(undefined);
  const wantsText = !sourceUrl && (kind === 'text' || kind === 'table');
  useEffect(() => {
    if (!wantsText) return;
    let live = true;
    void loadText(id).then((t) => live && setText(t));
    return () => {
      live = false;
    };
  }, [id, wantsText]);

  if (sourceUrl) {
    let host = sourceUrl;
    try {
      host = new URL(sourceUrl).hostname;
    } catch {}
    return <p className="p-3 text-sm text-muted">A link to {host}. Opens there.</p>;
  }
  if (kind === 'image') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/files/${id}`} alt="" className="max-h-64 w-full rounded-md object-contain" />;
  }
  if (kind === 'pdf') {
    return <iframe title={`Preview of ${filename}`} src={`/api/files/${id}#toolbar=0&view=FitH`} className="h-72 w-full rounded-md bg-white" />;
  }
  if (kind === 'video') {
    return <video src={`/api/files/${id}`} muted autoPlay loop playsInline className="max-h-64 w-full rounded-md" />;
  }
  if (wantsText) {
    if (text === undefined) return <p className="p-3 text-sm text-muted">Reading…</p>;
    if (!text) return <p className="p-3 text-sm text-muted">No preview for this one. Click to open it.</p>;
    if (kind === 'table') {
      const rows = previewRows(text);
      return (
        <div className="overflow-hidden p-2">
          <table className="w-full table-fixed text-left text-xs">
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={i === 0 ? 'font-semibold' : 'text-muted'}>
                  {r.map((c, j) => (
                    <td key={j} className="truncate border-b border-line px-1 py-0.5">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return <p className="line-clamp-[10] whitespace-pre-line p-3 text-xs leading-relaxed text-muted">{text.slice(0, 700)}</p>;
  }
  return <p className="p-3 text-sm text-muted">No preview for a .{fileTag(filename).toLowerCase()} file. Click to download it.</p>;
}

/**
 * A file's name that opens it in a new tab and, held under the pointer or
 * focused, shows what is inside: the picture, the PDF's first page, the
 * opening rows of a sheet or the first lines of a Word file.
 */
export function FileLink(props: Props) {
  const { id, filename, sourceUrl, isDocument, className, children } = props;
  const anchor = useRef<HTMLAnchorElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [at, setAt] = useState<{ left: number; top?: number; bottom?: number } | null>(null);

  function show() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(352, window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      // Below the name, or above it near the bottom of the window.
      setAt(r.bottom + 320 > window.innerHeight ? { left, bottom: window.innerHeight - r.top + 6 } : { left, top: r.bottom + 6 });
    }, 250);
  }
  function hide() {
    if (timer.current) clearTimeout(timer.current);
    setAt(null);
  }
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <>
      <a
        ref={anchor}
        href={fileHref({ id, sourceUrl, isDocument })}
        target="_blank"
        rel="noopener"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onKeyDown={(e) => e.key === 'Escape' && hide()}
        className={cx('underline-offset-2 hover:underline', className)}
        data-file-link
      >
        {children ?? filename}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      {at ? (
        <div
          aria-hidden
          data-file-preview
          className="pointer-events-none fixed z-50 w-[22rem] max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
          style={at}
        >
          <p className="truncate border-b border-line px-3 py-1.5 text-xs font-medium">{filename}</p>
          <Preview {...props} />
        </div>
      ) : null}
    </>
  );
}

/** A small square for a list row: the picture itself, or the file type. */
export function FileThumb({ id, filename, isDocument, sourceUrl }: Pick<Props, 'id' | 'filename' | 'isDocument' | 'sourceUrl'>) {
  const kind = isDocument ? 'text' : fileKind(filename);
  if (kind === 'image' && !sourceUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/files/${id}`} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded-md border border-line object-cover" />;
  }
  const tone =
    kind === 'pdf' ? 'bg-rose/15 text-fg' : kind === 'table' ? 'bg-teal/15 text-fg' : kind === 'video' ? 'bg-violet/15 text-fg' : 'bg-accent-soft text-accent';
  return (
    <span aria-hidden className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-md text-[10px] font-bold', tone)}>
      {isDocument ? 'DOC' : sourceUrl ? 'LINK' : fileTag(filename)}
    </span>
  );
}
