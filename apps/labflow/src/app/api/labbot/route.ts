import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { rateLimit } from '@/lib/rate-limit';
import { getSession } from '@/server/auth';
import { blockedReason } from '@/server/paywall';
import { recordAiGeneration } from '@/server/queries';
import { LABBOT_RULES, buildLabContext, labbotMessages, type Turn } from '@/server/ai/labbot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * LabBot, streamed. The answer is written to the browser word by word as the
 * model produces it, so the first words appear in about a second instead of
 * after the whole answer is finished.
 *
 * Errors that happen before the first word come back as JSON with a status,
 * so the panel can say what went wrong. After that the stream is already
 * open, so a failure is written into it as a last line.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sign in again to use LabBot.' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'LabBot is not switched on for this site yet. It needs ANTHROPIC_API_KEY set on the server.' },
      { status: 503 },
    );
  }
  const blocked = await blockedReason(session, 'ai');
  if (blocked) return NextResponse.json({ error: blocked }, { status: 402 });

  const limit = rateLimit(`labbot:${session.userId}`, { limit: 20, windowMs: 60_000 });
  if (!limit.ok) {
    return NextResponse.json({ error: `That is a lot of questions at once. Try again in ${limit.retryAfterSec} seconds.` }, { status: 429 });
  }

  let body: { question?: unknown; history?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'The question did not arrive. Try again.' }, { status: 400 });
  }
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 2000) : '';
  if (question.length < 2) return NextResponse.json({ error: 'Type a question first.' }, { status: 400 });
  const history: Turn[] = Array.isArray(body.history)
    ? body.history
        .filter((t): t is Turn => typeof t?.question === 'string' && typeof t?.answer === 'string')
        .map((t) => ({ question: t.question.slice(0, 2000), answer: t.answer.slice(0, 6000) }))
    : [];

  // Follow-ups like "and the second one?" carry no terms of their own, so the
  // previous question helps decide which records are relevant.
  const context = await buildLabContext(session, `${question} ${history.at(-1)?.question ?? ''}`);
  const model = env().LABFLOW_LABBOT_MODEL;
  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });

  const stream = client.messages.stream({
    model,
    max_tokens: 4096,
    system: LABBOT_RULES,
    messages: labbotMessages(context, question, history),
  });

  // Wait for the first words before answering the browser, so a refused key
  // or an empty account is a clear error rather than a blank answer.
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
    return NextResponse.json({ error: explain(error) }, { status: 502 });
  }

  const encoder = new TextEncoder();
  let answer = first;
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      if (first) controller.enqueue(encoder.encode(first));
      try {
        for (;;) {
          const next = await events.next();
          if (next.done) break;
          const event = next.value;
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            answer += event.delta.text;
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
        controller.enqueue(encoder.encode(`\n\nLabBot stopped: ${explain(error)}`));
      } finally {
        controller.close();
      }
      // Kept like every other AI answer, with what it was given, so an answer
      // can be traced back to its records later.
      await recordAiGeneration(session, {
        projectId: null,
        experimentId: null,
        kind: 'project_answer',
        prompt: question,
        output: { answer },
        evidence: context.sources.slice(0, 30).map((label) => ({ type: 'source', id: label, label })),
        model,
      }).catch(() => {});
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(readable, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' },
  });
}

function explain(error: unknown): string {
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
