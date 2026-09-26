import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/server/auth';
import { blockedReason } from '@/server/paywall';
import * as q from '@/server/queries';
import { StorageFullError, isAllowedUpload, maxBytesFor, putFile } from '@/server/storage';
import { audienceFrom, shareFile, type Audience } from '@/server/sharing';
import { dmParticipants } from '@/lib/dm';

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

  // Who it is for. From the Files page: everyone, only me, or chosen people,
  // and those people are told. From a chat: the conversation it is dropped
  // into decides, and the chat message itself is the announcement, so no
  // second one is posted here.
  const dm = String(form.get('dmKey') ?? '');
  const dmPeople = dm ? dmParticipants(dm) : null;
  if (dm && !dmPeople?.includes(session.userId)) {
    return NextResponse.json({ error: 'That conversation does not exist.' }, { status: 400 });
  }
  const audience: Audience = dmPeople
    ? { kind: 'people', userIds: dmPeople }
    : audienceFrom(form);

  const bytes = Buffer.from(await file.arrayBuffer());
  let storageKey: string;
  try {
    storageKey = await putFile(session.workspaceId, file.name, bytes);
  } catch (error) {
    if (error instanceof StorageFullError) return NextResponse.json({ error: error.message }, { status: 507 });
    throw error;
  }
  const fileId = await q.recordFile(session, {
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    byteSize: bytes.byteLength,
    storageKey,
    private: audience.kind !== 'everyone',
  });
  const announce = form.get('announce') === '1' && !dmPeople;
  const shared = await shareFile(session, { id: fileId, filename: file.name }, audience, { announce });

  revalidatePath('/team');
  revalidatePath('/files');
  revalidatePath('/chat');
  return NextResponse.json({ fileId, filename: file.name, sharedWith: shared.sharedWith.length, dmKey: shared.dmKey });
}
