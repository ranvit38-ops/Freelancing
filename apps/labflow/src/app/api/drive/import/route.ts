import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { rateLimit } from '@/lib/rate-limit';
import { getSession } from '@/server/auth';
import { driveConfigured, importDriveFiles, type PickedFile } from '@/server/drive-import';
import { blockedReason } from '@/server/paywall';
import { audienceFrom } from '@/server/sharing';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sign in again.' }, { status: 401 });
  if (!driveConfigured()) {
    return NextResponse.json({ error: 'Google Drive import is not switched on for this site yet.' }, { status: 503 });
  }
  const blocked = await blockedReason(session, 'upload');
  if (blocked) return NextResponse.json({ error: blocked }, { status: 402 });
  const limit = rateLimit(`drive:${session.userId}`, { limit: 10, windowMs: 60_000 });
  if (!limit.ok) return NextResponse.json({ error: `Try again in ${limit.retryAfterSec} seconds.` }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as {
    accessToken?: unknown;
    files?: unknown;
    audience?: unknown;
    shareWith?: unknown;
  };
  if (typeof body.accessToken !== 'string' || !body.accessToken) {
    return NextResponse.json({ error: 'Google did not hand over access. Try again.' }, { status: 400 });
  }
  const files: PickedFile[] = Array.isArray(body.files)
    ? body.files
        .filter((f): f is PickedFile => typeof f?.id === 'string' && typeof f?.name === 'string')
        .map((f) => ({ id: f.id, name: f.name, mimeType: typeof f.mimeType === 'string' ? f.mimeType : '' }))
    : [];
  if (files.length === 0) return NextResponse.json({ error: 'No files were picked.' }, { status: 400 });

  // The same "who is it for" choice as an upload, carried as form fields.
  const form = new FormData();
  if (typeof body.audience === 'string') form.set('audience', body.audience);
  if (Array.isArray(body.shareWith)) for (const id of body.shareWith) if (typeof id === 'string') form.append('shareWith', id);

  const results = await importDriveFiles(session, body.accessToken, files, audienceFrom(form));
  revalidatePath('/files');
  return NextResponse.json({ results });
}
