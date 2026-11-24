/**
 * What changed between two versions of a method, line by line.
 *
 * A plain longest-common-subsequence diff: protocols are a few hundred lines,
 * so the quadratic table is small. Past MAX_LINES a side, it gives up on
 * alignment and shows the old text removed and the new text added, which is
 * still true, just less helpful.
 */
export type DiffLine = { type: 'same' | 'add' | 'del'; text: string };
export type DiffChunk = DiffLine | { type: 'skip'; count: number };

const MAX_LINES = 1500;

function lines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').split('\n').map((l) => l.trimEnd()).filter((l, i, all) => l || (i > 0 && all[i - 1]));
}

export function lineDiff(before: string, after: string): DiffLine[] {
  const a = lines(before);
  const b = lines(after);
  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    return [...a.map((text) => ({ type: 'del' as const, text })), ...b.map((text) => ({ type: 'add' as const, text }))];
  }
  // lcs[i][j]: length of the common subsequence of a[i..] and b[j..].
  const lcs = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ type: 'del', text: a[i++]! });
    } else {
      out.push({ type: 'add', text: b[j++]! });
    }
  }
  while (i < a.length) out.push({ type: 'del', text: a[i++]! });
  while (j < b.length) out.push({ type: 'add', text: b[j++]! });
  return out;
}

/** Keeps a little context around each change and folds the long unchanged stretches. */
export function foldDiff(diff: DiffLine[], context = 2): DiffChunk[] {
  const keep = diff.map((d) => d.type !== 'same');
  const near = diff.map((_, k) => keep.slice(Math.max(0, k - context), k + context + 1).some(Boolean));
  const out: DiffChunk[] = [];
  let skipped = 0;
  diff.forEach((d, k) => {
    if (near[k]) {
      if (skipped) out.push({ type: 'skip', count: skipped });
      skipped = 0;
      out.push(d);
    } else skipped++;
  });
  if (skipped) out.push({ type: 'skip', count: skipped });
  return out;
}

export function diffCounts(diff: DiffLine[]): { added: number; removed: number } {
  return { added: diff.filter((d) => d.type === 'add').length, removed: diff.filter((d) => d.type === 'del').length };
}
