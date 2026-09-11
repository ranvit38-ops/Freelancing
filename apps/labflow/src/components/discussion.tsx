'use client';

import { useCallback, useRef, useState } from 'react';
import { Button, Card, CardHeader, EmptyState, Textarea, cx } from './ui';
import { SubmitButton } from './submit-button';
import { deleteMessageAction, postMessageAction } from '@/server/actions/collab';
import { formatBytes, formatDate } from '@/lib/display';
import type { DiscussionMessage } from '@/server/queries';

/**
 * Threaded discussion, one reply level deep. Deliberately not real-time:
 * a lab conversation about a run happens over days, and websockets would add
 * infrastructure for a problem nobody has yet.
 */
export function Discussion({
  messages,
  experimentId,
  projectId,
  workspace,
  title = 'Discussion',
  currentUserId,
  returnTo,
}: {
  messages: DiscussionMessage[];
  experimentId?: string;
  projectId?: string;
  /** The workspace-wide channel: no project, no experiment, everyone in it. */
  workspace?: boolean;
  title?: string;
  currentUserId: string;
  returnTo: string;
}) {
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const count = messages.reduce((n, m) => n + 1 + m.replies.length, 0);

  const hidden = (
    <>
      {experimentId ? <input type="hidden" name="experimentId" value={experimentId} /> : null}
      {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}
      {workspace ? <input type="hidden" name="workspace" value="1" /> : null}
    </>
  );

  return (
    <Card>
      <CardHeader title={title} description={`${count} message${count === 1 ? '' : 's'}`} />

      <Composer hidden={hidden} canAttach={Boolean(workspace)} />

      {messages.length === 0 ? (
        <EmptyState
          title="No messages yet"
          description="Discussion lives with the record, so the reasoning is still here months later."
        />
      ) : (
        <ul className="divide-y divide-line">
          {messages.map((message) => (
            <li key={message.id} className="px-5 py-4">
              <Message message={message} currentUserId={currentUserId} returnTo={returnTo} />

              {message.replies.length > 0 ? (
                <ul className="mt-3 space-y-3 border-l-2 border-line pl-4">
                  {message.replies.map((reply) => (
                    <li key={reply.id}>
                      <Message message={reply} currentUserId={currentUserId} returnTo={returnTo} />
                    </li>
                  ))}
                </ul>
              ) : null}

              {replyTo === message.id ? (
                <form action={postMessageAction} className="mt-3 space-y-2 border-l-2 border-accent/40 pl-4">
                  {hidden}
                  <input type="hidden" name="parentId" value={message.id} />
                  <label htmlFor={`reply-${message.id}`} className="sr-only">
                    Reply
                  </label>
                  <Textarea id={`reply-${message.id}`} name="body" required autoFocus className="min-h-[64px]" />
                  <div className="flex gap-2">
                    <SubmitButton tone="secondary" size="sm" pendingLabel="Replying…">
                      Reply
                    </SubmitButton>
                    <Button type="button" tone="ghost" size="sm" onClick={() => setReplyTo(null)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <Button
                  type="button"
                  tone="ghost"
                  size="sm"
                  className="mt-2 px-0"
                  onClick={() => setReplyTo(message.id)}
                >
                  Reply
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * The message box, with a file dropped onto it becoming an attachment.
 *
 * The file uploads on drop rather than on submit, so by the time the message
 * is posted the id already exists and the server action stays a plain form
 * post. XHR rather than fetch for the one reason XHR still earns: fetch cannot
 * report upload progress, and a 200 MB video with no progress bar looks frozen.
 */
function Composer({ hidden, canAttach }: { hidden: React.ReactNode; canAttach: boolean }) {
  const [file, setFile] = useState<{ id: string; name: string } | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const send = useCallback((chosen: File) => {
    setError(null);
    setPercent(0);
    const request = new XMLHttpRequest();
    request.open('POST', '/api/team/files');
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) setPercent(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener('load', () => {
      setPercent(null);
      try {
        const payload = JSON.parse(request.responseText) as {
          fileId?: string;
          filename?: string;
          error?: string;
        };
        if (request.status >= 200 && request.status < 300 && payload.fileId) {
          setFile({ id: payload.fileId, name: payload.filename ?? chosen.name });
        } else {
          setError(payload.error ?? 'That file could not be shared.');
        }
      } catch {
        setError('The server returned something unreadable.');
      }
    });
    request.addEventListener('error', () => {
      setPercent(null);
      setError('Upload failed. Check your connection.');
    });
    const body = new FormData();
    body.set('file', chosen);
    request.send(body);
  }, []);

  return (
    <form
      action={postMessageAction}
      onDragOver={(e) => {
        if (!canAttach) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!canAttach) return;
        e.preventDefault();
        setOver(false);
        const dropped = e.dataTransfer.files[0];
        if (dropped) send(dropped);
      }}
      className={cx(
        'space-y-3 border-b border-line px-5 py-4 transition-colors',
        over && 'bg-accent/5 ring-1 ring-inset ring-accent/40',
      )}
    >
      {hidden}
      {file ? <input type="hidden" name="fileId" value={file.id} /> : null}
      <label htmlFor="new-message" className="sr-only">
        Write a message
      </label>
      <Textarea
        id="new-message"
        name="body"
        required
        placeholder={
          canAttach
            ? 'Say something, or drop a file here to share it with the lab.'
            : 'Ask a question, flag something odd, or leave context for whoever picks this up.'
        }
      />

      {percent !== null ? (
        <p className="text-xs text-muted" role="status">
          Uploading… {percent}%
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-warn" role="alert">
          {error}
        </p>
      ) : null}
      {file ? (
        <p className="flex items-center gap-2 text-xs text-muted">
          <span className="truncate">Attached: {file.name}</span>
          <Button type="button" tone="ghost" size="sm" className="px-1" onClick={() => setFile(null)}>
            Remove
          </Button>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton tone="secondary" size="sm" pendingLabel="Posting…">
          Post message
        </SubmitButton>
        {canAttach ? (
          <>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const chosen = e.target.files?.[0];
                if (chosen) send(chosen);
                e.target.value = '';
              }}
            />
            <Button type="button" tone="ghost" size="sm" onClick={() => inputRef.current?.click()}>
              Attach a file
            </Button>
            <span className="text-xs text-subtle">or drop one anywhere in this box</span>
          </>
        ) : null}
      </div>
    </form>
  );
}

function Message({
  message,
  currentUserId,
  returnTo,
}: {
  message: DiscussionMessage;
  currentUserId: string;
  returnTo: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs text-subtle">
        <span>
          <span className="font-medium text-fg">{message.authorName ?? 'Unknown'}</span>{' '}
          · {formatDate(message.createdAt)}
        </span>
        {message.authorId === currentUserId ? (
          <form action={deleteMessageAction}>
            <input type="hidden" name="messageId" value={message.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <Button type="submit" tone="ghost" size="sm" className="px-1 text-xs">
              Delete
            </Button>
          </form>
        ) : null}
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{message.body}</p>
      {message.fileId && message.fileName ? (
        <a
          href={`/api/files/${message.fileId}`}
          className="mt-2 inline-flex max-w-full items-center gap-2 rounded-lg border border-line bg-raised px-3 py-2 text-xs hover:border-accent/50"
        >
          <span aria-hidden>📎</span>
          <span className="truncate font-medium">{message.fileName}</span>
          {message.fileSize !== null ? (
            <span className="shrink-0 text-subtle">{formatBytes(message.fileSize)}</span>
          ) : null}
        </a>
      ) : null}
    </div>
  );
}
