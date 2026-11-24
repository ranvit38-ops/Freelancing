import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/server/auth';
import { saveDocument } from '@/server/documents';
import { NotFoundInWorkspaceError } from '@/server/not-found';
import { blockedReason } from '@/server/paywall';
import { DocumentConflictError } from '@/server/queries';

export const runtime = 'nodejs';

/** Saves a new version of a document anyone who can open it may edit. */
export async function PUT(request: Request, props: { params: Promise<{ fileId: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sign in again. Your text is still on screen.' }, { status: 401 });
  const blocked = await blockedReason(session);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 402 });

  const body = (await request.json().catch(() => null)) as
    | { title?: unknown; body?: unknown; baseUpdatedAt?: unknown }
    | null;
  if (!body || typeof body.body !== 'string') {
    return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 });
  }
  try {
    const saved = await saveDocument(session, params.fileId, {
      title: typeof body.title === 'string' ? body.title : '',
      body: body.body,
      baseUpdatedAt: typeof body.baseUpdatedAt === 'string' ? body.baseUpdatedAt : null,
    });
    revalidatePath('/files');
    return NextResponse.json(saved);
  } catch (error) {
    if (error instanceof DocumentConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof NotFoundInWorkspaceError) {
      return NextResponse.json({ error: 'This document no longer exists, or it is not shared with you.' }, { status: 404 });
    }
    throw error;
  }
}
