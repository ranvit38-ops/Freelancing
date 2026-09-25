'use client';

import { useFormState } from 'react-dom';
import { AudiencePicker, useAudience, type AudienceKind, type Member } from './audience-picker';
import { SubmitButton } from './submit-button';
import { shareFileAction } from '@/server/actions/sharing';
import { noState } from '@/server/actions/types';

/** "Share" on one of your own files: pick who it is for, and they are told. */
export function FileShare({
  fileId,
  members,
  current,
  sharedWith,
}: {
  fileId: string;
  members: Member[];
  current: AudienceKind;
  sharedWith: string[];
}) {
  const [state, action] = useFormState(shareFileAction, noState);
  const audience = useAudience(current, sharedWith);
  return (
    <details className="group shrink-0">
      <summary className="cursor-pointer list-none rounded-lg border border-line px-2.5 py-1 text-xs font-medium hover:bg-raised">
        Share
      </summary>
      <form action={action} className="mt-2 w-[min(28rem,80vw)] space-y-3 rounded-xl border border-line bg-surface p-3 shadow-lg">
        <input type="hidden" name="fileId" value={fileId} />
        <AudiencePicker
          members={members}
          value={audience.value}
          onChange={audience.setValue}
          chosen={audience.chosen}
          onChoose={audience.setChosen}
        />
        {state.error ? <p className="text-xs text-danger">{state.error}</p> : null}
        {state.message ? <p className="text-xs text-ok">{state.message}</p> : null}
        <SubmitButton size="sm" pendingLabel="Sharing…">
          Share
        </SubmitButton>
      </form>
    </details>
  );
}
