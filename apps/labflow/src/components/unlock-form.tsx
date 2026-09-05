'use client';

import { useFormState } from 'react-dom';
import { Card, CardHeader, Field, FormError, Input } from './ui';
import { SubmitButton } from './submit-button';
import { redeemOwnerCodeAction } from '@/server/actions/unlock';
import { noState } from '@/server/actions/types';

/** Shown only when the deployment has an owner code configured. */
export function UnlockForm() {
  const [state, action] = useFormState(redeemOwnerCodeAction, noState);
  return (
    <Card>
      <CardHeader title="Owner code" description="Redeem a code to comp this workspace." />
      <form action={action} className="space-y-3 px-5 py-4">
        <FormError>{state.error}</FormError>
        {state.ok ? (
          <p role="status" className="text-sm text-ok">
            {state.message}
          </p>
        ) : null}
        <Field label="Code" htmlFor="owner-code">
          <Input id="owner-code" name="code" type="password" autoComplete="off" required />
        </Field>
        <SubmitButton tone="secondary" size="sm" pendingLabel="Checking…">
          Redeem
        </SubmitButton>
      </form>
    </Card>
  );
}
