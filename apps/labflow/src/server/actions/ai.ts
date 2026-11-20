'use server';

import { revalidatePath } from 'next/cache';
import { requireSession, NotFoundInWorkspaceError } from '../authz';
import { AiNotConfiguredError, AiRequestError } from '../ai/client';
import {
  AiOutputError,
  analyseExperiment,
  askProject,
  type ExperimentAnalysis,
  type ProjectAnswer,
} from '../ai/analysis';
import type { Evidence } from '../ai/context';
import { catchUp } from '../ai/catch-up';
import { searchPubMed, type Article } from '@/lib/pubmed';
import { hasFeature } from '../paywall';
import { aiAccess, countAiUse, isRefusal } from '../ai/access';
import { fillRecordFromText, MAX_DESCRIPTION, type FilledRecord } from '../ai/fill-record';
import { listProtocolVersionOptions } from '../queries';
import { rateLimit } from '@/lib/rate-limit';

export type AnalysisState = {
  error?: string;
  notConfigured?: true;
  analysis?: ExperimentAnalysis;
  evidence?: Evidence[];
  model?: string;
};

export type AnswerState = {
  error?: string;
  notConfigured?: true;
  question?: string;
  answer?: ProjectAnswer;
  evidence?: Evidence[];
  retrievedCount?: number;
  totalCount?: number;
  paperCount?: number;
  savedPaperCount?: number;
  literature?: Article[];
  literatureNote?: string;
};

/** Turns every AI failure into an honest message; never a fabricated result. */
function describe(error: unknown): { error: string; notConfigured?: true } {
  if (error instanceof AiNotConfiguredError) return { error: error.message, notConfigured: true };
  if (error instanceof AiRequestError || error instanceof AiOutputError) {
    return { error: error.message };
  }
  if (error instanceof NotFoundInWorkspaceError) return { error: error.message };
  throw error;
}

export async function analyseExperimentAction(
  _prev: AnalysisState,
  formData: FormData,
): Promise<AnalysisState> {
  const session = await requireSession();
  const access = await aiAccess(session);
  if (isRefusal(access)) return { error: access.error, ...(access.notConfigured ? { notConfigured: true as const } : {}) };

  const experimentId = String(formData.get('experimentId') ?? '');
  try {
    const { analysis, evidence, model } = await analyseExperiment(session, experimentId, undefined, access.apiKey);
    await countAiUse(session, 'analysis', access);
    revalidatePath(`/experiments/${experimentId}/analysis`);
    return { analysis, evidence, model };
  } catch (error) {
    return describe(error);
  }
}

export async function askProjectAction(
  _prev: AnswerState,
  formData: FormData,
): Promise<AnswerState> {
  const session = await requireSession();
  const access = await aiAccess(session);
  if (isRefusal(access)) return { error: access.error, ...(access.notConfigured ? { notConfigured: true as const } : {}) };

  const projectId = String(formData.get('projectId') ?? '');
  const question = String(formData.get('question') ?? '').trim();
  if (question.length < 4) return { error: 'Ask a question of at least a few words.' };

  // Literature is best-effort: PubMed being unreachable must not block an
  // answer grounded in the lab's own records.
  let papers: Article[] = [];
  let literatureNote: string | undefined;
  // PubMed grounding is a paid feature. Silently ignoring the checkbox would
  // be worse than refusing it: the answer would quietly lose a source the user
  // asked for. Say so instead.
  const wantsLiterature = formData.get('includeLiterature') === '1';
  const literatureAllowed = wantsLiterature && (await hasFeature(session, 'pubmed'));
  if (wantsLiterature && !literatureAllowed) {
    literatureNote =
      'PubMed grounding is not on your current plan, so this answer uses your own records only.';
  }
  if (literatureAllowed) {
    try {
      papers = await searchPubMed(question, { limit: 6 });
      if (papers.length === 0) literatureNote = 'PubMed returned no matching papers for this question.';
    } catch {
      literatureNote = 'PubMed could not be reached, so the answer uses your records only.';
    }
  }

  try {
    const result = await askProject(session, projectId, question, undefined, papers, access.apiKey);
    await countAiUse(session, 'project_answer', access);
    revalidatePath(`/projects/${projectId}/assistant`);
    return {
      question,
      answer: result.answer,
      evidence: result.evidence,
      literature: result.literature,
      literatureNote,
      retrievedCount: result.retrievedCount,
      totalCount: result.totalCount,
      paperCount: result.paperCount,
      savedPaperCount: result.savedPaperCount,
    };
  } catch (error) {
    return { question, literatureNote, ...describe(error) };
  }
}

export type CatchUpState = { error?: string; notConfigured?: true; briefing?: string };

/** "Catch me up": a plain-language briefing on the lab for someone new. */
export async function catchUpAction(_prev: CatchUpState, _formData: FormData): Promise<CatchUpState> {
  const session = await requireSession();
  const access = await aiAccess(session);
  if (isRefusal(access)) return { error: access.error, ...(access.notConfigured ? { notConfigured: true as const } : {}) };
  try {
    const briefing = await catchUp(session, undefined, access.apiKey);
    await countAiUse(session, 'catch_up', access);
    return { briefing };
  } catch (error) {
    return describe(error);
  }
}

export type FillState = {
  error?: string;
  notConfigured?: true;
  record?: FilledRecord;
};

/**
 * Fills the experiment form from the researcher's own description. Returns
 * fields for the form to show; it saves nothing, so a person checks every
 * value before it becomes part of the record.
 */
export async function fillRecordAction(input: { text: string; today: string }): Promise<FillState> {
  const session = await requireSession();
  const access = await aiAccess(session);
  if (isRefusal(access)) return { error: access.error, ...(access.notConfigured ? { notConfigured: true as const } : {}) };
  const text = String(input.text ?? '').trim();
  if (text.length < 10) return { error: 'Write a sentence or two about what you did first.' };
  if (text.length > MAX_DESCRIPTION) {
    return { error: `That is longer than ${MAX_DESCRIPTION.toLocaleString()} characters. Put the long parts in a file instead.` };
  }
  const limit = rateLimit(`fill-record:${session.userId}`, { limit: 10, windowMs: 60_000 });
  if (!limit.ok) return { error: `Too many in a row. Try again in ${limit.retryAfterSec} seconds.` };
  const today = /^\d{4}-\d{2}-\d{2}$/.test(input.today) ? input.today : new Date().toISOString().slice(0, 10);
  try {
    const protocols = await listProtocolVersionOptions(session);
    const record = await fillRecordFromText({ text, today, protocols, apiKey: access.apiKey });
    await countAiUse(session, 'fill_record', access);
    return { record };
  } catch (error) {
    return describe(error);
  }
}
