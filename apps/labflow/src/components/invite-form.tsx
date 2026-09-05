'use client';

import { useFormState } from 'react-dom';
import { Card, CardHeader, Field, FormError, Input, Select } from './ui';
import { SubmitButton } from './submit-button';
import { inviteMemberAction } from '@/server/actions/invites';
import { noState } from '@/server/actions/types';

export function InviteForm({ canInvite }: { canInvite: boolean }) {
  const [state, action] = useFormState(inviteMemberAction, noState);

  return (
    <Card>
      <CardHeader
        title="Invite someone"
        description="They join this workspace and see everything in it."
      />
      {canInvite ? (
        <form action={action} className="space-y-4 px-5 py-4">
          <FormError>{state.error}</FormError>
          {state.ok ? (
            <p
              role="status"
              className="break-words rounded-lg border border-ok/25 bg-ok/5 px-3 py-2 text-sm text-ok"
            >
              {state.message}
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
            <Field label="Email" htmlFor="invite-email" error={state.fieldErrors?.email}>
              <Input id="invite-email" name="email" type="email" required placeholder="name@university.edu" />
            </Field>
            <Field label="Role" htmlFor="invite-role">
              <Select id="invite-role" name="role" defaultValue="member">
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
            <SubmitButton tone="secondary" size="sm" pendingLabel="Inviting…">
              Send invite
            </SubmitButton>
          </div>
          <p className="text-xs text-subtle">
            Members can record and edit everything. Admins can also invite people.
          </p>
        </form>
      ) : (
        <p className="px-5 py-4 text-sm text-muted">
          Only an owner or admin can invite people to this workspace.
        </p>
      )}
    </Card>
  );
}
