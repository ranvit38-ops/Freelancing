'use client';

import { useFormState } from 'react-dom';
import { Card, CardHeader, Field, FormError, Input } from './ui';
import { SubmitButton } from './submit-button';
import { createWorkspaceAction } from '@/server/actions/workspace';
import { noState } from '@/server/actions/types';

export function CreateWorkspaceForm() {
  const [state, action] = useFormState(createWorkspaceAction, noState);
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
