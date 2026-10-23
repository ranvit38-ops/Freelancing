'use client';

import { useState } from 'react';
import { Card, CardHeader } from './ui';
import { SubmitButton } from './submit-button';
import { createCalendarLinkAction } from '@/server/actions/calendar';

/**
 * Put the lab calendar into Google Calendar.
 *
 * A subscription, not a sync: Google fetches the lab's events and deadlines
 * from a private address and keeps checking back. It needs no Google
 * sign-in and no app review, and works the same for Apple and Outlook.
 */
export function CalendarSubscribe({ feedUrl }: { feedUrl: string | null }) {
  const [copied, setCopied] = useState(false);
  const webcal = feedUrl?.replace(/^https?:/, 'webcal:');
  const google = webcal ? `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}` : null;

  return (
    <Card>
      <CardHeader title="Show this in Google Calendar" description="Lab events and task deadlines, kept up to date." />
      <div className="space-y-3 px-5 pb-5 text-sm">
        {feedUrl && google ? (
          <>
            <a
              href={google}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg hover:opacity-90"
            >
              Add to Google Calendar
            </a>
            <p className="text-xs text-muted">
              Or in any calendar app choose <b>Add calendar → From URL</b> and paste:
            </p>
            <div className="flex gap-2">
              <input
                readOnly
                value={feedUrl}
                aria-label="Your private calendar address"
                onFocus={(e) => e.currentTarget.select()}
                className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-raised px-2 text-xs"
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(feedUrl);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 2000);
                  } catch {
                    // Clipboard blocked: the field is selectable by hand.
                  }
                }}
                className="h-9 shrink-0 rounded-lg border border-line px-3 text-xs font-medium hover:bg-raised"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-subtle">
              Keep this address private: anyone with it can see the lab calendar. Google checks for
              changes every few hours.
            </p>
            <form action={createCalendarLinkAction}>
              <SubmitButton tone="ghost" size="sm" pendingLabel="Replacing…">
                Make a new link (turns the old one off)
              </SubmitButton>
            </form>
          </>
        ) : (
          <form action={createCalendarLinkAction} className="space-y-3">
            <p className="text-muted">
              Get a private link, then add it to Google Calendar in one click. Meetings and deadlines
              added here will appear there by themselves.
            </p>
            <SubmitButton className="w-full" pendingLabel="Making your link…">
              Get my calendar link
            </SubmitButton>
          </form>
        )}
      </div>
    </Card>
  );
}
