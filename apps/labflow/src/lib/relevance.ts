/**
 * Picking what to show LabBot. A lab has more records, messages and files
 * than fit in one question, so each is scored by how many of the question's
 * words it contains, and the best go in. Crude, deterministic and fast, which
 * is what a question typed into a side panel needs.
 */

const STOP = new Set(
  'the and for with that this what when where which who whom whose why how was were are is has have had did does do not but from into onto our your their there then than they them you any all can could should would will just about over under after before been being also more most some such only very what’s whats its it’s ive i’m im lab labvia labbot please tell show give me my we us of to in on at by an a or as be if so up out'.split(
    ' ',
  ),
);

export function questionTerms(question: string): string[] {
  return [
    ...new Set(
      question
        .toLowerCase()
        .split(/[^a-z0-9.+-]+/)
        .map((t) => t.replace(/^[.+-]+|[.+-]+$/g, ''))
        .filter((t) => t.length > 2 && !STOP.has(t)),
    ),
  ];
}

export function relevance(terms: string[], text: string): number {
  if (terms.length === 0) return 0;
  const haystack = text.toLowerCase();
  let score = 0;
  for (const term of terms) if (haystack.includes(term)) score += 1;
  return score;
}

/**
 * The best `limit` items by score, most recent first among equals. Items that
 * match nothing still fill the list when there is room, newest first, so a
 * vague question ("what's been happening?") gets the latest activity.
 */
export function pickRelevant<T>(
  items: T[],
  terms: string[],
  textOf: (item: T) => string,
  limit: number,
): T[] {
  return items
    .map((item, index) => ({ item, index, score: relevance(terms, textOf(item)) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((row) => row.item);
}
