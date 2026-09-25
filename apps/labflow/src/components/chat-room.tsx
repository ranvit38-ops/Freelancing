'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { deleteMessageAction, postMessageAction } from '@/server/actions/collab';
import type { DiscussionMessage } from '@/server/queries';
import { formatBytes } from '@/lib/display';

type Channel = { name: string; projectId: string | null };

/** How often an open channel checks for new messages, while the tab is visible. */
const REFRESH_MS = 4000;

/**
 * One chat channel, laid out the way Slack taught everyone to read a
 * conversation: oldest at the top, newest at the bottom beside the box you
 * type in, and new messages arriving without a reload.
 *
 * "Arriving" is a refresh every few seconds while the tab is in front of you,
 * not a live socket. For a lab of ten that is indistinguishable, costs nothing
 * to host, and cannot drop a message: every refresh reads the database.
 */
export function ChatRoom({
  channel,
  messages,
  currentUserId,
}: {
  channel: Channel;
  messages: DiscussionMessage[];
  currentUserId: string;
}) {
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<DiscussionMessage | null>(null);
  const [attachment, setAttachment] = useState<{ id: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = messages.reduce((n, m) => n + 1 + m.replies.length, 0);

  // Times are shown in the reader's own timezone, which only the browser knows.
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [router]);

  // Stay pinned to the newest message, unless the reader has scrolled up to
  // read something older: yanking them back down mid-sentence is the worst
  // thing a chat can do.
  const lastCount = useRef(0);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (lastCount.current === 0 || nearBottom) el.scrollTop = el.scrollHeight;
    lastCount.current = count;
  }, [count]);

  async function attach(file: File) {
    setError(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.set('file', file);
      const response = await fetch('/api/team/files', { method: 'POST', body });
      const payload = (await response.json().catch(() => ({}))) as {
        fileId?: string;
        filename?: string;
        error?: string;
      };
      if (response.ok && payload.fileId) setAttachment({ id: payload.fileId, name: payload.filename ?? file.name });
      else setError(payload.error ?? `${file.name} could not be attached.`);
    } catch {
      setError('The file could not be attached. Check your connection and try again.');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function send() {
    const text = box.current?.value.trim() ?? '';
    if (!text && !attachment) return;
    setSending(true);
    setError(null);
    const body = new FormData();
    body.set('body', text || `Shared ${attachment!.name}`);
    if (channel.projectId) body.set('projectId', channel.projectId);
    else body.set('workspace', '1');
    if (replyTo) body.set('parentId', replyTo.id);
    if (attachment) body.set('fileId', attachment.id);
    try {
      await postMessageAction(body);
      if (box.current) box.current.value = '';
      setAttachment(null);
      setReplyTo(null);
      router.refresh();
    } catch {
      // Whatever was typed stays in the box, so nothing is lost by retrying.
      setError('That message did not send. Check your connection and press Send again.');
    } finally {
      setSending(false);
      box.current?.focus();
    }
  }

  const days = groupByDay(messages);

  return (
    <div className="flex h-[calc(100dvh-13rem)] min-h-[26rem] flex-col overflow-hidden rounded-xl border border-line bg-surface">
      <div className="border-b border-line px-5 py-3">
        <h2 className="text-sm font-semibold"># {channel.name}</h2>
        <p className="text-xs text-muted">
          {channel.projectId
            ? 'Everything about this project, in one place.'
            : 'The whole lab. Meetings, questions, who has the good pipettes.'}
        </p>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-5 py-4" aria-live="polite">
        {count === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-sm font-medium">This is the start of #{channel.name}</p>
            <p className="mt-1 max-w-sm text-sm text-muted">
              Say hello, share a result, or ask the question you have been meaning to ask.
            </p>
          </div>
        ) : (
          days.map(([day, group]) => (
            <section key={day} className="mb-2">
              <div className="my-3 flex items-center gap-3 text-xs font-medium text-subtle">
                <span className="h-px flex-1 bg-line" />
                {mounted ? dayLabel(group[0]!.createdAt) : ''}
                <span className="h-px flex-1 bg-line" />
              </div>
              {group.map((m, i) => (
                <Message
                  key={m.id}
                  message={m}
                  compact={continues(group[i - 1], m)}
                  mounted={mounted}
                  mine={m.authorId === currentUserId}
                  onReply={() => {
                    setReplyTo(m);
                    box.current?.focus();
                  }}
                />
              ))}
            </section>
          ))
        )}
      </div>

      <div className="border-t border-line px-4 py-3">
        {replyTo ? (
          <p className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-raised px-3 py-1.5 text-xs text-muted">
            <span className="truncate">
              Replying to <b className="text-fg">{replyTo.authorName ?? 'someone'}</b>: {replyTo.body}
            </span>
            <button type="button" onClick={() => setReplyTo(null)} className="shrink-0 hover:text-fg">
              Cancel
            </button>
          </p>
        ) : null}
        {attachment ? (
          <p className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-raised px-3 py-1.5 text-xs text-muted">
            <span className="truncate">Attached: {attachment.name}</span>
            <button type="button" onClick={() => setAttachment(null)} className="shrink-0 hover:text-fg">
              Remove
            </button>
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mb-2 rounded-lg bg-danger/5 px-3 py-1.5 text-xs text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            aria-label="Attach a file"
            title="Attach a file"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line text-lg text-muted hover:bg-raised hover:text-fg disabled:opacity-50"
          >
            {uploading ? '…' : '+'}
          </button>
          <input
            ref={fileInput}
            type="file"
            className="sr-only"
            aria-label="Choose a file to attach"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void attach(file);
            }}
          />
          <label htmlFor="chat-box" className="sr-only">
            Message #{channel.name}
          </label>
          <textarea
            id="chat-box"
            ref={box}
            rows={1}
            placeholder={`Message #${channel.name}`}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter starts a new line: the convention
              // everyone already has in their fingers.
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            className="max-h-40 min-h-10 flex-1 resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending || uploading}
            className="h-10 shrink-0 rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
        <p className="mt-1.5 hidden text-[11px] text-subtle sm:block">
          Enter to send · Shift + Enter for a new line
        </p>
      </div>
    </div>
  );
}

function Message({
  message,
  compact,
  mounted,
  mine,
  onReply,
}: {
  message: DiscussionMessage;
  compact: boolean;
  mounted: boolean;
  mine: boolean;
  onReply: () => void;
}) {
  const name = message.authorName ?? 'Former member';
  return (
    <div className={`group rounded-lg px-2 hover:bg-raised ${compact ? 'py-0.5' : 'mt-2 py-1.5'}`}>
      <div className="flex gap-3">
        <div className="w-8 shrink-0">
          {compact ? null : (
            <div
              aria-hidden
              className="grid h-8 w-8 place-items-center rounded-full bg-accent/10 text-xs font-semibold text-accent"
            >
              {initials(name)}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {compact ? null : (
            <p className="text-sm">
              <span className="font-semibold">{name}</span>
              <span className="ml-2 text-xs text-subtle">{mounted ? time(message.createdAt) : ''}</span>
            </p>
          )}
          <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p>
          {message.fileId ? (
            <a
              href={`/api/files/${message.fileId}`}
              className="mt-1 inline-flex max-w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs hover:bg-raised"
            >
              <span className="truncate font-medium">{message.fileName ?? 'File'}</span>
              {message.fileSize ? <span className="shrink-0 text-subtle">{formatBytes(message.fileSize)}</span> : null}
            </a>
          ) : null}

          {message.replies.length > 0 ? (
            <div className="mt-1.5 space-y-1.5 border-l-2 border-line pl-3">
              {message.replies.map((r) => (
                <div key={r.id} className="text-sm">
                  <span className="font-semibold">{r.authorName ?? 'Former member'}</span>
                  <span className="ml-2 text-xs text-subtle">{mounted ? time(r.createdAt) : ''}</span>
                  <p className="whitespace-pre-wrap break-words leading-6">{r.body}</p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-0.5 flex gap-3 text-xs text-subtle opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <button type="button" onClick={onReply} className="hover:text-fg">
              Reply
            </button>
            {mine ? (
              <form action={deleteMessageAction}>
                <input type="hidden" name="messageId" value={message.id} />
                <input type="hidden" name="returnTo" value="/chat" />
                <button type="submit" className="hover:text-danger">
                  Delete
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A follow-up from the same person within five minutes reads as one message. */
function continues(previous: DiscussionMessage | undefined, current: DiscussionMessage) {
  if (!previous || previous.authorId !== current.authorId) return false;
  return new Date(current.createdAt).getTime() - new Date(previous.createdAt).getTime() < 5 * 60_000;
}

function groupByDay(messages: DiscussionMessage[]): [string, DiscussionMessage[]][] {
  const groups = new Map<string, DiscussionMessage[]>();
  for (const m of messages) {
    const key = new Date(m.createdAt).toDateString();
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  return [...groups.entries()];
}

function dayLabel(value: Date | string) {
  const d = new Date(value);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

function time(value: Date | string) {
  return new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}
