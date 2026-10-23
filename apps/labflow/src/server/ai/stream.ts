import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { acceptsEffort } from './client';

/**
 * Streams a model's answer to the browser as plain text, word by word.
 *
 * Waits for the first words before answering, so a refused key or an empty
 * account comes back as a JSON error with a status the page can show. After
 * that the stream is open, so a later failure is written into it as a last
 * line. `onDone` receives the full text once it has all arrived.
 */
export async function streamAnswer(input: {
  model: string;
  system: string;
  messages: Anthropic.MessageParam[];
  maxTokens?: number;
  onDone?: (text: string) => Promise<void>;
}): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'LabBot is not switched on for this site yet. It needs ANTHROPIC_API_KEY set on the server.' },
      { status: 503 },
    );
  }
  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });
  const stream = client.messages.stream({
    model: input.model,
    max_tokens: input.maxTokens ?? 4096,
    system: input.system,
    messages: input.messages,
    // A chat answer about the lab's own records is a lookup, not a proof, and
    // someone is watching the cursor. Low effort starts it in about a second.
    ...(acceptsEffort(input.model) ? { output_config: { effort: 'low' as const } } : {}),
  });

  const events = stream[Symbol.asyncIterator]();
  let first = '';
  try {
    for (;;) {
      const next = await events.next();
      if (next.done) break;
      const event = next.value;
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        first = event.delta.text;
        break;
      }
    }
  } catch (error) {
    return NextResponse.json({ error: explainModelError(error) }, { status: 502 });
  }

  const encoder = new TextEncoder();
  let text = first;
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      if (first) controller.enqueue(encoder.encode(first));
      try {
        for (;;) {
          const next = await events.next();
          if (next.done) break;
          const event = next.value;
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            text += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === 'refusal') {
          controller.enqueue(encoder.encode('\n\nLabBot declined to answer this one.'));
        } else if (final.stop_reason === 'max_tokens') {
          controller.enqueue(encoder.encode('\n\n(Cut short. Ask for the rest.)'));
        }
      } catch (error) {
        controller.enqueue(encoder.encode(`\n\nLabBot stopped: ${explainModelError(error)}`));
      } finally {
        controller.close();
      }
      await input.onDone?.(text).catch(() => {});
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(readable, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' },
  });
}

export function explainModelError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return 'The AI key on the server was rejected. Create a new key at console.anthropic.com and replace ANTHROPIC_API_KEY.';
  }
  if (error instanceof Anthropic.PermissionDeniedError) return 'The AI key on the server is not allowed to use this model.';
  if (error instanceof Anthropic.RateLimitError) return 'Too many questions at once for the AI account. Wait a moment and ask again.';
  if (error instanceof Anthropic.BadRequestError) {
    return /credit balance/i.test(error.message)
      ? 'The AI account is out of credit. Add credit at console.anthropic.com → Billing.'
      : `The AI service refused the request: ${error.message}`;
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) return 'The AI service took too long to answer. Try again.';
  if (error instanceof Anthropic.APIConnectionError) return 'The AI service could not be reached. Try again in a moment.';
  if (error instanceof Anthropic.APIError) return `The AI service had a problem (${error.status ?? 'no status'}). Try again.`;
  return 'Something went wrong while answering. Try again.';
}
