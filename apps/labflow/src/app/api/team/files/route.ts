import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/server/auth';
import { blockedReason } from '@/server/paywall';
import * as q from '@/server/queries';
import { isAllowedUpload, maxBytesFor, putFile } from '@/server/storage';

export const runtime = 'nodejs';

/**
 * An upload shared in the lab channel, belonging to the workspace rather than
 * to one run.
 *
 * Deliberately does not parse the file into a dataset. A number worth charting
 * belongs on the experiment that produced it, where the conditions sit beside
 * it; this route exists for the other kind of file, the one you are showing
 * somebody.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const blocked = await blockedReason(session, 'upload');
  if (blocked) return NextResponse.json({ error: blocked }, { status: 402 });

  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Choose a file to share.' }, { status: 400 });
  }
  const cap = maxBytesFor(file.name);
  if (file.size > cap) {
    return NextResponse.json(
      {
        error: `${file.name} is too large. The limit for this kind of file is ${cap / (1024 * 1024)} MB.`,
      },
      { status: 413 },
    );
  }
  if (!isAllowedUpload(file.name)) {
    return NextResponse.json(
      { error: `${file.name} is not a supported file type.` },
      { status: 415 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const storageKey = await putFile(session.workspaceId, file.name, bytes);
  const fileId = await q.recordFile(session, {
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    byteSize: bytes.byteLength,
    storageKey,
  });

  revalidatePath('/team');
  return NextResponse.json({ fileId, filename: file.name });
}
