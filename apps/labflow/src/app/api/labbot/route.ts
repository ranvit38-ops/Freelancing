import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { rateLimit } from '@/lib/rate-limit';
import { getSession } from '@/server/auth';
import { blockedReason } from '@/server/paywall';
import { recordAiGeneration } from '@/server/queries';
import { streamAnswer } from '@/server/ai/stream';
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
  return streamAnswer({
    model,
    system: LABBOT_RULES,
    messages: labbotMessages(context, question, history),
    // Kept like every other AI answer, with what it was given, so an answer
    // can be traced back to its records later.
    onDone: (answer) =>
      recordAiGeneration(session, {
        projectId: null,
        experimentId: null,
        kind: 'project_answer',
        prompt: question,
        output: { answer },
        evidence: context.sources.slice(0, 30).map((label) => ({ type: 'source', id: label, label })),
        model,
      }),
  });
}
