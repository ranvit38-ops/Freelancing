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
import { searchPubMed, type Article } from '@/lib/pubmed';
import { blockedReason } from '../paywall';

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
  const blocked = await blockedReason(session);
  if (blocked) return { error: blocked };

  const experimentId = String(formData.get('experimentId') ?? '');
  try {
    const { analysis, evidence, model } = await analyseExperiment(session, experimentId);
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
  const blocked = await blockedReason(session);
  if (blocked) return { error: blocked };

  const projectId = String(formData.get('projectId') ?? '');
  const question = String(formData.get('question') ?? '').trim();
  if (question.length < 4) return { error: 'Ask a question of at least a few words.' };

  // Literature is best-effort: PubMed being unreachable must not block an
  // answer grounded in the lab's own records.
  let papers: Article[] = [];
  let literatureNote: string | undefined;
  if (formData.get('includeLiterature') === '1') {
    try {
      papers = await searchPubMed(question, { limit: 6 });
      if (papers.length === 0) literatureNote = 'PubMed returned no matching papers for this question.';
    } catch {
      literatureNote = 'PubMed could not be reached, so the answer uses your records only.';
    }
  }

  try {
    const result = await askProject(session, projectId, question, undefined, papers);
    revalidatePath(`/projects/${projectId}/assistant`);
    return {
      question,
      answer: result.answer,
      evidence: result.evidence,
      literature: result.literature,
      literatureNote,
      retrievedCount: result.retrievedCount,
      totalCount: result.totalCount,
    };
  } catch (error) {
    return { question, literatureNote, ...describe(error) };
  }
}
