'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSession, NotFoundInWorkspaceError } from '../authz';
import { AiNotConfiguredError, AiRequestError } from '../ai/client';
import { aiAccess, countAiUse, isRefusal } from '../ai/access';
import { planFromText, type Plan } from '../ai/assistant';
import { MAX_DESCRIPTION } from '../ai/fill-record';
import { MAX_PHOTOS } from '@/lib/labbot-photos';
import { blockedReason } from '../paywall';
import * as q from '../queries';
import { rateLimit } from '@/lib/rate-limit';
import { experimentCode, pluralise } from '@/lib/display';
import { normaliseSampleCode } from '@/lib/normalise';

/**
 * LabBot's "Fill in for me". planAction asks the model and returns proposals
 * only; each save below is a separate press of a button, re-checked here as
 * any form post is, because what arrives from the browser can be anything.
 */

export type PlanState = {
  plan?: Plan;
  /** For the project pickers on the cards. */
  projects?: { id: string; name: string }[];
  /** "EXP-002: title" for every run a note in the plan points at. */
  labels?: Record<string, string>;
  error?: string;
  notConfigured?: true;
};
export type SaveResult = { ok: true; message: string; href?: string } | { ok: false; error: string };

/** Up to three photos, already shrunk in the browser (labbot-photos). */
const photosInput = z
  .array(
    z.object({
      mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
      // About 3 MB of picture; a shrunk phone photo is a tenth of that.
      data: z.string().max(4_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
    }),
  )
  .max(MAX_PHOTOS);

export async function planAction(input: { text: string; today: string; images?: unknown }): Promise<PlanState> {
  const session = await requireSession();
  const access = await aiAccess(session);
  if (isRefusal(access)) return { error: access.error, ...(access.notConfigured ? { notConfigured: true as const } : {}) };
  const text = String(input.text ?? '').trim();
  const photos = photosInput.safeParse(input.images ?? []);
  if (!photos.success) {
    return { error: `Those photos could not be read. Attach up to ${MAX_PHOTOS} pictures (JPEG, PNG or WebP).` };
  }
  const images = photos.data;
  if (!images.length && text.length < 10) {
    return { error: 'Say a sentence or two about what you did or what needs doing, or attach a photo of your notes.' };
  }
  if (text.length > MAX_DESCRIPTION) {
    return { error: `That is longer than ${MAX_DESCRIPTION.toLocaleString()} characters. Put the long parts in a file instead.` };
  }
  const limit = rateLimit(`labbot-fill:${session.userId}`, { limit: 10, windowMs: 60_000 });
  if (!limit.ok) return { error: `Too many in a row. Try again in ${limit.retryAfterSec} seconds.` };
  const today = /^\d{4}-\d{2}-\d{2}$/.test(input.today) ? input.today : new Date().toISOString().slice(0, 10);
  try {
    const [projects, experiments, protocols] = await Promise.all([
      q.listProjects(session),
      q.listExperiments(session),
      q.listProtocolVersionOptions(session),
    ]);
    const plan = await planFromText({
      text,
      today,
      projects: projects.map((p) => ({ id: p.id, name: p.name })),
      experiments: experiments.map((e) => ({
        id: e.id,
        code: experimentCode(e.number),
        title: e.title,
        projectName: e.projectName,
      })),
      protocols,
      apiKey: access.apiKey,
      images,
    });
    await countAiUse(session, 'labbot_fill', access);
    const named = new Set(plan.notes.map((n) => n.experimentId));
    const labels = Object.fromEntries(
      experiments.filter((e) => named.has(e.id)).map((e) => [e.id, `${experimentCode(e.number)}: ${e.title}`]),
    );
    return { plan, projects: projects.map((p) => ({ id: p.id, name: p.name })), labels };
  } catch (error) {
    if (error instanceof AiNotConfiguredError) return { error: error.message, notConfigured: true };
    if (error instanceof AiRequestError) return { error: error.message };
    throw error;
  }
}

async function guarded(save: () => Promise<SaveResult>): Promise<SaveResult> {
  try {
    return await save();
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) return { ok: false, error: 'That record is not in this lab any more.' };
    throw error;
  }
}

const noteInput = z.object({ experimentId: z.string().uuid(), body: z.string().trim().min(1).max(4000) });

export async function saveNoteAction(input: unknown): Promise<SaveResult> {
  const session = await requireSession();
  const blocked = await blockedReason(session);
  if (blocked) return { ok: false, error: blocked };
  const parsed = noteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'The note is empty or too long.' };
  return guarded(async () => {
    const experiment = await q.getExperiment(session, parsed.data.experimentId);
    await q.addNote(session, experiment.id, parsed.data.body);
    revalidatePath(`/experiments/${experiment.id}`);
    return { ok: true, message: `Added to ${experimentCode(experiment.number)}.`, href: `/experiments/${experiment.id}` };
  });
}

const tasksInput = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        dueOn: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
      }),
    )
    .min(1)
    .max(20),
});

export async function saveTasksAction(input: unknown): Promise<SaveResult> {
  const session = await requireSession();
  const blocked = await blockedReason(session);
  if (blocked) return { ok: false, error: blocked };
  const parsed = tasksInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Those tasks could not be read. Try again.' };
  for (const task of parsed.data.tasks) {
    await q.createTask(session, {
      title: task.title,
      detail: null,
      assignedTo: null,
      projectId: null,
      dueOn: task.dueOn || null,
    });
  }
  revalidatePath('/tasks');
  revalidatePath('/dashboard');
  return { ok: true, message: `Added ${pluralise(parsed.data.tasks.length, 'task')}.`, href: '/tasks' };
}

const eventsInput = z.object({
  events: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        atTime: z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d)?$/),
        notes: z.string().trim().max(2000),
      }),
    )
    .min(1)
    .max(20),
});

/** LabBot's calendar cards: each becomes a lab event on its day. */
export async function saveEventsAction(input: unknown): Promise<SaveResult> {
  const session = await requireSession();
  const blocked = await blockedReason(session);
  if (blocked) return { ok: false, error: blocked };
  const parsed = eventsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Every event needs a name and a day.' };
  for (const e of parsed.data.events) {
    await q.createEvent(session, { title: e.title, onDate: e.onDate, atTime: e.atTime || null, notes: e.notes || null });
  }
  revalidatePath('/calendar');
  revalidatePath('/dashboard');
  const first = parsed.data.events[0]!.onDate;
  return {
    ok: true,
    message: `Added ${pluralise(parsed.data.events.length, 'event')} to the calendar.`,
    href: `/calendar?m=${first.slice(0, 7)}&d=${first}`,
  };
}

const samplesInput = z.object({
  codes: z.array(z.string().trim().min(1).max(64)).min(1).max(200),
  description: z.string().trim().max(2000),
  projectId: z.union([z.string().uuid(), z.literal('')]),
});

export async function saveSamplesAction(input: unknown): Promise<SaveResult> {
  const session = await requireSession();
  const blocked = await blockedReason(session);
  if (blocked) return { ok: false, error: blocked };
  const parsed = samplesInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Those sample IDs could not be read. Try again.' };
  const codes = [...new Set(parsed.data.codes.map(normaliseSampleCode))];
  return guarded(async () => {
    const { created, existing } = await q.createSamples(session, codes, {
      description: parsed.data.description || null,
      notes: null,
      projectId: parsed.data.projectId || null,
      parentSampleId: null,
    });
    revalidatePath('/samples');
    const already = existing.length ? ` ${existing.join(', ')} ${existing.length === 1 ? 'was' : 'were'} already in the lab.` : '';
    return { ok: true, message: `Created ${pluralise(created.length, 'sample')}.${already}`, href: '/samples' };
  });
}
