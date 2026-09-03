'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { buildUpdateDraft, defaultUpdateTitle } from '@/lib/research-update';
import { requireSession } from '../authz';
import { NotFoundInWorkspaceError } from '../not-found';
import * as q from '../queries';
import type { ActionState } from './types';

/** Builds a first draft from the selected experiments and opens it for editing. */
export async function generateUpdateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const projectId = String(formData.get('projectId') ?? '');
  const ids = formData.getAll('ids').map(String).filter(Boolean);
  if (ids.length === 0) return { error: 'Select at least one experiment to include.' };

  let updateId: string;
  try {
    const project = await q.getProject(session, projectId);
    // An update belongs to one project: drop anything selected from another,
    // so a stale or hand-edited id list cannot mix projects into one deck.
    const experiments = (await q.getComparableExperiments(session, ids)).filter(
      (e) => e.projectId === projectId,
    );
    if (experiments.length === 0) {
      return { error: 'None of the selected experiments belong to this project.' };
    }

    updateId = await q.createResearchUpdate(session, projectId, {
      title: defaultUpdateTitle(project.name, experiments),
      experimentIds: experiments.map((e) => e.id),
      sections: buildUpdateDraft(project, experiments),
    });
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) return { error: error.message };
    throw error;
  }

  revalidatePath('/updates');
  redirect(`/updates/${updateId}`);
}

export async function saveUpdateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const updateId = String(formData.get('updateId') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  if (title === '') return { fieldErrors: { title: 'Give the update a title' } };

  const headings = formData.getAll('heading').map(String);
  const bodies = formData.getAll('body').map(String);
  const sources = formData.getAll('source').map(String);
  const sections = headings.map((heading, i) => ({
    heading: heading.trim() || 'Untitled section',
    body: (bodies[i] ?? '').trim(),
    source: (['record', 'researcher', 'ai'].includes(sources[i] ?? '')
      ? sources[i]
      : 'record') as 'record' | 'researcher' | 'ai',
  }));

  try {
    await q.saveResearchUpdate(session, updateId, {
      title,
      sections,
      status: formData.get('status') === 'final' ? 'final' : 'draft',
    });
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/updates/${updateId}`);
  return { ok: true, message: 'Saved.' };
}

export async function deleteUpdateAction(formData: FormData) {
  const session = await requireSession();
  await q.deleteResearchUpdate(session, String(formData.get('updateId') ?? ''));
  revalidatePath('/updates');
  redirect('/updates');
}
