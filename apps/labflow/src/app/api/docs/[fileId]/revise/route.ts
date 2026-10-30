import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { rateLimit } from '@/lib/rate-limit';
import { getSession } from '@/server/auth';
import { buildLabContext } from '@/server/ai/labbot';
import { streamAnswer } from '@/server/ai/stream';
import { readDocument } from '@/server/documents';
import { NotFoundInWorkspaceError } from '@/server/not-found';
import { aiAccess, countAiUse, isRefusal } from '@/server/ai/access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REVISE_RULES = `You edit documents for an academic research lab inside Labquill.

You are given a document and an instruction. Return the complete revised document and nothing else: no preamble, no explanation, no code fences. Use plain markdown (# headings, "- " bullets, **bold**).

- Follow the instruction. Keep everything the instruction does not ask you to change.
- LAB RECORDS are supplied for reference. Use them for facts about this lab; never invent results, measurements, reagents, people, dates or citations.
- Where the instruction needs a fact the records do not contain, write a placeholder like [TODO: incubation time] instead of guessing.`;

/**
 * Streams a proposed revision. Nothing is saved: the editor shows it beside
 * the current text and the researcher accepts or discards it, because AI
 * output never changes the record on its own.
 */
export async function POST(request: Request, props: { params: Promise<{ fileId: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 });
  const access = await aiAccess(session);
  if (isRefusal(access)) return NextResponse.json({ error: access.error }, { status: access.status });
  const limit = rateLimit(`labbot:${session.userId}`, { limit: 20, windowMs: 60_000 });
  if (!limit.ok) return NextResponse.json({ error: `Try again in ${limit.retryAfterSec} seconds.` }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as { instruction?: unknown; body?: unknown; title?: unknown };
  const instruction = typeof body.instruction === 'string' ? body.instruction.trim().slice(0, 2000) : '';
  if (instruction.length < 3) return NextResponse.json({ error: 'Say what to change.' }, { status: 400 });

  try {
    const doc = await readDocument(session, params.fileId);
    const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : doc.title;
    const current = typeof body.body === 'string' ? body.body.slice(0, 60_000) : doc.body;
    const lab = await buildLabContext(session, `${title} ${instruction}`);
    return streamAnswer({
      model: env().LABFLOW_LABBOT_MODEL,
      system: REVISE_RULES,
      maxTokens: 8000,
      apiKey: access.apiKey,
      onStart: () => countAiUse(session, 'revise', access),
      messages: [
        {
          role: 'user',
          content: `LAB RECORDS\n\n${lab.text}\n\nDOCUMENT TITLE: ${title}\n\nDOCUMENT\n${current || '(empty)'}\n\nINSTRUCTION: ${instruction}`,
        },
      ],
    });
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
