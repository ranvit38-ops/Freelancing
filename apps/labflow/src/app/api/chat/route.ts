import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getSession, type SessionContext } from '@/server/auth';
import { NotFoundInWorkspaceError } from '@/server/not-found';
import { blockedReason, hasFeature } from '@/server/paywall';
import * as q from '@/server/queries';
import { dmParticipants } from '@/lib/dm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The chat's live line: read a channel, post to it, delete your own message.
 *
 * A plain JSON route rather than server actions and page refreshes. An open
 * chat asks for new messages every couple of seconds; re-rendering the whole
 * page for that was heavy on a small server, and a server action from a tab
 * opened before a redeploy fails outright. A route with a fixed address keeps
 * working across both.
 *
 * Every response says what went wrong in words, so the chat can show it
 * beside the message instead of pretending it sent.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { 'Cache-Control': 'no-store' };

type Channel = { projectId?: string; workspace?: boolean; dmKey?: string };

function channelFrom(value: string | null): Channel | null {
  if (!value || value === 'lab') return { workspace: true };
  if (value.startsWith('dm:')) return dmParticipants(value.slice(3)) ? { dmKey: value.slice(3) } : null;
  return UUID.test(value) ? { projectId: value } : null;
}

async function gate(): Promise<SessionContext | NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'You have been signed out. Log in again to keep chatting.' }, { status: 401, headers: NO_STORE });
  }
  if (!(await hasFeature(session, 'discussion'))) {
    return NextResponse.json({ error: 'Chat is not included in this lab’s plan.' }, { status: 403, headers: NO_STORE });
  }
  return session;
}

export async function GET(request: Request) {
  const session = await gate();
  if (session instanceof NextResponse) return session;
  const channel = channelFrom(new URL(request.url).searchParams.get('c'));
  if (!channel) return NextResponse.json({ error: 'That channel does not exist.' }, { status: 404, headers: NO_STORE });
  const messages = await q.listDiscussion(session, channel);
  // Reading a direct message is what clears its unread marker.
  if (channel.dmKey) await q.markChannelRead(session, `dm:${channel.dmKey}`);
  return NextResponse.json({ messages }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const session = await gate();
  if (session instanceof NextResponse) return session;

  const input = (await request.json().catch(() => null)) as {
    channel?: string;
    body?: string;
    parentId?: string | null;
    fileId?: string | null;
  } | null;
  const body = String(input?.body ?? '').trim().slice(0, 10_000);
  const channel = channelFrom(input?.channel ?? null);
  if (!input || !channel) return NextResponse.json({ error: 'That channel does not exist.' }, { status: 400, headers: NO_STORE });
  if (!body) return NextResponse.json({ error: 'Type a message first.' }, { status: 400, headers: NO_STORE });

  const blocked = await blockedReason(session);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 402, headers: NO_STORE });

  try {
    const id = await q.postMessage(session, {
      ...channel,
      parentId: input.parentId || null,
      fileId: input.fileId || null,
      body,
    });
    revalidatePath('/dashboard');
    return NextResponse.json({ id }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof NotFoundInWorkspaceError) {
      const what = error.message.startsWith('File')
        ? 'That file is private or was deleted, so it cannot be shared here.'
        : error.message.startsWith('Message')
          ? 'The message you replied to was deleted.'
          : error.message.startsWith('Conversation')
            ? 'You can only message people who are in this lab.'
            : 'This channel no longer exists. Its project may have been deleted.';
      return NextResponse.json({ error: what }, { status: 404, headers: NO_STORE });
    }
    throw error;
  }
}

export async function DELETE(request: Request) {
  const session = await gate();
  if (session instanceof NextResponse) return session;
  const id = new URL(request.url).searchParams.get('id') ?? '';
  try {
    await q.deleteMessage(session, id);
  } catch (error) {
    // Already gone, or not yours: either way there is nothing to delete.
    if (!(error instanceof NotFoundInWorkspaceError)) throw error;
  }
  revalidatePath('/dashboard');
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
