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
  const projectId = String(formData.get('projectId') ?? '');
  const question = String(formData.get('question') ?? '').trim();
  if (question.length < 4) return { error: 'Ask a question of at least a few words.' };

  try {
    const result = await askProject(session, projectId, question);
    revalidatePath(`/projects/${projectId}/assistant`);
    return {
      question,
      answer: result.answer,
      evidence: result.evidence,
      retrievedCount: result.retrievedCount,
      totalCount: result.totalCount,
    };
  } catch (error) {
    return { question, ...describe(error) };
  }
}
