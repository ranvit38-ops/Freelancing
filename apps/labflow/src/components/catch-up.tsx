'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { catchUpAction, type CatchUpState } from '@/server/actions/ai';
import { SubmitButton } from './submit-button';

const empty: CatchUpState = {};

/** "Catch me up": LabBot's plain-language briefing on the whole lab. */
export function CatchUp({ configured }: { configured: boolean }) {
  const [state, action] = useFormState(catchUpAction, empty);
  if (!configured) {
    return (
      <p className="px-5 pb-5 text-sm text-muted">
        When LabBot is switched on, this writes you a one-page, plain-language briefing on everything
        the lab has recorded. Until then, the reading path below is the way in.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-3 px-5 pb-5">
      {state.briefing ? (
        <div className="whitespace-pre-wrap rounded-lg bg-raised px-4 py-3 text-sm leading-6">{state.briefing}</div>
      ) : (
        <p className="text-sm text-muted">
          A one-page briefing on what the lab works on, the words you will hear, what has been done, and who
          to ask. Written only from what the lab has recorded.
        </p>
      )}
      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      <div className="flex items-center gap-3">
        <SubmitButton size="sm" pendingLabel="Writing your briefing…">
          {state.briefing ? 'Write it again' : 'Catch me up'}
        </SubmitButton>
        <Elapsed />
      </div>
    </form>
  );
}

function Elapsed() {
  const { pending } = useFormStatus();
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!pending) return setSeconds(0);
    const started = Date.now();
    const id = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [pending]);
  return pending ? <span className="text-xs text-muted">{seconds}s</span> : null;
}
