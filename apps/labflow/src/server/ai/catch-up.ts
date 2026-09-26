import { experimentCode } from '@/lib/display';
import type { SessionContext } from '../auth';
import * as q from '../queries';
import { env } from '@/lib/env';
import { callModel, type ModelTransport } from './client';
import { buildLabContext } from './labbot';

/**
 * A written briefing for someone new to the lab.
 *
 * The reading path says what to open; this says, in plain language, what it
 * all adds up to: what the lab studies, the terms a newcomer will trip on,
 * what has been tried, where things stand, and who did what. It is built from
 * the same records and held to the same rule as every other answer here:
 * nothing that is not in the records.
 */
export const CATCH_UP_RULES = `You are onboarding a new member of an academic research lab inside Labvia.

Absolute rules:
- Use ONLY the records supplied below. You have no other source about this lab.
- NEVER invent results, measurements, people, dates, citations or methods.
- Where the records are thin, say so plainly instead of filling the gap.
- Refer to experiments by their code, for example EXP-004, and to people only by names in the PEOPLE list.
- Explain specialist terms the first time they appear, in one short clause, as you would to a capable first-year student. General scientific background is allowed for definitions only, never for claims about this lab's work.

Write plain text with these headings, each on its own line followed by a few short lines or bullets ("- "):
What this lab works on
Words you will hear
What has been done so far
Where things stand now
Read these first
Who to ask about what

Keep the whole briefing under 450 words. No preamble, no sign-off, no markdown symbols other than "- " bullets.`;

export async function buildCatchUpContext(s: SessionContext): Promise<string> {
  const [projects, experiments, protocols, updates, members, files] = await Promise.all([
    q.listProjects(s),
    q.listExperiments(s, { limit: 60 }),
    q.listProtocols(s),
    q.listResearchUpdates(s),
    q.listWorkspaceMembers(s),
    q.listFiles(s),
  ]);

  const lines: string[] = [`LAB: ${s.workspaceName}`, '', 'PEOPLE'];
  for (const m of members) lines.push(`- ${m.name ?? m.email} (${m.role})`);

  for (const p of projects) {
    lines.push('', `PROJECT: ${p.name}${p.isExample ? ' (worked example, not real lab work)' : ''}`);
    lines.push(`Status: ${p.status}`, `Research question: ${p.researchQuestion ?? 'not recorded'}`);
    if (p.description) lines.push(`Description: ${p.description.slice(0, 600)}`);
    const runs = experiments.filter((e) => e.projectId === p.id);
    lines.push(`Experiments (${runs.length}, newest first):`);
    for (const e of runs.slice(0, 15)) {
      lines.push(
        `- ${experimentCode(e.number)} ${e.title} | ${e.status} | ${e.performedOn ?? 'no date'} | by ${e.researcherName ?? 'unknown'}` +
          `${e.protocolName ? ` | protocol ${e.protocolName}` : ''}${e.objective ? ` | objective: ${e.objective.slice(0, 200)}` : ''}`,
      );
    }
    for (const u of updates.filter((x) => x.projectId === p.id).slice(0, 2)) lines.push(`Research update: ${u.title}`);
  }

  if (protocols.length > 0) {
    lines.push('', 'PROTOCOLS');
    for (const pr of protocols.slice(0, 20)) lines.push(`- ${pr.name}${pr.description ? `: ${pr.description.slice(0, 160)}` : ''}`);
  }

  const shared = [...new Map(files.filter((f) => !f.private).map((f) => [f.id, f])).values()];
  if (shared.length > 0) {
    lines.push('', 'SHARED FILES');
    for (const f of shared.slice(0, 30)) lines.push(`- ${f.filename}${f.uploaderName ? ` (from ${f.uploaderName})` : ''}`);
  }
  return lines.join('\n');
}

export async function catchUp(s: SessionContext, fetchImpl?: ModelTransport): Promise<string> {
  // The overview, plus what the lab actually wrote: file contents and chat,
  // read the same way LabBot reads them, so the briefing reflects the
  // protocols and conversations and not just the titles.
  const [overview, lab] = await Promise.all([
    buildCatchUpContext(s),
    buildLabContext(s, 'overview protocol background introduction methods safety results summary'),
  ]);
  const { text } = await callModel(
    {
      system: CATCH_UP_RULES,
      prompt: `RECORDS\n\n${overview}\n\nMORE FROM THE LAB (files, chat, tasks, calendar)\n\n${lab.text}\n\nWrite the briefing now.`,
      maxTokens: 4000,
      effort: 'low',
      // The fast model: a newcomer is waiting on this screen.
      model: env().LABFLOW_LABBOT_MODEL,
    },
    fetchImpl,
  );
  return text;
}
