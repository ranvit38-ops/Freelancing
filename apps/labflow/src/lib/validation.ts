import { z } from 'zod';

/*
 * Schemas intentionally strip unknown keys rather than rejecting them: a form
 * submission also carries routing fields the action reads itself (projectId,
 * experimentId) and Next's own internals. Each action picks the fields it
 * writes explicitly, so nothing unvalidated reaches the database.
 */

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .default(null);

export const signupSchema = z
  .object({
    name: trimmed(120).min(1, 'Your name is required'),
    email: z.string().trim().email('Enter a valid email address'),
    password: z.string().min(10, 'Use at least 10 characters'),
    workspaceName: trimmed(120).min(1, 'Name your lab or research group'),
    institution: optionalText(160),
  });

export const loginSchema = z
  .object({
    email: z.string().trim().email('Enter a valid email address'),
    password: z.string().min(1, 'Enter your password'),
  });

export const projectSchema = z
  .object({
    name: trimmed(160).min(1, 'Give the project a name'),
    description: optionalText(4000),
    researchQuestion: optionalText(2000),
    status: z.enum(['planning', 'active', 'on_hold', 'completed', 'archived']).default('active'),
    tags: z
      .string()
      .trim()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 12),
      ),
  });

/**
 * Only the title is required. The whole point of the create screen is that a
 * researcher can capture an experiment in seconds and fill in the rest later —
 * the completeness check (lib/completeness.ts) is what nags them, not the form.
 */
export const experimentSchema = z
  .object({
    title: trimmed(200).min(1, 'Give the experiment a name'),
    performedOn: z
      .string()
      .trim()
      .default('')
      .refine((v) => v === '' || !Number.isNaN(Date.parse(v)), 'Enter a valid date')
      .transform((v) => (v === '' ? null : new Date(v))),
    objective: optionalText(4000),
    hypothesis: optionalText(4000),
    status: z
      .enum(['planned', 'in_progress', 'completed', 'repeated', 'needs_investigation'])
      .default('planned'),
    protocolVersionId: z.string().uuid().nullable().catch(null).default(null),
    protocolNotes: optionalText(4000),
    repeatsExperimentId: z.string().uuid().nullable().catch(null).default(null),
    notes: optionalText(20000),
    summary: optionalText(4000),
    observations: optionalText(8000),
    conclusion: optionalText(4000),
    nextSteps: optionalText(4000),
    /** Parallel arrays straight from the repeatable condition rows. */
    conditionName: z.array(z.string()).default([]),
    conditionValue: z.array(z.string()).default([]),
    conditionUnit: z.array(z.string()).default([]),
    /** Comma/newline separated sample codes; created on demand. */
    sampleCodes: z.string().trim().default(''),
  });

export const sampleSchema = z
  .object({
    code: trimmed(64).min(1, 'A sample needs an ID'),
    description: optionalText(2000),
    notes: optionalText(4000),
    projectId: z.string().uuid().nullable().catch(null).default(null),
    parentSampleId: z.string().uuid().nullable().catch(null).default(null),
  });

export const protocolSchema = z
  .object({
    name: trimmed(160).min(1, 'Give the protocol a name'),
    description: optionalText(2000),
    projectId: z.string().uuid().nullable().catch(null).default(null),
    body: optionalText(20000),
    changeNote: optionalText(2000),
  });

export const protocolVersionSchema = z
  .object({
    body: optionalText(20000),
    changeNote: trimmed(2000).min(1, 'Describe what changed in this version'),
  });

export type ExperimentInput = z.infer<typeof experimentSchema>;
export type ProjectInput = z.infer<typeof projectSchema>;

/** Splits pasted sample codes on commas, whitespace or newlines. */
export function parseSampleCodes(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ).slice(0, 200);
}

/** Zips the repeatable condition rows, dropping rows the user left blank. */
export function zipConditions(input: {
  conditionName: string[];
  conditionValue: string[];
  conditionUnit: string[];
}): { name: string; value: string; unit: string | null }[] {
  return input.conditionName
    .map((name, i) => ({
      name: name.trim(),
      value: (input.conditionValue[i] ?? '').trim(),
      unit: (input.conditionUnit[i] ?? '').trim() || null,
    }))
    .filter((c) => c.name !== '' && c.value !== '')
    .slice(0, 100);
}
