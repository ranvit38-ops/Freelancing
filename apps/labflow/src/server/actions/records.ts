'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { normaliseSampleCode } from '@/lib/normalise';
import {
  experimentSchema,
  parseSampleCodes,
  projectSchema,
  protocolSchema,
  protocolVersionSchema,
  sampleSchema,
  zipConditions,
} from '@/lib/validation';
import { requireSession, NotFoundInWorkspaceError } from '../authz';
import { blockedReason } from '../paywall';
import * as q from '../queries';
import { fieldErrorsFrom, formObject, type ActionState } from './types';

/** Repeatable inputs that must stay arrays even with a single row. */
const CONDITION_KEYS = ['conditionName', 'conditionValue', 'conditionUnit'] as const;

/** Turns an authorisation miss into a form error instead of a 500. */
async function guard<T>(run: () => Promise<T>): Promise<T | ActionState> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) return { error: error.message };
    throw error;
  }
}

/* ── projects ───────────────────────────────────────────────────────────── */

export async function createProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const blocked = await blockedReason(session, 'project');
  if (blocked) return { error: blocked };
  const parsed = projectSchema.safeParse(formObject(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const projectId = await q.createProject(session, parsed.data);
  revalidatePath('/projects');
  redirect(`/projects/${projectId}`);
}

export async function updateProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const blocked = await blockedReason(session);
  if (blocked) return { error: blocked };
  const projectId = String(formData.get('projectId') ?? '');
  const parsed = projectSchema.safeParse(formObject(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const result = await guard(() => q.updateProject(session, projectId, parsed.data));
  if (result && typeof result === 'object' && 'error' in result) return result;
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}

export async function deleteProjectAction(formData: FormData) {
  const session = await requireSession();
  if (await blockedReason(session)) return;
  await q.deleteProject(session, String(formData.get('projectId') ?? ''));
  revalidatePath('/projects');
  redirect('/projects');
}

/* ── experiments ────────────────────────────────────────────────────────── */

/**
 * Writes every part of an experiment record that lives in a normalised table.
 * Shared by create and edit so the two screens cannot drift apart.
 */
async function writeExperimentDetail(
  session: Awaited<ReturnType<typeof requireSession>>,
  experimentId: string,
  projectId: string,
  data: ReturnType<typeof experimentSchema.parse>,
) {
  await q.replaceConditions(session, experimentId, zipConditions(data));

  const codes = parseSampleCodes(data.sampleCodes).map(normaliseSampleCode);
  const sampleIds = await q.ensureSamples(session, codes, projectId);
  await q.setExperimentSamples(session, experimentId, sampleIds);

  await q.upsertResult(session, experimentId, {
    summary: data.summary,
    observations: data.observations,
    conclusion: data.conclusion,
    nextSteps: data.nextSteps,
  });
}

export async function createExperimentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const blocked = await blockedReason(session, 'experiment');
  if (blocked) return { error: blocked };
  const projectId = String(formData.get('projectId') ?? '');
  const parsed = experimentSchema.safeParse(formObject(formData, CONDITION_KEYS));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  let experimentId: string;
  try {
    experimentId = await q.createExperiment(session, projectId, {
      title: parsed.data.title,
      objective: parsed.data.objective,
      hypothesis: parsed.data.hypothesis,
      performedOn: parsed.data.performedOn,
      status: parsed.data.status,
      protocolVersionId: parsed.data.protocolVersionId,
      protocolNotes: parsed.data.protocolNotes,
      repeatsExperimentId: parsed.data.repeatsExperimentId,
    });
    await writeExperimentDetail(session, experimentId, projectId, parsed.data);
    if (parsed.data.notes) await q.addNote(session, experimentId, parsed.data.notes);
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/projects/${projectId}`);
  redirect(`/experiments/${experimentId}`);
}

export async function updateExperimentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const blocked = await blockedReason(session);
  if (blocked) return { error: blocked };
  const experimentId = String(formData.get('experimentId') ?? '');
  const parsed = experimentSchema.safeParse(formObject(formData, CONDITION_KEYS));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  try {
    const existing = await q.getExperiment(session, experimentId);
    await q.updateExperiment(session, experimentId, {
      title: parsed.data.title,
      objective: parsed.data.objective,
      hypothesis: parsed.data.hypothesis,
      performedOn: parsed.data.performedOn,
      status: parsed.data.status,
      protocolVersionId: parsed.data.protocolVersionId,
      protocolNotes: parsed.data.protocolNotes,
      repeatsExperimentId:
        parsed.data.repeatsExperimentId === experimentId ? null : parsed.data.repeatsExperimentId,
    });
    await writeExperimentDetail(session, experimentId, existing.projectId, parsed.data);
    if (parsed.data.notes) await q.addNote(session, experimentId, parsed.data.notes);
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/experiments/${experimentId}`);
  redirect(`/experiments/${experimentId}`);
}

export async function setExperimentStatusAction(formData: FormData) {
  const session = await requireSession();
  if (await blockedReason(session)) return;
  const experimentId = String(formData.get('experimentId') ?? '');
  const status = String(formData.get('status') ?? '');
  const parsed = experimentSchema.shape.status.safeParse(status);
  if (!parsed.success) return;
  await q.updateExperiment(session, experimentId, { status: parsed.data });
  revalidatePath(`/experiments/${experimentId}`);
}

export async function addNoteAction(formData: FormData) {
  const session = await requireSession();
  if (await blockedReason(session)) return;
  const experimentId = String(formData.get('experimentId') ?? '');
  const body = String(formData.get('body') ?? '').trim();
  if (body === '') return;
  await q.addNote(session, experimentId, body.slice(0, 20000));
  revalidatePath(`/experiments/${experimentId}`);
}

export async function deleteNoteAction(formData: FormData) {
  const session = await requireSession();
  if (await blockedReason(session)) return;
  const experimentId = String(formData.get('experimentId') ?? '');
  await q.deleteNote(session, experimentId, String(formData.get('noteId') ?? ''));
  revalidatePath(`/experiments/${experimentId}`);
}

export async function deleteExperimentAction(formData: FormData) {
  const session = await requireSession();
  if (await blockedReason(session)) return;
  const experimentId = String(formData.get('experimentId') ?? '');
  const { projectId } = await q.getExperiment(session, experimentId);
  await q.deleteExperiment(session, experimentId);
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}`);
}

/* ── samples ────────────────────────────────────────────────────────────── */

export async function createSampleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const blocked = await blockedReason(session);
  if (blocked) return { error: blocked };
  const parsed = sampleSchema.safeParse(formObject(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const sampleId = await q.createSample(session, {
    ...parsed.data,
    code: normaliseSampleCode(parsed.data.code),
  });
  revalidatePath('/samples');
  redirect(`/samples/${sampleId}`);
}

/* ── protocols ──────────────────────────────────────────────────────────── */

export async function createProtocolAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const blocked = await blockedReason(session);
  if (blocked) return { error: blocked };
  const parsed = protocolSchema.safeParse(formObject(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const protocolId = await q.createProtocol(session, {
    name: parsed.data.name,
    description: parsed.data.description,
    projectId: parsed.data.projectId,
    body: parsed.data.body,
  });
  revalidatePath('/protocols');
  redirect(`/protocols/${protocolId}`);
}

export async function addProtocolVersionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const blocked = await blockedReason(session);
  if (blocked) return { error: blocked };
  const protocolId = String(formData.get('protocolId') ?? '');
  const parsed = protocolVersionSchema.safeParse(formObject(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  const result = await guard(() =>
    q.addProtocolVersion(session, protocolId, {
      body: parsed.data.body,
      changeNote: parsed.data.changeNote,
    }),
  );
  if (result && typeof result === 'object' && 'error' in result) return result;
  revalidatePath(`/protocols/${protocolId}`);
  redirect(`/protocols/${protocolId}`);
}
