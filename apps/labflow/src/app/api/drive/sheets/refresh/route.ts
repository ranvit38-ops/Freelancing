import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { rateLimit } from '@/lib/rate-limit';
import { getSession } from '@/server/auth';
import { driveConfigured, refreshSheet } from '@/server/drive-import';
import { NotFoundInWorkspaceError } from '@/server/not-found';
import { blockedReason } from '@/server/paywall';
import { UploadRejected } from '@/server/uploads';

export const runtime = 'nodejs';

/** Copies a linked Google Sheet again and updates the datasets read from it. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 });
  if (!driveConfigured()) {
    return NextResponse.json({ error: 'Google Sheets is not switched on for this site yet.' }, { status: 503 });
  }
  const blocked = await blockedReason(session, 'upload');
  if (blocked) return NextResponse.json({ error: blocked }, { status: 402 });
  const limit = rateLimit(`drive:${session.userId}`, { limit: 10, windowMs: 60_000 });
  if (!limit.ok) return NextResponse.json({ error: `Try again in ${limit.retryAfterSec} seconds.` }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as { accessToken?: unknown; fileId?: unknown };
  if (typeof body.accessToken !== 'string' || !body.accessToken) {
    return NextResponse.json({ error: 'Google did not hand over access. Try again.' }, { status: 400 });
  }
  if (typeof body.fileId !== 'string') return NextResponse.json({ error: 'Which Sheet?' }, { status: 400 });
  try {
    const result = await refreshSheet(session, body.fileId, body.accessToken);
    revalidatePath('/', 'layout');
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UploadRejected) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof NotFoundInWorkspaceError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
