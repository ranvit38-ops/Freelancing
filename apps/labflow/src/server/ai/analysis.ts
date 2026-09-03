import { z } from 'zod';
import { db } from '@/db';
import { aiGenerations } from '@/db/schema';
import type { SessionContext } from '../auth';
import { callModel, extractJson } from './client';
import { buildExperimentContext, buildProjectContext } from './context';
import { ANALYSIS_PROMPT_SCHEMA, ANSWER_PROMPT_SCHEMA, GROUND_RULES } from './prompts';

const stringList = z.array(z.string().min(1)).max(12).default([]);

const analysisSchema = z.object({
  summary: z.string().min(1),
  observations: stringList,
  possibleIssues: stringList,
  missingInformation: stringList,
  comparison: z.string().default(''),
  suggestedQuestions: stringList,
});

export type ExperimentAnalysis = z.infer<typeof analysisSchema>;

const answerSchema = z.object({
  answer: z.string().min(1),
  observations: stringList,
  uncertainties: stringList,
  usedExperiments: stringList,
});

export type ProjectAnswer = z.infer<typeof answerSchema>;

export class AiOutputError extends Error {}

/**
 * Analyses one experiment against its own record and its project siblings.
 * The result is stored with the evidence it was given, so it can be audited.
 */
export async function analyseExperiment(s: SessionContext, experimentId: string) {
  const { record, context, evidence } = await buildExperimentContext(s, experimentId);

  const prompt = [
    'Analyse the experiment below for the researcher who ran it.',
    '',
    context,
    '',
    `Respond with JSON in exactly this shape:\n${ANALYSIS_PROMPT_SCHEMA}`,
  ].join('\n');

  const { text, model } = await callModel({ system: GROUND_RULES, prompt, maxTokens: 2048 });
  const parsed = analysisSchema.safeParse(extractJson(text));
  if (!parsed.success) {
    throw new AiOutputError('The model returned an analysis in an unexpected shape. Nothing was saved.');
  }

  await db.insert(aiGenerations).values({
    workspaceId: s.workspaceId,
    projectId: record.experiment.projectId,
    experimentId,
    kind: 'experiment_analysis',
    prompt,
    output: parsed.data,
    evidence,
    model,
    createdById: s.userId,
  });

  return { analysis: parsed.data, evidence, model };
}

/** Answers a question about a project, citing the records it was shown. */
export async function askProject(s: SessionContext, projectId: string, question: string) {
  const { context, evidence, retrievedCount, totalCount } = await buildProjectContext(
    s,
    projectId,
    question,
  );

  const prompt = [
    `The researcher asks: ${question}`,
    '',
    `You have been given ${retrievedCount} of the ${totalCount} experiment records in this project.`,
    'If the answer would require records you were not given, say so.',
    '',
    context,
    '',
    `Respond with JSON in exactly this shape:\n${ANSWER_PROMPT_SCHEMA}`,
  ].join('\n');

  const { text, model } = await callModel({ system: GROUND_RULES, prompt, maxTokens: 2048 });
  const parsed = answerSchema.safeParse(extractJson(text));
  if (!parsed.success) {
    throw new AiOutputError('The model returned an answer in an unexpected shape. Nothing was saved.');
  }

  // Only cite records that were actually supplied.
  const cited = evidence.filter((e) =>
    parsed.data.usedExperiments.some((code) => e.label.startsWith(code.trim())),
  );

  await db.insert(aiGenerations).values({
    workspaceId: s.workspaceId,
    projectId,
    kind: 'project_answer',
    prompt: question,
    output: parsed.data,
    evidence: cited.length > 0 ? cited : evidence,
    model,
    createdById: s.userId,
  });

  return {
    answer: parsed.data,
    evidence: cited.length > 0 ? cited : evidence,
    retrievedCount,
    totalCount,
    model,
  };
}
