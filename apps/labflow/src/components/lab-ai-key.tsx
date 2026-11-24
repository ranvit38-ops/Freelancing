'use client';

import { useActionState } from 'react';
import { Field, FormError, Input } from './ui';
import { SubmitButton } from './submit-button';
import { removeLabAiKeyAction, saveLabAiKeyAction } from '@/server/actions/ai-key';
import { noState } from '@/server/actions/types';

/** Add, replace or remove the lab's own Claude key. Owners and admins only. */
export function LabAiKeyForm({ hint, readable }: { hint: string | null; readable: boolean }) {
  const [saved, save] = useActionState(saveLabAiKeyAction, noState);
  const [removed, remove] = useActionState(removeLabAiKeyAction, noState);
  const message = saved.ok ? saved.message : removed.ok ? removed.message : null;
  return (
    <div className="space-y-3">
      {message ? (
        <p role="status" className="text-sm text-ok">
          {message}
        </p>
      ) : null}
      <FormError>{saved.error ?? removed.error}</FormError>
      {hint && !readable ? (
        <p className="text-sm text-warn">
          The saved key ending {hint} can no longer be read, because the site&rsquo;s encryption setting changed. Add it
          again.
        </p>
      ) : null}
      <form action={save} className="space-y-3">
        <Field
          label={hint ? 'Replace the key' : "Your lab's Anthropic API key"}
          htmlFor="lab-ai-key"
          error={saved.fieldErrors?.apiKey}
          hint="From console.anthropic.com → API keys. A Claude.ai Pro or Max subscription is separate from the API and cannot be connected here."
        >
          <Input id="lab-ai-key" name="apiKey" type="password" autoComplete="off" spellCheck={false} placeholder="sk-ant-…" required />
        </Field>
        <SubmitButton size="sm" pendingLabel="Checking with Anthropic…">
          {hint ? 'Check and replace' : 'Check and save'}
        </SubmitButton>
      </form>
      {hint ? (
        <form action={remove}>
          <SubmitButton size="sm" tone="secondary" pendingLabel="Removing…">
            Remove the key ending {hint}
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
