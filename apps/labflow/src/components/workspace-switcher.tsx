'use client';

import { useActionState } from 'react';
import { Card, CardHeader, Field, FormError, Input } from './ui';
import { SubmitButton } from './submit-button';
import { createWorkspaceAction } from '@/server/actions/workspace';
import { noState } from '@/server/actions/types';
import { JoinPaste } from './join-paste';

export function CreateWorkspaceForm() {
  const [state, action] = useActionState(createWorkspaceAction, noState);
  return (
    <Card>
      <CardHeader
        title="Start another lab"
        description="A separate lab with its own people and records. Nothing crosses between labs."
      />
      <form action={action} className="space-y-4 px-5 py-4">
        <FormError>{state.error}</FormError>
        <Field label="Lab or research group" htmlFor="ws-name" error={state.fieldErrors?.name}>
          <Input id="ws-name" name="name" required placeholder="Coastal Sediments Group" />
        </Field>
        <Field label="Institution" htmlFor="ws-institution" optional>
          <Input id="ws-institution" name="institution" />
        </Field>
        <SubmitButton tone="secondary" size="sm" pendingLabel="Creating…">
          Create lab
        </SubmitButton>
      </form>
    </Card>
  );
}

/** Someone already signed in who was sent a link to a second lab. */
export function JoinAnotherLab() {
  return (
    <Card>
      <CardHeader
        title="Join another lab"
        description="Sent a join link to someone else's lab? Paste it here. You keep this lab too and can switch between them."
      />
      <div className="px-5 py-4">
        <JoinPaste id="join-another" />
      </div>
    </Card>
  );
}
