import { NextResponse } from 'next/server';
import { getSession } from '@/server/auth';
import { createDocument } from '@/server/documents';
import { blockedReason } from '@/server/paywall';

export const runtime = 'nodejs';

/**
 * Creates a document. From Files ("New document") it starts empty and is the
 * lab's; saved from a LabBot answer it starts private, because the answer may
 * draw on the asker's own direct messages. Either can be shared afterwards.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 });
  const blocked = await blockedReason(session, 'upload');
  if (blocked) return NextResponse.json({ error: blocked }, { status: 402 });

  const body = (await request.json().catch(() => ({}))) as { title?: unknown; body?: unknown; private?: unknown };
  const id = await createDocument(session, {
    title: typeof body.title === 'string' ? body.title : '',
    body: typeof body.body === 'string' ? body.body : '',
    private: body.private !== false,
  });
  return NextResponse.json({ id, href: `/docs/${id}` });
}
