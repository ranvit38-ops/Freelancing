import type { ReactNode } from 'react';

/**
 * The little markdown a chat answer uses: paragraphs, bullets, numbered
 * lists, headings, bold, italics and inline code. Built as React elements,
 * never as HTML, so nothing in an answer can inject markup. Tolerates a
 * half-written answer, since it re-renders on every streamed word.
 */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let i = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const token = match[0];
    if (token.startsWith('**')) out.push(<strong key={`${key}-${i++}`}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith('`')) {
      out.push(
        <code key={`${key}-${i++}`} className="rounded bg-raised px-1 py-0.5 font-mono text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else out.push(<em key={`${key}-${i++}`}>{token.slice(1, -1)}</em>);
    last = at + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function ChatMarkdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r/g, '').split('\n');
  let list: { ordered: boolean; items: string[] } | null = null;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const k = `p${blocks.length}`;
    blocks.push(
      <p key={k} className="whitespace-pre-wrap">
        {inline(paragraph.join('\n'), k)}
      </p>,
    );
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    const k = `l${blocks.length}`;
    const items = list.items.map((item, i) => <li key={`${k}-${i}`}>{inline(item, `${k}-${i}`)}</li>);
    blocks.push(
      list.ordered ? (
        <ol key={k} className="list-decimal space-y-1 pl-5">
          {items}
        </ol>
      ) : (
        <ul key={k} className="list-disc space-y-1 pl-5">
          {items}
        </ul>
      ),
    );
    list = null;
  };

  for (const line of lines) {
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const heading = /^\s*#{1,4}\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]!);
    } else if (heading) {
      flushParagraph();
      flushList();
      const k = `h${blocks.length}`;
      blocks.push(
        <p key={k} className="font-semibold">
          {inline(heading[1]!, k)}
        </p>,
      );
    } else if (line.trim() === '') {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return <div className="space-y-2.5 text-sm leading-6">{blocks}</div>;
}
