import { z } from 'zod';

/**
 * Fail loud and early on misconfiguration rather than at the first request.
 * Optional integrations are validated only when the feature is used, so the
 * app builds and runs with nothing but a database URL.
 */
const schema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL must be a postgres connection URL'),
  SESSION_COOKIE_NAME: z.string().default('labflow_session'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Local disk today; swap the storage adapter for S3/Supabase later. */
  UPLOAD_DIR: z.string().default('.uploads'),
  ANTHROPIC_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  NCBI_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().optional(),
  LABFLOW_AI_MODEL: z.string().default('claude-sonnet-5'),
});

let cached: z.infer<typeof schema> | null = null;

export function env() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration — ${detail}`);
  }
  cached = parsed.data;
  return cached;
}

/** True when AI features can actually run. Never fake a response without it. */
export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
