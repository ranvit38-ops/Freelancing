'use client';

import { useActionState } from 'react';
import { KIND_LABEL, NOTIFY_KINDS, PACE_LABEL, type NotifyKind, type Pace } from '@/lib/notify';
import { saveNotifyPrefsAction } from '@/server/actions/notifications';
import { noState } from '@/server/actions/types';
import { SubmitButton } from './submit-button';
import { FormError } from './ui';

/** How often email may come, and about what. Yours, across all your labs. */
export function NotifyPrefs({ pace, kinds, mailReady }: { pace: Pace; kinds: NotifyKind[]; mailReady: boolean }) {
  const [state, action] = useActionState(saveNotifyPrefsAction, noState);
  return (
    <form action={action} className="space-y-4">
      <FormError>{state.error}</FormError>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Email me</legend>
        <div className="space-y-1.5">
          {(Object.keys(PACE_LABEL) as Pace[]).map((p) => (
            <label key={p} className="flex items-center gap-2 text-sm">
              <input type="radio" name="pace" value={p} defaultChecked={pace === p} className="h-4 w-4 accent-[rgb(var(--lf-accent))]" />
              {PACE_LABEL[p]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">About</legend>
        <div className="space-y-1.5">
          {NOTIFY_KINDS.map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="kinds" value={k} defaultChecked={kinds.includes(k)} className="h-4 w-4 accent-[rgb(var(--lf-accent))]" />
              {KIND_LABEL[k]}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-muted">
        One email holds everything you have not seen, and it waits a few minutes first, so anything you read in the app
        is never emailed. Every notification also shows on the Notifications page, whatever you pick here.
        {mailReady ? '' : ' Email is not set up on this deployment yet, so for now they only show in the app.'}
      </p>
      <div className="flex items-center gap-3">
        <SubmitButton size="sm" tone="secondary" pendingLabel="Saving…">
          Save
        </SubmitButton>
        {state.ok ? (
          <p role="status" className="text-sm text-ok">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
