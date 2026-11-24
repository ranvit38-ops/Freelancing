/**
 * The formatting people can use in any text box: **bold**, *italic*,
 * ~~struck out~~, `code`, headings, bullet, numbered and check lists,
 * indented lines and quotes. Written as plain characters (Markdown), so the
 * text stays readable anywhere: in an email, an export, or a search result.
 *
 * Two halves: reading text into blocks for display, and editing a text box's
 * value for the formatting bar. Both are pure, so both are tested without a
 * browser.
 */

export type Inline = { kind: 'text' | 'bold' | 'italic' | 'strike' | 'code'; text: string };

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; inline: Inline[] }
  | { kind: 'item'; list: 'bullet' | 'number' | 'check'; depth: number; marker: string; checked?: boolean; inline: Inline[] }
  | { kind: 'quote'; inline: Inline[] }
  | { kind: 'line'; depth: number; inline: Inline[] }
  | { kind: 'gap' };

const INLINE = /(\*\*[^*\n]+\*\*|~~[^~\n]+~~|`[^`\n]+`|\*[^*\s\n][^*\n]*\*|(?<![\w])_[^_\s\n][^_\n]*_(?![\w]))/g;

/** Bold, italic, struck-out and code spans in one line. Unclosed markers stay as typed. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > last) out.push({ kind: 'text', text: text.slice(last, at) });
    const token = match[0];
    if (token.startsWith('**')) out.push({ kind: 'bold', text: token.slice(2, -2) });
    else if (token.startsWith('~~')) out.push({ kind: 'strike', text: token.slice(2, -2) });
    else if (token.startsWith('`')) out.push({ kind: 'code', text: token.slice(1, -1) });
    else out.push({ kind: 'italic', text: token.slice(1, -1) });
    last = at + token.length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

/** Two spaces, or a tab, is one level of indent. */
function depthOf(indent: string): number {
  const spaces = indent.replace(/\t/g, '  ').length;
  return Math.min(6, Math.floor(spaces / 2));
}

export function parseRichText(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      if (blocks.length && blocks.at(-1)!.kind !== 'gap') blocks.push({ kind: 'gap' });
      continue;
    }
    const heading = /^\s*(#{1,3})\s+(.*)$/.exec(line);
    const check = /^(\s*)[-*]\s+\[([ xX])\]\s+(.*)$/.exec(line);
    const bullet = /^(\s*)[-*•]\s+(.*)$/.exec(line);
    const numbered = /^(\s*)(\d+[.)])\s+(.*)$/.exec(line);
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (heading) blocks.push({ kind: 'heading', level: heading[1]!.length as 1 | 2 | 3, inline: parseInline(heading[2]!) });
    else if (check) blocks.push({ kind: 'item', list: 'check', depth: depthOf(check[1]!), marker: '', checked: check[2] !== ' ', inline: parseInline(check[3]!) });
    else if (bullet) blocks.push({ kind: 'item', list: 'bullet', depth: depthOf(bullet[1]!), marker: '•', inline: parseInline(bullet[2]!) });
    else if (numbered) blocks.push({ kind: 'item', list: 'number', depth: depthOf(numbered[1]!), marker: numbered[2]!, inline: parseInline(numbered[3]!) });
    else if (quote) blocks.push({ kind: 'quote', inline: parseInline(quote[1]!) });
    else blocks.push({ kind: 'line', depth: depthOf(/^\s*/.exec(line)![0]), inline: parseInline(line.trim()) });
  }
  while (blocks.at(-1)?.kind === 'gap') blocks.pop();
  return blocks;
}

/* ── editing: what each button on the formatting bar does ──────────────── */

export type Edit = { value: string; start: number; end: number };

/** Wraps the selection in a marker, or unwraps it if it is already wrapped. With nothing selected, inserts a pair to type into. */
export function toggleWrap(e: Edit, marker: string): Edit {
  const { value, start, end } = e;
  const n = marker.length;
  const selected = value.slice(start, end);
  if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= n * 2) {
    const inner = selected.slice(n, -n);
    return { value: value.slice(0, start) + inner + value.slice(end), start, end: start + inner.length };
  }
  if (value.slice(start - n, start) === marker && value.slice(end, end + n) === marker) {
    return { value: value.slice(0, start - n) + selected + value.slice(end + n), start: start - n, end: end - n };
  }
  return { value: value.slice(0, start) + marker + selected + marker + value.slice(end), start: start + n, end: end + n };
}

/** The whole lines the selection touches. */
function lineSpan(value: string, start: number, end: number): [number, number] {
  const from = value.lastIndexOf('\n', start - 1) + 1;
  const nl = value.indexOf('\n', end > start && value[end - 1] === '\n' ? end - 1 : end);
  return [from, nl === -1 ? value.length : nl];
}

function mapLines(e: Edit, fn: (line: string, i: number) => string): Edit {
  const [from, to] = lineSpan(e.value, e.start, e.end);
  const lines = e.value.slice(from, to).split('\n');
  const changed = lines.map(fn).join('\n');
  const value = e.value.slice(0, from) + changed + e.value.slice(to);
  // One line: keep the cursor where it was, moved by what was added in front.
  if (lines.length === 1) {
    const shift = changed.length - lines[0]!.length;
    return { value, start: Math.max(from, e.start + shift), end: Math.max(from, e.end + shift) };
  }
  return { value, start: from, end: from + changed.length };
}

export function indent(e: Edit): Edit {
  return mapLines(e, (line) => `  ${line}`);
}

export function outdent(e: Edit): Edit {
  return mapLines(e, (line) => line.replace(/^( {1,2}|\t)/, ''));
}

const LIST = /^(\s*)(?:[-*•]\s+\[[ xX]\]\s+|[-*•]\s+|\d+[.)]\s+)/;

/** Turns the selected lines into a list of one kind, or back into plain lines if they already are one. */
export function toggleList(e: Edit, kind: 'bullet' | 'number' | 'check'): Edit {
  const [from, to] = lineSpan(e.value, e.start, e.end);
  const lines = e.value.slice(from, to).split('\n');
  const is = (line: string) =>
    kind === 'check' ? /^\s*[-*]\s+\[[ xX]\]\s/.test(line) : kind === 'bullet' ? /^\s*[-*•]\s+(?!\[[ xX]\])/.test(line) : /^\s*\d+[.)]\s/.test(line);
  const all = lines.filter((l) => l.trim()).every(is);
  let n = 0;
  const marker = (i: number) => (kind === 'bullet' ? '- ' : kind === 'check' ? '- [ ] ' : `${i}. `);
  // On an empty line: start a list there, ready to type into.
  if (lines.length === 1 && !lines[0]!.trim()) return mapLines(e, (line) => line + marker(1));
  return mapLines(e, (line) => {
    if (!line.trim()) return line;
    const [, lead = ''] = /^(\s*)/.exec(line)!;
    const bare = line.replace(LIST, '$1').slice(lead.length);
    if (all) return lead + bare;
    n++;
    return lead + marker(n) + bare;
  });
}

export function toggleHeading(e: Edit): Edit {
  return mapLines(e, (line) => (/^\s*#{1,3}\s/.test(line) ? line.replace(/^(\s*)#{1,3}\s+/, '$1') : `## ${line.trimStart()}`));
}

/**
 * Enter at the end of a list item starts the next one (numbered lists count
 * on); Enter on an empty item ends the list. Null when Enter should just be
 * a new line.
 */
export function continueList(e: Edit): Edit | null {
  if (e.start !== e.end) return null;
  const from = e.value.lastIndexOf('\n', e.start - 1) + 1;
  const line = e.value.slice(from, e.start);
  const m = /^(\s*)([-*•]\s+\[[ xX]\]\s+|[-*•]\s+|(\d+)([.)])\s+)(.*)$/.exec(line);
  if (!m) return null;
  if (!m[5]!.trim()) {
    // An empty item: Enter ends the list.
    const value = e.value.slice(0, from) + e.value.slice(e.start);
    return { value, start: from, end: from };
  }
  const next = m[3] ? `${Number(m[3]) + 1}${m[4]} ` : /\[[ xX]\]/.test(m[2]!) ? '- [ ] ' : m[2]!;
  const insert = `\n${m[1]}${next}`;
  const value = e.value.slice(0, e.start) + insert + e.value.slice(e.end);
  return { value, start: e.start + insert.length, end: e.start + insert.length };
}
