'use client';

import { useState } from 'react';
import { Button, Card, CardHeader, EmptyState, Textarea } from './ui';
import { SubmitButton } from './submit-button';
import { deleteMessageAction, postMessageAction } from '@/server/actions/collab';
import { formatDate } from '@/lib/display';
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
  currentUserId,
  returnTo,
}: {
  messages: DiscussionMessage[];
  experimentId?: string;
  projectId?: string;
  currentUserId: string;
  returnTo: string;
}) {
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const count = messages.reduce((n, m) => n + 1 + m.replies.length, 0);

  const hidden = (
    <>
      {experimentId ? <input type="hidden" name="experimentId" value={experimentId} /> : null}
      {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}
    </>
  );

  return (
    <Card>
      <CardHeader title="Discussion" description={`${count} message${count === 1 ? '' : 's'}`} />

      <form action={postMessageAction} className="space-y-3 border-b border-line px-5 py-4">
        {hidden}
        <label htmlFor="new-message" className="sr-only">
          Write a message
        </label>
        <Textarea
          id="new-message"
          name="body"
          required
          placeholder="Ask a question, flag something odd, or leave context for whoever picks this up."
        />
        <SubmitButton tone="secondary" size="sm" pendingLabel="Posting…">
          Post message
        </SubmitButton>
      </form>

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
    </div>
  );
}
