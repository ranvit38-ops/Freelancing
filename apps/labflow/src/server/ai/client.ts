import { env } from '@/lib/env';

/** Thrown when no model credentials are configured — never faked around. */
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
 * assembled context — no caller gets to hand the model raw database access.
 */
export type ModelTransport = typeof fetch;

export async function callModel(
  input: { system: string; prompt: string; maxTokens?: number },
  fetchImpl: ModelTransport = fetch,
): Promise<{ text: string; model: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AiNotConfiguredError();

  const model = env().LABFLOW_AI_MODEL;
  const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: input.maxTokens ?? 2048,
      temperature: 0,
      system: input.system,
      messages: [{ role: 'user', content: input.prompt }],
    }),
  });

  if (!response.ok) {
    throw new AiRequestError(
      `The model request failed (${response.status}). No analysis was generated.`,
    );
  }

  const payload = (await response.json()) as {
    content?: { type: string; text?: string }[];
  };
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
