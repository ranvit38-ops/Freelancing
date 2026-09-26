import { env } from '@/lib/env';

/** Thrown when no model credentials are configured, never faked around. */
export class AiNotConfiguredError extends Error {
  constructor() {
    super(
      'AI features are not configured on this deployment. Set ANTHROPIC_API_KEY on the server to enable them.',
    );
    this.name = 'AiNotConfiguredError';
  }
}

export class AiRequestError extends Error {}

/**
 * One place that talks to the model. Everything above it passes an already
 * assembled context, no caller gets to hand the model raw database access.
 */
export type ModelTransport = typeof fetch;

/** How long anyone waits before being told the model did not answer. */
export const MODEL_TIMEOUT_MS = 60_000;

/**
 * Effort is how hard the model thinks before answering. Answering a question
 * about a lab's own records is a lookup and a summary, not a proof: at the
 * default (high) it spent most of a minute thinking and people assumed it was
 * broken. Older and smaller models reject the parameter, so it is only sent
 * to the ones that accept it.
 */
export type Effort = 'low' | 'medium' | 'high';

export function acceptsEffort(model: string): boolean {
  return !/haiku|sonnet-4-5|claude-3/.test(model);
}

export async function callModel(
  input: { system: string; prompt: string; maxTokens?: number; effort?: Effort; model?: string },
  fetchImpl: ModelTransport = fetch,
): Promise<{ text: string; model: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AiNotConfiguredError();

  const model = input.model ?? env().LABFLOW_AI_MODEL;
  const base = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
  let response: Response;
  try {
    response = await fetchImpl(`${base}/v1/messages`, {
      method: 'POST',
      // Without a limit, a stalled request leaves "Thinking…" on screen
      // forever. A clear error after a minute is better than that.
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        // Low caps truncate an analysis mid-sentence, and a truncated
        // interpretation of a result is worse than none.
        max_tokens: input.maxTokens ?? 16000,
        // No temperature. The current models reject the sampling parameters
        // outright with a 400, and asking for temperature 0 to get a
        // reproducible answer stopped working long before that: these models
        // reason before answering, so the determinism it implied was never real.
        system: input.system,
        messages: [{ role: 'user', content: input.prompt }],
        ...(input.effort && acceptsEffort(model) ? { output_config: { effort: input.effort } } : {}),
      }),
    });
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new AiRequestError(
        'The model took longer than a minute to answer, so the request was stopped. Try again, or ask a narrower question.',
      );
    }
    throw new AiRequestError('The model could not be reached. Check the connection and try again.');
  }

  if (!response.ok) {
    // The body names the actual fault, and a bare status code sends you
    // hunting for a network problem when the request itself was malformed.
    const detail = await response.text().catch(() => '');
    const message = (() => {
      try {
        return (JSON.parse(detail) as { error?: { message?: string } }).error?.message;
      } catch {
        return undefined;
      }
    })();
    throw new AiRequestError(
      `The model request failed (${response.status}${message ? `: ${message}` : ''}). No analysis was generated.`,
    );
  }

  let payload: { content?: { type: string; text?: string }[] };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    throw new AiRequestError('The model stopped part-way through its answer. Try again.');
  }
  const text = (payload.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('')
    .trim();

  if (!text) throw new AiRequestError('The model returned an empty response.');
  return { text, model };
}

/** Models sometimes wrap JSON in prose or a code fence; take the object. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) throw new AiRequestError('The model did not return JSON.');
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new AiRequestError('The model returned malformed JSON.');
  }
}
