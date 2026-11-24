import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import { getSession } from '@/server/auth';
import { emailToLab } from '@/server/doc-mail';

export const runtime = 'nodejs';

/** Emails a LabBot answer to people in the lab, or to yourself. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 });
  const limit = rateLimit(`doc-email:${session.userId}`, { limit: 10, windowMs: 10 * 60_000 });
  if (!limit.ok) return NextResponse.json({ error: `Try again in ${limit.retryAfterSec} seconds.` }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as { to?: unknown; question?: unknown; answer?: unknown };
  const to = Array.isArray(body.to) ? body.to.filter((x): x is string => typeof x === 'string') : [];
  const question = typeof body.question === 'string' ? body.question.slice(0, 2000) : '';
  const answer = typeof body.answer === 'string' ? body.answer.slice(0, 20_000) : '';
  if (!answer) return NextResponse.json({ error: 'There is no answer to send yet.' }, { status: 400 });

  const result = await emailToLab(session, {
    recipientIds: to,
    subject: `LabBot: ${question.slice(0, 80) || 'an answer'} (from ${session.userName})`,
    text: [`${session.userName} asked LabBot in ${session.workspaceName}:`, question, '', answer].join('\n'),
  });
  return 'error' in result ? NextResponse.json(result, { status: 400 }) : NextResponse.json(result);
}
