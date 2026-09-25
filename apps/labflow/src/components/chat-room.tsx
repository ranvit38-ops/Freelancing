'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DiscussionMessage } from '@/server/queries';
import { formatBytes } from '@/lib/display';

type Channel = { key: string; name: string; projectId: string | null };

/** How often an open channel asks for new messages, while the tab is visible. */
const POLL_MS = 2000;

/** A message on its way out. Shown at once, in the order it was written. */
type Outgoing = {
  tempId: string;
  body: string;
  parentId: string | null;
  replyToName: string | null;
  fileId: string | null;
  fileName: string | null;
  status: 'sending' | 'failed';
  error?: string;
};

/**
 * One chat channel, laid out the way Slack taught everyone to read a
 * conversation: oldest at the top, newest at the bottom beside the box.
 *
 * Live enough for a lab: the open channel asks /api/chat for new messages
 * every two seconds while the tab is in front of you, and straight away when
 * you come back to it. What you send appears the instant you press Enter and
 * goes out in order, one at a time, so several people typing at once can
 * neither lose nor reorder a message. If the connection drops, a banner says
 * so, nothing typed is thrown away, and it picks up again by itself.
 */
export function ChatRoom({
  channel,
  messages: initial,
  currentUserId,
  currentUserName,
}: {
  channel: Channel;
  messages: DiscussionMessage[];
  currentUserId: string;
  currentUserName: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState<DiscussionMessage[]>(initial);
  const [outgoing, setOutgoing] = useState<Outgoing[]>([]);
  // The send loop reads this, never the state: a state updater runs later,
  // after the loop has already looked and found nothing to send.
  const outgoingNow = useRef<Outgoing[]>([]);
  const updateOutgoing = useCallback((change: (all: Outgoing[]) => Outgoing[]) => {
    outgoingNow.current = change(outgoingNow.current);
    setOutgoing(outgoingNow.current);
  }, []);
  const [mounted, setMounted] = useState(false);
  const [replyTo, setReplyTo] = useState<DiscussionMessage | null>(null);
  const [attachments, setAttachmentsState] = useState<{ id: string; name: string }[]>([]);
  // Read by send(), which can run from the end of an upload, after the render
  // that would have given it fresh state.
  const attachmentsNow = useRef<{ id: string; name: string }[]>([]);
  const setAttachments = useCallback(
    (change: (all: { id: string; name: string }[]) => { id: string; name: string }[]) => {
      attachmentsNow.current = change(attachmentsNow.current);
      setAttachmentsState(attachmentsNow.current);
    },
    [],
  );
  const uploadsInFlight = useRef(0);
  const sendWhenUploaded = useRef(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const count = messages.reduce((n, m) => n + 1 + m.replies.length, 0) + outgoing.length;

  // Times are shown in the reader's own timezone, which only the browser knows.
  useEffect(() => setMounted(true), []);

  /* ── reading ── */

  const failures = useRef(0);
  // The read in flight, if any. A timer tick skips when one is running; a
  // send waits for it and reads again, because a read that started before
  // the message was saved cannot contain it, and removing the grey copy on
  // the strength of that read would make the message blink out.
  const inflight = useRef<Promise<void> | null>(null);
  const load = useCallback(
    async (fresh = false): Promise<void> => {
      if (inflight.current) {
        if (!fresh) return;
        await inflight.current;
      }
      const read = readOnce();
      inflight.current = read;
      try {
        await read;
      } finally {
        if (inflight.current === read) inflight.current = null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- readOnce only closes over channel.key
    [channel.key],
  );

  async function readOnce(): Promise<void> {
    try {
      const response = await fetch(`/api/chat?c=${encodeURIComponent(channel.key)}`, { cache: 'no-store' });
      if (response.status === 401) {
        setSignedOut(true);
        return;
      }
      if (!response.ok) throw new Error(String(response.status));
      const payload = (await response.json()) as { messages: DiscussionMessage[] };
      failures.current = 0;
      setOffline(false);
      // Only replace when something changed, so an idle chat does not
      // re-render (and lose a half-selected line of text) every two seconds.
      setMessages((current) =>
        JSON.stringify(current) === JSON.stringify(payload.messages) ? current : payload.messages,
      );
    } catch {
      // One miss is a blip; the banner is for a connection that is really gone.
      failures.current += 1;
      if (failures.current >= 2) setOffline(true);
    }
  }

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const id = window.setInterval(tick, POLL_MS);
    // Coming back to the tab, or the network coming back, should not wait.
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    window.addEventListener('online', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
      window.removeEventListener('online', tick);
    };
  }, [load]);

  /* ── sending, strictly in order ── */

  const pumping = useRef(false);
  const queue = useRef<Outgoing[]>([]);
  const pump = useCallback(async () => {
    if (pumping.current) return;
    pumping.current = true;
    try {
      while (queue.current.length > 0) {
        const next = queue.current[0]!;
        let failure: string | null = null;
        try {
          const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: channel.key, body: next.body, parentId: next.parentId, fileId: next.fileId }),
          });
          if (response.status === 401) setSignedOut(true);
          if (!response.ok) {
            const payload = (await response.json().catch(() => ({}))) as { error?: string };
            failure = payload.error ?? 'That message did not send.';
          }
        } catch {
          failure = 'No connection. It will stay here until you press Retry.';
        }

        if (failure) {
          // Stop here rather than skip ahead: sending the next message before
          // this one would put the conversation out of order. Everything
          // behind it waits too, and says so.
          const stuck = new Set(queue.current.map((o) => o.tempId));
          queue.current = [];
          updateOutgoing((all) =>
            all.map((o) =>
              o.tempId === next.tempId
                ? { ...o, status: 'failed', error: failure! }
                : stuck.has(o.tempId)
                  ? { ...o, status: 'failed', error: 'Waiting for the message above.' }
                  : o,
            ),
          );
          break;
        }
        queue.current.shift();
        // Fetch before removing the grey copy, so the message never blinks out.
        await load(true);
        updateOutgoing((all) => all.filter((o) => o.tempId !== next.tempId));
      }
    } finally {
      pumping.current = false;
    }
  }, [channel.key, load, updateOutgoing]);

  function send() {
    // Enter pressed while a file is still uploading: send the moment it lands,
    // rather than quietly doing nothing.
    if (uploadsInFlight.current > 0) {
      sendWhenUploaded.current = true;
      return;
    }
    const attachments = attachmentsNow.current;
    const text = box.current?.value.trim() ?? '';
    if (!text && attachments.length === 0) return;
    // One message per file, the way Slack posts them. What was typed rides
    // on the first.
    const parts: { body: string; file: { id: string; name: string } | null }[] =
      attachments.length === 0
        ? [{ body: text, file: null }]
        : attachments.map((file, i) => ({ body: i === 0 && text ? text : `Shared ${file.name}`, file }));
    const items: Outgoing[] = parts.map((part) => ({
      tempId: `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      body: part.body,
      parentId: replyTo?.id ?? null,
      replyToName: replyTo ? (replyTo.authorName ?? 'someone') : null,
      fileId: part.file?.id ?? null,
      fileName: part.file?.name ?? null,
      status: 'sending',
    }));
    // Anything that failed earlier goes first, so the conversation stays in
    // the order it was written. Nothing already queued is queued twice.
    const failed = requeueFailed();
    updateOutgoing((all) => [...all, ...items]);
    queue.current = [...failed, ...queue.current, ...items];
    if (box.current) box.current.value = '';
    setAttachments(() => []);
    setReplyTo(null);
    setError(null);
    box.current?.focus();
    void pump();
  }

  /** Marks every failed message as sending again and returns them, oldest first. */
  function requeueFailed(): Outgoing[] {
    const failed = outgoingNow.current.filter((o) => o.status === 'failed');
    const ids = new Set(failed.map((o) => o.tempId));
    updateOutgoing((all) => all.map((o) => (ids.has(o.tempId) ? { ...o, status: 'sending', error: undefined } : o)));
    return outgoingNow.current.filter((o) => ids.has(o.tempId));
  }

  function retry() {
    queue.current = [...requeueFailed(), ...queue.current];
    void pump();
  }

  function discard(tempId: string) {
    updateOutgoing((all) => all.filter((o) => o.tempId !== tempId));
  }

  async function remove(id: string) {
    const before = messages;
    setMessages((all) =>
      all.filter((m) => m.id !== id).map((m) => ({ ...m, replies: m.replies.filter((r) => r.id !== id) })),
    );
    try {
      const response = await fetch(`/api/chat?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(String(response.status));
    } catch {
      setMessages(before);
      setError('That message could not be deleted. Check your connection and try again.');
    }
  }

  // Stay pinned to the newest message, unless the reader has scrolled up to
  // read something older: yanking them back down mid-sentence is the worst
  // thing a chat can do. Your own new message always scrolls into view.
  const lastCount = useRef(0);
  const lastOutgoing = useRef(0);
  // Whether the reader is at the bottom, kept up to date as they scroll. An
  // image that finishes loading makes the conversation taller; if they were
  // at the bottom they should stay there, as in Slack.
  const pinned = useRef(true);
  const repin = useCallback(() => {
    const el = scroller.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, []);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (lastCount.current === 0 || nearBottom || outgoing.length > lastOutgoing.current) {
      el.scrollTop = el.scrollHeight;
    }
    lastCount.current = count;
    lastOutgoing.current = outgoing.length;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
  }, [count, outgoing.length]);

  /** Uploads each file to the lab's files, then holds it ready to post. */
  async function attach(list: File[]) {
    if (list.length === 0) return;
    setError(null);
    uploadsInFlight.current += 1;
    const problems: string[] = [];
    for (const [i, file] of list.entries()) {
      setUploading(list.length > 1 ? `Uploading ${file.name} (${i + 1} of ${list.length})…` : `Uploading ${file.name}…`);
      try {
        const body = new FormData();
        body.set('file', file);
        const response = await fetch('/api/team/files', { method: 'POST', body });
        const payload = (await response.json().catch(() => ({}))) as {
          fileId?: string;
          filename?: string;
          error?: string;
        };
        if (response.ok && payload.fileId) {
          const added = { id: payload.fileId, name: payload.filename ?? file.name };
          setAttachments((all) => [...all, added]);
        } else {
          problems.push(payload.error ?? `${file.name} could not be attached.`);
        }
      } catch {
        problems.push(`${file.name} could not be attached. Check your connection and try again.`);
      }
    }
    uploadsInFlight.current -= 1;
    setUploading(null);
    if (fileInput.current) fileInput.current.value = '';
    if (problems.length) setError(problems.join(' '));
    box.current?.focus();
    if (uploadsInFlight.current === 0 && sendWhenUploaded.current) {
      sendWhenUploaded.current = false;
      send();
    }
  }

  // Dragging over the chat shows where to let go. Counting enters and leaves
  // stops the highlight flickering as the pointer crosses child elements.
  const dragDepth = useRef(0);
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

  const days = groupByDay(messages);

  return (
    <div
      className="relative flex h-[calc(100dvh-13rem)] min-h-[26rem] flex-col overflow-hidden rounded-xl border border-line bg-surface"
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (hasFiles(e)) e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        void attach(Array.from(e.dataTransfer.files));
      }}
    >
      {/* Tells the page-wide reload guard there is something not yet sent. */}
      {outgoing.length > 0 ? <span hidden data-unsent /> : null}
      {dragging ? (
        <div className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-lg border-2 border-dashed border-accent bg-accent/10 text-center">
          <div>
            <p className="text-base font-semibold text-accent">Drop to share in #{channel.name}</p>
            <p className="mt-1 text-sm text-muted">Everyone in the channel will be able to open it.</p>
          </div>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold"># {channel.name}</h2>
          <p className="truncate text-xs text-muted">
            {channel.projectId
              ? 'Everything about this project, in one place.'
              : 'The whole lab. Meetings, questions, who has the good pipettes.'}
          </p>
        </div>
        <span
          className={`flex shrink-0 items-center gap-1.5 text-xs ${offline ? 'text-warn' : 'text-subtle'}`}
          aria-live="polite"
        >
          <span aria-hidden className={`h-2 w-2 rounded-full ${offline ? 'animate-pulse bg-warn' : 'bg-ok'}`} />
          {offline ? 'Reconnecting…' : 'Live'}
        </span>
      </div>

      {signedOut ? (
        <p role="alert" className="border-b border-warn/25 bg-warn/10 px-5 py-2 text-xs text-warn">
          You have been signed out.{' '}
          <a href="/login" className="font-medium underline underline-offset-2">
            Log in again
          </a>{' '}
          and your messages will be here.
        </p>
      ) : offline ? (
        <p role="status" className="border-b border-warn/25 bg-warn/10 px-5 py-2 text-xs text-warn">
          Lost the connection for a moment. Keep typing; it will catch up by itself.
        </p>
      ) : null}

      <div
        ref={scroller}
        id="chat-messages"
        className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
        aria-live="polite"
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
        }}
      >
        {count === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-sm font-medium">This is the start of #{channel.name}</p>
            <p className="mt-1 max-w-sm text-sm text-muted">
              Say hello, share a result, or ask the question you have been meaning to ask.
            </p>
          </div>
        ) : (
          <>
            {days.map(([day, group]) => (
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
                    currentUserId={currentUserId}
                    onReply={() => {
                      setReplyTo(m);
                      box.current?.focus();
                    }}
                    onDelete={(id) => void remove(id)}
                    onMediaLoad={repin}
                  />
                ))}
              </section>
            ))}
            {outgoing.map((o, i) => (
              <div key={o.tempId} className={`mt-2 rounded-lg px-2 py-1.5 ${o.status === 'failed' ? 'bg-danger/5' : ''}`}>
                <div className="flex gap-3">
                  <div aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/10 text-xs font-semibold text-accent">
                    {initials(currentUserName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-semibold">{currentUserName}</span>
                      <span className="ml-2 text-xs text-subtle">
                        {o.status === 'sending' ? 'Sending…' : 'Not sent'}
                      </span>
                    </p>
                    {o.replyToName ? <p className="text-xs text-subtle">Replying to {o.replyToName}</p> : null}
                    <p className={`whitespace-pre-wrap break-words text-sm leading-6 ${o.status === 'sending' ? 'opacity-60' : ''}`}>
                      {o.body}
                    </p>
                    {o.fileName ? <p className="text-xs text-subtle">Attached: {o.fileName}</p> : null}
                    {o.status === 'failed' ? (
                      <p className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                        <span className="text-danger">{o.error}</span>
                        {/* One Retry, on the first: it resends all of them, in order. */}
                        {outgoing.findIndex((x) => x.status === 'failed') === i ? (
                          <button type="button" onClick={retry} className="font-medium text-accent hover:underline">
                            {outgoing.filter((x) => x.status === 'failed').length > 1 ? 'Retry all' : 'Retry'}
                          </button>
                        ) : null}
                        <button type="button" onClick={() => discard(o.tempId)} className="text-subtle hover:text-fg">
                          Discard
                        </button>
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </>
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
        {attachments.length > 0 || uploading ? (
          <ul className="mb-2 flex flex-wrap gap-2">
            {attachments.map((a) => (
              <li
                key={a.id}
                className="flex max-w-full items-center gap-2 rounded-lg border border-line bg-raised px-3 py-1.5 text-xs"
              >
                <span aria-hidden>📎</span>
                <span className="truncate font-medium">{a.name}</span>
                <button
                  type="button"
                  onClick={() => setAttachments((all) => all.filter((x) => x.id !== a.id))}
                  aria-label={`Remove ${a.name}`}
                  className="shrink-0 text-subtle hover:text-fg"
                >
                  ✕
                </button>
              </li>
            ))}
            {uploading ? (
              <li className="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-1.5 text-xs text-muted">
                {uploading}
              </li>
            ) : null}
          </ul>
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
            disabled={Boolean(uploading)}
            aria-label="Attach files"
            title="Attach files, or drag them onto the chat"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line text-lg text-muted hover:bg-raised hover:text-fg disabled:opacity-50"
          >
            +
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            className="sr-only"
            aria-label="Choose files to attach"
            onChange={(e) => void attach(Array.from(e.target.files ?? []))}
          />
          <label htmlFor="chat-box" className="sr-only">
            Message #{channel.name}
          </label>
          <textarea
            id="chat-box"
            ref={box}
            rows={1}
            placeholder={`Message #${channel.name}`}
            onPaste={(e) => {
              // A pasted screenshot is shared, as in Slack. Pasted text is left alone.
              const pasted = Array.from(e.clipboardData.files);
              if (pasted.length === 0) return;
              e.preventDefault();
              void attach(pasted.map((f, i) => (f.name && f.name !== 'image.png' ? f : new File([f], `pasted-${Date.now()}${i ? `-${i}` : ''}.png`, { type: f.type }))));
            }}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter starts a new line: the convention
              // everyone already has in their fingers.
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            className="max-h-40 min-h-10 flex-1 resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={send}
            disabled={Boolean(uploading)}
            className="h-10 shrink-0 rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Send
          </button>
        </div>
        <p className="mt-1.5 hidden text-[11px] text-subtle sm:block">
          Enter to send · Shift + Enter for a new line · Drag files in or paste a screenshot
        </p>
      </div>
    </div>
  );
}

function Message({
  message,
  compact,
  mounted,
  currentUserId,
  onReply,
  onDelete,
  onMediaLoad,
}: {
  message: DiscussionMessage;
  compact: boolean;
  mounted: boolean;
  currentUserId: string;
  onReply: () => void;
  onDelete: (id: string) => void;
  onMediaLoad: () => void;
}) {
  const mine = message.authorId === currentUserId;
  const name = message.authorName ?? 'Former member';
  return (
    // tabIndex -1: a tap on a phone focuses the message, which shows its
    // Reply and Delete. Hover alone left them unreachable on touch screens.
    <div
      tabIndex={-1}
      className={`group relative rounded-lg px-2 outline-none hover:bg-raised focus-within:bg-raised focus:bg-raised ${compact ? 'py-0.5' : 'mt-2 py-1.5'}`}
    >
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
          {message.fileId && isImage(message.fileName) ? (
            <a href={`/api/files/${message.fileId}`} target="_blank" rel="noreferrer" className="mt-1 block w-fit">
              {/* eslint-disable-next-line @next/next/no-img-element -- a private, authenticated file; next/image would proxy it */}
              <img
                src={`/api/files/${message.fileId}`}
                alt={message.fileName ?? 'Shared image'}
                onLoad={onMediaLoad}
                className="max-h-64 max-w-full rounded-lg border border-line object-contain"
              />
            </a>
          ) : message.fileId ? (
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
                <div key={r.id} className="group/reply text-sm">
                  <span className="font-semibold">{r.authorName ?? 'Former member'}</span>
                  <span className="ml-2 text-xs text-subtle">{mounted ? time(r.createdAt) : ''}</span>
                  {r.authorId === currentUserId ? (
                    <button
                      type="button"
                      onClick={() => onDelete(r.id)}
                      className="ml-2 text-xs text-subtle opacity-0 hover:text-danger focus:opacity-100 group-hover/reply:opacity-100"
                    >
                      Delete
                    </button>
                  ) : null}
                  <p className="whitespace-pre-wrap break-words leading-6">{r.body}</p>
                  {r.fileId ? (
                    <a href={`/api/files/${r.fileId}`} className="text-xs font-medium text-accent hover:underline">
                      📎 {r.fileName ?? 'File'}
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {/* Floats over the message rather than sitting under it, so a run
              of short messages is not spaced out by invisible buttons. */}
          <div className="pointer-events-none absolute -top-3 right-2 flex gap-3 rounded-md border border-line bg-surface px-2.5 py-1 text-xs text-subtle opacity-0 shadow-sm transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus:pointer-events-auto group-focus:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
            <button type="button" onClick={onReply} className="hover:text-fg">
              Reply
            </button>
            {mine ? (
              <button type="button" onClick={() => onDelete(message.id)} className="hover:text-danger">
                Delete
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function isImage(name: string | null) {
  return /\.(png|jpe?g|gif|webp)$/i.test(name ?? '');
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
