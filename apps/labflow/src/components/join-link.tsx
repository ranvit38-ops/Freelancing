'use client';

import { useState } from 'react';
import { Card, CardHeader } from './ui';
import { setJoinLinkAction } from '@/server/actions/invites';

/**
 * One link the whole lab joins with.
 *
 * Shown next to the per-person invitation on purpose: they answer different
 * questions. An invitation is how you add one named collaborator with a role.
 * This is how a PI gets nine people in without typing nine addresses, which is
 * the difference between the lab trying this and two people trying it.
 *
 * The link is readable on screen and copied with one button, because the way
 * it actually travels is pasted into a group chat.
 */
export function JoinLink({ link, canManage }: { link: string | null; canManage: boolean }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is refused in some browsers and over plain http. The
      // link is on screen and selectable, so this costs a convenience, not the
      // feature.
      setCopied(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Join link"
        description="Anyone with this link can join the lab. Share it in your group chat."
      />
      <div className="space-y-3 px-5 py-4">
        {link ? (
          <>
            <div className="flex gap-2">
              <input
                readOnly
                value={link}
                aria-label="Join link"
                onFocus={(e) => e.currentTarget.select()}
                className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-raised px-3 font-mono text-xs text-fg"
              />
              <button
                type="button"
                onClick={copy}
                className="h-9 shrink-0 rounded-lg border border-line bg-surface px-3 text-sm font-medium transition-colors hover:bg-raised"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-subtle">
              Seats on your plan still apply, so the link stops letting people in once the lab is
              full. Replacing it locks out everyone still holding the old one.
            </p>
            {canManage ? (
              <form action={setJoinLinkAction} className="flex gap-2">
                <button
                  name="mode"
                  value="rotate"
                  className="h-8 rounded-lg border border-line px-3 text-xs font-medium transition-colors hover:bg-raised"
                >
                  Replace link
                </button>
                <button
                  name="mode"
                  value="off"
                  className="h-8 rounded-lg border border-line px-3 text-xs font-medium text-muted transition-colors hover:bg-raised hover:text-fg"
                >
                  Switch off
                </button>
              </form>
            ) : null}
          </>
        ) : (
          <>
            <p className="text-sm text-muted">
              No join link yet. Turn one on and anyone you send it to can join without being
              invited individually.
            </p>
            {canManage ? (
              <form action={setJoinLinkAction}>
                <button
                  name="mode"
                  value="rotate"
                  className="h-9 rounded-lg bg-brand px-3 text-sm font-medium text-brand-fg transition-opacity hover:opacity-90"
                >
                  Create a join link
                </button>
              </form>
            ) : (
              <p className="text-xs text-subtle">Ask an owner or admin to turn one on.</p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
