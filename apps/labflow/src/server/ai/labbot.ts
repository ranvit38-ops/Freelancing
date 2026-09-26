import type Anthropic from '@anthropic-ai/sdk';
import { experimentCode } from '@/lib/display';
import { dmParticipants } from '@/lib/dm';
import { pickRelevant, questionTerms, relevance } from '@/lib/relevance';
import type { SessionContext } from '../auth';
import * as q from '../queries';
import { getFile } from '../storage';
import { renderRecord } from './context';
import { canExtractText, fileText } from './file-text';

/**
 * LabBot's view of the lab: everything the person asking is allowed to see.
 *
 * Experiments, tasks, the calendar, chat (the lab channel, project and task
 * threads, and their own direct messages, never anyone else's), and the
 * contents of the files they can open. Private files and other people's DMs
 * never reach the model on their behalf, because every read below goes
 * through the same visibility rules as the pages they would open by hand.
 *
 * Too much for one question, so each part is ranked against the question and
 * trimmed. What matched goes in whole; the rest goes in as a line.
 */

export const LABBOT_RULES = `You are LabBot, the assistant inside Labvia, a workspace for an academic research lab. Lab members ask you about their lab: experiments, protocols, files, chat, tasks, deadlines, meetings and who does what. Talk to them the way a sharp, friendly colleague would in a chat.

How to answer:
- Answer the question that was asked, directly, in a natural conversational tone. Lead with the answer.
- Match the length to the question: a sentence or two for simple questions, more only when it is needed. Use short paragraphs, and bullets or bold only when they genuinely help.
- Do not add sections like "What to do next", "Who to ask", "Suggestions" or "Sources" unless the person asks for them.
- Mention where a fact comes from naturally in the sentence, for example "In EXP-004, Ana saw...", "the gel protocol (gel-protocol.docx) says...", "Tom said in #lab on 3 Sep that...".

What you know:
- The LAB RECORDS supplied with each question are everything you know about this lab. Use them, plus general scientific knowledge when the question is a general one (explaining a technique or a term).
- Never invent results, measurements, file contents, messages, people, dates or citations. If the records do not say, say so briefly and, if it helps, where in Labvia they might look.
- Name people only as they appear in the records.`;

/** Enough to cover a busy week of lab chat without drowning the question. */
const MAX_MESSAGES_MATCHED = 40;
const MAX_MESSAGES_RECENT = 25;
const MAX_FILE_TEXTS = 6;
const MAX_TOTAL_FILE_CHARS = 36_000;
/** A PDF is read page by page, images and all, which is slow. One at most. */
const MAX_PDF_BYTES = 4 * 1024 * 1024;

function day(value: Date | string | null | undefined): string {
  if (!value) return 'no date';
  const d = typeof value === 'string' ? new Date(`${value.slice(0, 10)}T12:00:00Z`) : value;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function isoDay(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

export type LabContext = {
  text: string;
  pdfs: { name: string; data: string }[];
  sources: string[];
};

export async function buildLabContext(s: SessionContext, question: string): Promise<LabContext> {
  const terms = questionTerms(question);

  const [projects, experiments, protocols, updates, members, files, tasks, calendar, messages] =
    await Promise.all([
      q.listProjects(s),
      q.listExperiments(s, { limit: 200 }),
      q.listProtocols(s),
      q.listResearchUpdates(s),
      q.listWorkspaceMembers(s),
      q.listFiles(s),
      q.listTasks(s),
      q.listCalendar(s, isoDay(-30), isoDay(90)),
      q.messagesVisibleTo(s, 400),
    ]);

  const nameOf = new Map(members.map((m) => [m.id, m.name ?? m.email]));
  const lines: string[] = [
    `LAB: ${s.workspaceName}`,
    `TODAY: ${day(new Date())}`,
    `ASKED BY: ${s.userName}`,
    '',
    'PEOPLE',
    ...members.map((m) => `- ${m.name ?? m.email} (${m.role})`),
  ];
  const sources: string[] = [];

  lines.push('', 'PROJECTS');
  for (const p of projects) {
    lines.push(
      `- ${p.name}${p.isExample ? ' (worked example, not real lab work)' : ''} | ${p.status}` +
        `${p.researchQuestion ? ` | question: ${p.researchQuestion.slice(0, 300)}` : ''}` +
        `${p.description ? ` | ${p.description.slice(0, 300)}` : ''}`,
    );
  }

  // Every experiment as a line, the ones the question is about in full.
  const experimentText = (e: (typeof experiments)[number]) =>
    `${experimentCode(e.number)} ${e.title} ${e.objective ?? ''} ${e.protocolName ?? ''} ${e.researcherName ?? ''}`;
  lines.push('', `EXPERIMENTS (${experiments.length}, newest first)`);
  for (const e of experiments.slice(0, 120)) {
    const project = projects.find((p) => p.id === e.projectId)?.name;
    lines.push(
      `- ${experimentCode(e.number)} ${e.title} | ${e.status} | ${day(e.performedOn)} | by ${e.researcherName ?? 'unknown'}` +
        `${project ? ` | project ${project}` : ''}`,
    );
  }
  const matchedExperiments = experiments.filter((e) => relevance(terms, experimentText(e)) > 0);
  const detailed = (matchedExperiments.length > 0 ? pickRelevant(matchedExperiments, terms, experimentText, 5) : experiments.slice(0, 3));
  const records = await Promise.all(detailed.map((e) => q.getExperimentRecord(s, e.id)));
  if (records.length > 0) {
    lines.push('', 'EXPERIMENT RECORDS IN FULL');
    for (const r of records) {
      lines.push('', renderRecord(r, { full: true }));
      sources.push(`${experimentCode(r.experiment.number)}: ${r.experiment.title}`);
    }
  }

  if (protocols.length > 0) {
    lines.push('', 'PROTOCOLS');
    for (const p of protocols.slice(0, 40)) lines.push(`- ${p.name}${p.description ? `: ${p.description.slice(0, 200)}` : ''}`);
  }
  if (updates.length > 0) {
    lines.push('', 'RESEARCH UPDATES');
    for (const u of updates.slice(0, 10)) lines.push(`- ${u.title} (${u.status}, ${u.projectName ?? 'no project'}, ${day(u.updatedAt)})`);
  }

  // Tasks: everything still open, and what was finished lately.
  const open = tasks.filter((t) => t.status !== 'done');
  const done = tasks.filter((t) => t.status === 'done').slice(0, 15);
  lines.push('', `TASKS (${open.length} open)`);
  for (const t of [...open.slice(0, 80), ...done]) {
    const who = t.forEveryone ? 'everyone' : (t.assigneeName ?? 'unassigned');
    lines.push(
      `- ${t.title} | ${t.status} | for ${who} | due ${t.dueOn ? day(t.dueOn) : 'no date'}` +
        `${t.projectName ? ` | project ${t.projectName}` : ''}${t.detail ? ` | ${t.detail.slice(0, 200)}` : ''}`,
    );
  }

  lines.push('', 'CALENDAR (last 30 days to 90 days ahead)');
  if (calendar.events.length === 0) lines.push('- no events');
  for (const ev of calendar.events) {
    lines.push(`- ${ev.title} | ${day(ev.onDate)}${ev.atTime ? ` ${ev.atTime.slice(0, 5)}` : ''}${ev.notes ? ` | ${ev.notes.slice(0, 200)}` : ''}`);
  }

  // Chat: whatever mentions the question, plus the latest, oldest first so
  // the model reads a conversation in order.
  const channelOf = (m: (typeof messages)[number]) => {
    if (m.dmKey) {
      const others = (dmParticipants(m.dmKey) ?? []).filter((id) => id !== s.userId).map((id) => nameOf.get(id) ?? 'someone');
      return `DM with ${others.join(', ') || 'yourself'}`;
    }
    if (m.experimentNumber) return experimentCode(m.experimentNumber);
    if (m.taskTitle) return `task ${m.taskTitle}`;
    if (m.projectName) return `#${m.projectName}`;
    return '#lab';
  };
  const messageText = (m: (typeof messages)[number]) => `${m.body} ${m.fileName ?? ''} ${m.authorName ?? ''} ${channelOf(m)}`;
  const matchedMessages = messages.filter((m) => relevance(terms, messageText(m)) > 0);
  const chosen = new Map<string, (typeof messages)[number]>();
  for (const m of pickRelevant(matchedMessages, terms, messageText, MAX_MESSAGES_MATCHED)) chosen.set(m.id, m);
  for (const m of messages.slice(0, MAX_MESSAGES_RECENT)) chosen.set(m.id, m);
  const chat = [...chosen.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  lines.push('', `CHAT (${chat.length} of ${messages.length} messages you can see: those about the question, and the latest)`);
  for (const m of chat) {
    const body = m.body.trim() ? m.body.slice(0, 500) : '';
    lines.push(
      `- [${channelOf(m)}] ${m.authorName ?? 'someone'}, ${day(m.createdAt)}: ${body}${m.fileName ? `${body ? ' ' : ''}(shared file ${m.fileName})` : ''}`,
    );
  }

  // Files: every name, and the text of the ones the question is about.
  const unique = [...new Map(files.map((f) => [f.id, f])).values()];
  const fileLabel = (f: (typeof unique)[number]) =>
    `${f.filename} ${f.uploaderName ?? ''} ${f.experimentTitle ?? ''} ${f.projectName ?? ''}`;
  lines.push('', `FILES (${unique.length} you can open)`);
  for (const f of unique.slice(0, 150)) {
    lines.push(
      `- ${f.filename}${f.uploaderName ? ` | from ${f.uploaderName}` : ''} | ${day(f.createdAt)}` +
        `${f.experimentNumber ? ` | on ${experimentCode(f.experimentNumber)}` : ''}${f.sourceUrl ? ` | link ${f.sourceUrl}` : ''}`,
    );
  }

  const readable = unique.filter((f) => f.storageKey && canExtractText(f.filename));
  // Scored on the name first; the text is read only for the candidates, and
  // then scored again on what they actually say.
  const candidates = pickRelevant(readable, terms, fileLabel, 20);
  const withText = (
    await Promise.all(
      candidates.map(async (f) => ({ f, text: await fileText(f.storageKey!, f.filename, getFile) })),
    )
  ).filter((row): row is { f: (typeof readable)[number]; text: string } => Boolean(row.text));
  const ranked = pickRelevant(withText, terms, (row) => `${fileLabel(row.f)} ${row.text}`, MAX_FILE_TEXTS);
  let budget = MAX_TOTAL_FILE_CHARS;
  const contents: string[] = [];
  for (const { f, text } of ranked) {
    if (budget <= 0) break;
    const part = text.slice(0, budget);
    budget -= part.length;
    contents.push(`--- ${f.filename} ---\n${part}`);
    sources.push(`file: ${f.filename}`);
  }
  if (contents.length > 0) lines.push('', 'FILE CONTENTS', ...contents);

  // One PDF, when the question points at it. Read by the model directly.
  const pdfs: LabContext['pdfs'] = [];
  const pdfCandidates = unique.filter(
    (f) => f.storageKey && /\.pdf$/i.test(f.filename) && f.byteSize <= MAX_PDF_BYTES && relevance(terms, fileLabel(f)) > 0,
  );
  const pdf = pickRelevant(pdfCandidates, terms, fileLabel, 1)[0];
  if (pdf) {
    try {
      pdfs.push({ name: pdf.filename, data: (await getFile(pdf.storageKey!)).toString('base64') });
      sources.push(`file: ${pdf.filename}`);
      lines.push('', `The PDF ${pdf.filename} is attached in full.`);
    } catch {
      // Lost with an old disk, most likely. The name is still listed above.
    }
  }

  return { text: lines.join('\n'), pdfs, sources };
}

export type Turn = { question: string; answer: string };

/** The request LabBot sends: earlier turns for follow-ups, then the records and the question. */
export function labbotMessages(context: LabContext, question: string, history: Turn[]): Anthropic.MessageParam[] {
  const earlier: Anthropic.MessageParam[] = history.slice(-4).flatMap((turn) => [
    { role: 'user' as const, content: turn.question },
    { role: 'assistant' as const, content: turn.answer || '(no answer)' },
  ]);
  return [
    ...earlier,
    {
      role: 'user',
      content: [
        ...context.pdfs.map((pdf) => ({
          type: 'document' as const,
          title: pdf.name,
          source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: pdf.data },
        })),
        { type: 'text' as const, text: `LAB RECORDS\n\n${context.text}\n\nQUESTION: ${question}` },
      ],
    },
  ];
}
