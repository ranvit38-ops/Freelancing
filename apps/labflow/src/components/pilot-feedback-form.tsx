'use client';

import { useFormState } from 'react-dom';
import { Field, FormError, Input, Select, Textarea } from './ui';
import { SubmitButton } from './submit-button';
import { submitPilotFeedbackAction } from '@/server/actions/pilot';
import { noState } from '@/server/actions/types';

type Existing = {
  wouldPay: string;
  monthlyValue: number | null;
  blocker: string | null;
  decisionMaker: string | null;
} | null;

/**
 * The four questions worth asking a lab that has actually used this.
 *
 * Only the first is required. A researcher who picks one radio button and
 * closes the tab has still answered the question the pilot exists for, and
 * demanding the other three is how you turn that into no answer at all.
 *
 * It comes back filled in, because the answer that counts is the one given
 * after two weeks of use, not the one given on day one.
 */
export function PilotFeedbackForm({ existing }: { existing: Existing }) {
  const [state, action] = useFormState(submitPilotFeedbackAction, noState);

  return (
    <form action={action} className="space-y-4 px-5 py-4">
      <FormError>{state.error}</FormError>
      {state.ok ? (
        <p role="status" className="rounded-lg border border-ok/25 bg-ok/5 px-3 py-2 text-sm text-ok">
          {state.message}
        </p>
      ) : null}
      {existing && !state.ok ? (
        <p className="text-xs text-subtle">
          You answered this before. Changing your mind is useful, so edit it freely.
        </p>
      ) : null}

      <Field
        label="If this stopped being free, would your lab pay for it?"
        htmlFor="would-pay"
        error={state.fieldErrors?.wouldPay}
      >
        <Select id="would-pay" name="wouldPay" defaultValue={existing?.wouldPay ?? ''} required>
          <option value="" disabled>
            Choose one
          </option>
          <option value="yes">Yes, we would pay for this</option>
          <option value="maybe">Not sure yet</option>
          <option value="no">No, we would not</option>
        </Select>
      </Field>

      <Field
        label="What would it be worth per month, to the whole lab?"
        htmlFor="monthly-value"
        hint="A number is more useful than a polite answer. Zero is a real answer too."
        optional
      >
        <Input
          id="monthly-value"
          name="monthlyValue"
          inputMode="numeric"
          defaultValue={existing?.monthlyValue ?? ''}
          placeholder="e.g. 60"
        />
      </Field>

      <Field
        label="What is the one thing that would stop you?"
        htmlFor="blocker"
        hint="The missing feature, the habit it fights, the person who would say no."
        optional
      >
        <Textarea id="blocker" name="blocker" defaultValue={existing?.blocker ?? ''} />
      </Field>

      <Field
        label="Who decides whether your lab buys software?"
        htmlFor="decision-maker"
        hint="The PI, a department administrator, a grant, or nobody in particular."
        optional
      >
        <Input
          id="decision-maker"
          name="decisionMaker"
          defaultValue={existing?.decisionMaker ?? ''}
        />
      </Field>

      <SubmitButton pendingLabel="Sending…">{existing ? 'Update my answer' : 'Send'}</SubmitButton>
    </form>
  );
}
