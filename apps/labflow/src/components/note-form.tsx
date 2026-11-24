'use client';

import { useRef } from 'react';
import { Textarea } from './ui';
import { SubmitButton } from './submit-button';
import { addNoteAction } from '@/server/actions/records';

/**
 * Adds a note to the run's log and empties the box once it is saved.
 * Left full, the next tap posts the same note twice.
 */
export function NoteForm({ experimentId }: { experimentId: string }) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      action={async (data) => {
        await addNoteAction(data);
        ref.current?.reset();
      }}
      className="space-y-3 px-5 py-4"
    >
      <input type="hidden" name="experimentId" value={experimentId} />
      <label htmlFor="note-body" className="sr-only">
        Add a note
      </label>
      <Textarea
        id="note-body"
        name="body"
        required
        placeholder="10:40 added 200 µL crystal violet to every well…"
      />
      <SubmitButton tone="secondary" size="sm" pendingLabel="Adding…">
        Add note
      </SubmitButton>
    </form>
  );
}
