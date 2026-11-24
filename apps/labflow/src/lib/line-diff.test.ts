import { describe, expect, it } from 'vitest';
import { diffCounts, foldDiff, lineDiff } from './line-diff';

describe('lineDiff', () => {
  it('marks the lines that were added, removed and kept', () => {
    const d = lineDiff('Rinse 5 mL\nSpin 10 min\nStore at 4 C', 'Rinse 10 mL\nSpin 10 min\nStore at 4 C\nLabel tubes');
    expect(d).toEqual([
      { type: 'del', text: 'Rinse 5 mL' },
      { type: 'add', text: 'Rinse 10 mL' },
      { type: 'same', text: 'Spin 10 min' },
      { type: 'same', text: 'Store at 4 C' },
      { type: 'add', text: 'Label tubes' },
    ]);
    expect(diffCounts(d)).toEqual({ added: 2, removed: 1 });
  });

  it('treats the first version as all new, and an unchanged one as no change', () => {
    expect(diffCounts(lineDiff('', 'a\nb'))).toEqual({ added: 2, removed: 0 });
    expect(diffCounts(lineDiff('a\r\nb ', 'a\nb'))).toEqual({ added: 0, removed: 0 });
  });

  it('folds long unchanged stretches around the changes', () => {
    const before = Array.from({ length: 20 }, (_, i) => `step ${i}`).join('\n');
    const after = before.replace('step 10', 'step ten');
    const folded = foldDiff(lineDiff(before, after), 1);
    expect(folded[0]).toEqual({ type: 'skip', count: 9 });
    expect(folded.filter((c) => c.type !== 'skip').map((c) => ('text' in c ? c.text : ''))).toEqual(['step 9', 'step 10', 'step ten', 'step 11']);
    expect(folded.at(-1)).toEqual({ type: 'skip', count: 8 });
  });
});
