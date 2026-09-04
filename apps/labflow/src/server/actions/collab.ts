'use server';

import { revalidatePath } from 'next/cache';
import { InvalidLinkError, parseLink } from '@/lib/links';
import { PubMedError, searchPubMed, type Article } from '@/lib/pubmed';
import { requireSession } from '../authz';
import { NotFoundInWorkspaceError } from '../not-found';
import * as q from '../queries';
import type { ActionState } from './types';

export type LiteratureState = {
  error?: string;
  query?: string;
  articles?: Article[];
};

/* ── discussion ─────────────────────────────────────────────────────────── */

export async function postMessageAction(formData: FormData) {
  const session = await requireSession();
  const body = String(formData.get('body') ?? '').trim();
  if (body === '') return;

  const experimentId = String(formData.get('experimentId') ?? '') || undefined;
  const projectId = String(formData.get('projectId') ?? '') || undefined;
  const parentId = String(formData.get('parentId') ?? '') || null;

  await q.postMessage(session, {
    experimentId,
    projectId,
    parentId,
    body: body.slice(0, 10000),
  });
  revalidatePath(experimentId ? `/experiments/${experimentId}` : `/projects/${projectId}/discussion`);
}

export async function deleteMessageAction(formData: FormData) {
  const session = await requireSession();
  try {
    await q.deleteMessage(session, String(formData.get('messageId') ?? ''));
  } catch (error) {
    // Deleting someone else's message simply does nothing.
    if (!(error instanceof NotFoundInWorkspaceError)) throw error;
  }
  revalidatePath(String(formData.get('returnTo') ?? '/dashboard'));
}

/* ── link attachments ───────────────────────────────────────────────────── */

export async function attachLinkAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSession();
  const experimentId = String(formData.get('experimentId') ?? '');
  const raw = String(formData.get('url') ?? '');
  const label = String(formData.get('label') ?? '').trim();

  let info;
  try {
    info = parseLink(raw);
  } catch (error) {
    if (error instanceof InvalidLinkError) return { fieldErrors: { url: error.message } };
    throw error;
  }

  try {
    const fileId = await q.recordLink(session, {
      filename: label || info.suggestedName,
      sourceUrl: info.url,
      provider: info.provider,
    });
    await q.attachFileToExperiment(session, experimentId, fileId);
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true, message: 'Link attached.' };
}

/* ── literature ─────────────────────────────────────────────────────────── */

export async function searchLiteratureAction(
  _prev: LiteratureState,
  formData: FormData,
): Promise<LiteratureState> {
  await requireSession();
  const query = String(formData.get('query') ?? '').trim();
  if (query.length < 3) return { error: 'Enter at least three characters.', query };

  try {
    return { query, articles: await searchPubMed(query, { limit: 10 }) };
  } catch (error) {
    if (error instanceof PubMedError) return { query, error: error.message };
    return {
      query,
      error: 'Could not reach PubMed. Nothing was returned — no citations are invented when it is unavailable.',
    };
  }
}

export async function saveLiteratureAction(formData: FormData) {
  const session = await requireSession();
  const projectId = String(formData.get('projectId') ?? '');
  await q.saveLiterature(session, projectId, {
    pmid: String(formData.get('pmid') ?? ''),
    title: String(formData.get('title') ?? ''),
    journal: String(formData.get('journal') ?? '') || null,
    year: String(formData.get('year') ?? '') || null,
    authors: String(formData.get('authors') ?? '') || null,
  });
  revalidatePath(`/projects/${projectId}/literature`);
}

export async function removeLiteratureAction(formData: FormData) {
  const session = await requireSession();
  await q.removeLiterature(session, String(formData.get('refId') ?? ''));
  revalidatePath(`/projects/${String(formData.get('projectId') ?? '')}/literature`);
}
