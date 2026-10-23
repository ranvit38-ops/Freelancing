'use client';

import { useEffect, useRef } from 'react';
import { useFormState } from 'react-dom';
import { Card, CardHeader, Field, FormError, Input, Textarea } from './ui';
import { SubmitButton } from './submit-button';
import { createEventAction } from '@/server/actions/calendar';
import { noState } from '@/server/actions/types';

/**
 * Adding something to the lab calendar. Only a title and a day are needed.
 * The page keys this on the chosen day, so clicking a day on the grid starts
 * a fresh form with that date already in it.
 */
export function EventForm({ defaultDate }: { defaultDate: string }) {
  const [state, action] = useFormState(createEventAction, noState);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state]);

  return (
    <Card>
      <CardHeader title="Add to the calendar" description="Group meeting, instrument booking, a deadline." />
      <form ref={form} action={action} className="space-y-4 px-5 py-4">
        <FormError>{state.error}</FormError>
        {state.ok ? (
          <p role="status" className="rounded-lg border border-ok/25 bg-ok/5 px-3 py-2 text-sm text-ok">
            {state.message}
          </p>
        ) : null}
        <Field label="What" htmlFor="ev-title" error={state.fieldErrors?.title}>
          <Input id="ev-title" name="title" required maxLength={200} placeholder="Group meeting" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Day" htmlFor="ev-date" error={state.fieldErrors?.onDate}>
            <Input id="ev-date" name="onDate" type="date" required defaultValue={defaultDate} />
          </Field>
          <Field label="Time" htmlFor="ev-time" optional error={state.fieldErrors?.atTime}>
            <Input id="ev-time" name="atTime" type="time" />
          </Field>
        </div>
        <Field label="Notes" htmlFor="ev-notes" optional>
          <Textarea id="ev-notes" name="notes" rows={2} placeholder="Room 204. Maya presents." />
        </Field>
        <SubmitButton className="w-full" pendingLabel="Adding…">
          Add
        </SubmitButton>
      </form>
    </Card>
  );
}
