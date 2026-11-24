import { experimentCode } from './display';

/**
 * Experiment numbers in a message ("EXP-002", "exp-2") turned into links to
 * the run, so a conversation points straight at the record it is about.
 *
 * Numbers restart in every project. In a project's channel a number means
 * that project's run; anywhere else it links only when one run in the lab
 * has it, and otherwise opens search rather than guessing.
 */

export type RecordRef = { id: string; number: number; title: string; projectId: string };
export type Segment = { text: string; href?: string; title?: string };

const CODE = /\bEXP-?0*(\d{1,6})\b/gi;

export function linkRecords(text: string, experiments: RecordRef[], projectId: string | null): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(CODE)) {
    const n = Number(match[1]);
    const candidates = experiments.filter((e) => e.number === n);
    const here = projectId ? candidates.filter((e) => e.projectId === projectId) : candidates;
    const one = here.length === 1 ? here[0] : !projectId && candidates.length === 1 ? candidates[0] : undefined;
    if (!one && candidates.length === 0) continue;
    if (match.index > last) segments.push({ text: text.slice(last, match.index) });
    segments.push(
      one
        ? { text: match[0], href: `/experiments/${one.id}`, title: `${experimentCode(one.number)}: ${one.title}` }
        : { text: match[0], href: `/search?q=${encodeURIComponent(experimentCode(n))}`, title: 'More than one run has this number' },
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
}
