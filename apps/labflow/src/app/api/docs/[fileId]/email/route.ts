import { NextResponse } from 'next/server';
import { markdownToDocx } from '@/lib/docx';
import { rateLimit } from '@/lib/rate-limit';
import { getSession } from '@/server/auth';
import { emailToLab } from '@/server/doc-mail';
import { readDocument } from '@/server/documents';
import { NotFoundInWorkspaceError } from '@/server/not-found';

export const runtime = 'nodejs';

/** Emails the document, as a Word attachment, to people in the lab. */
export async function POST(request: Request, { params }: { params: { fileId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 });
  const limit = rateLimit(`doc-email:${session.userId}`, { limit: 10, windowMs: 10 * 60_000 });
  if (!limit.ok) return NextResponse.json({ error: `Try again in ${limit.retryAfterSec} seconds.` }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as { to?: unknown; note?: unknown };
  const to = Array.isArray(body.to) ? body.to.filter((x): x is string => typeof x === 'string') : [];
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : '';
  try {
    const doc = await readDocument(session, params.fileId);
    const result = await emailToLab(session, {
      recipientIds: to,
      subject: `${doc.title} (from ${session.userName} on LabLedger)`,
      text: [note, note ? '' : null, `${session.userName} sent you "${doc.title}" from ${session.workspaceName}. It is attached as a Word document.`, '', doc.body]
        .filter((line) => line !== null)
        .join('\n'),
      attachment: { filename: `${doc.title.replace(/[^\w .()-]+/g, '_')}.docx`, content: await markdownToDocx(doc.title, doc.body) },
    });
    return 'error' in result ? NextResponse.json(result, { status: 400 }) : NextResponse.json(result);
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
