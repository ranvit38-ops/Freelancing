'use client';

import { useActionState } from 'react';
import { deleteAccountAction } from '@/server/actions/auth';
import { deleteLabAction, leaveLabAction, removeMemberAction, setMemberRoleAction } from '@/server/actions/membership';
import { noState } from '@/server/actions/types';
import { Card, FormError, Input } from './ui';
import { SubmitButton } from './submit-button';

/** Role picker and Remove for one person, shown to those allowed to use them. */
export function MemberControls({
  userId,
  role,
  canChangeRole,
  canRemove,
  name,
}: {
  userId: string;
  role: string;
  canChangeRole: boolean;
  canRemove: boolean;
  name: string;
}) {
  const [roleState, roleAction] = useActionState(setMemberRoleAction, noState);
  const [removeState, removeAction] = useActionState(removeMemberAction, noState);
  const error = roleState.error ?? removeState.error;
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        {canChangeRole ? (
          <form action={roleAction}>
            <input type="hidden" name="userId" value={userId} />
            <label className="sr-only" htmlFor={`role-${userId}`}>
              Role for {name}
            </label>
            <select
              id={`role-${userId}`}
              name="role"
              defaultValue={role}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="h-7 rounded-md border border-line bg-surface px-1.5 text-xs"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
            </select>
          </form>
        ) : null}
        {canRemove ? (
          <form
            action={removeAction}
            onSubmit={(e) => {
              if (!window.confirm(`Remove ${name} from the lab? What they recorded stays.`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="userId" value={userId} />
            <SubmitButton tone="ghost" size="sm" className="px-1.5 text-xs" pendingLabel="Removing…">
              Remove
            </SubmitButton>
          </form>
        ) : null}
      </div>
      {error ? <p className="max-w-[16rem] text-right text-xs text-danger">{error}</p> : null}
      {!error && roleState.ok ? <p className="text-right text-xs text-ok">{roleState.message}</p> : null}
    </div>
  );
}

/** Leaving, deleting the lab, deleting the account. Each asks for proof it is meant. */
export function DangerZone({
  isOwner,
  labName,
  email,
  hasOtherLabs,
}: {
  isOwner: boolean;
  labName: string;
  email: string;
  hasOtherLabs: boolean;
}) {
  const [leaveState, leaveAction] = useActionState(leaveLabAction, noState);
  const [deleteLabState, deleteLab] = useActionState(deleteLabAction, noState);
  const [accountState, deleteAccount] = useActionState(deleteAccountAction, noState);

  return (
    <Card className="border-danger/30 p-5 lg:col-span-2">
      <h2 className="mb-1 text-sm font-semibold tracking-tight">Leave or delete</h2>
      <p className="mb-4 text-sm text-muted">
        These cannot be undone. Nothing here is ever used to train AI models, and deleted records and files are removed
        from the server straight away.
      </p>
      <div className="grid gap-5 md:grid-cols-3">
        <form action={leaveAction} className="space-y-2">
          <h3 className="text-sm font-medium">Leave {labName}</h3>
          <p className="text-xs text-muted">
            {hasOtherLabs
              ? 'You lose access. What you recorded stays with the lab.'
              : 'This is your only lab, so there is nowhere to go. Delete your account instead.'}
          </p>
          <FormError>{leaveState.error}</FormError>
          <SubmitButton tone="secondary" size="sm" disabled={!hasOtherLabs} pendingLabel="Leaving…">
            Leave this lab
          </SubmitButton>
        </form>

        {isOwner ? (
          <form action={deleteLab} className="space-y-2">
            <h3 className="text-sm font-medium">Delete {labName}</h3>
            <p className="text-xs text-muted">Every project, experiment, file, message and task in it, for everyone.</p>
            <label htmlFor="confirm-lab" className="sr-only">
              Type the lab name to confirm
            </label>
            <Input id="confirm-lab" name="confirm" placeholder={labName} autoComplete="off" />
            <FormError>{deleteLabState.error}</FormError>
            <SubmitButton tone="secondary" size="sm" disabled={!hasOtherLabs} pendingLabel="Deleting…">
              Delete this lab
            </SubmitButton>
            {!hasOtherLabs ? <p className="text-xs text-subtle">It is your only lab: deleting your account removes it.</p> : null}
          </form>
        ) : null}

        <form action={deleteAccount} className="space-y-2">
          <h3 className="text-sm font-medium">Delete my account</h3>
          <p className="text-xs text-muted">
            Labs where you are the only person are deleted with it. In shared labs, what you recorded stays.
          </p>
          <label htmlFor="confirm-account" className="sr-only">
            Type your email to confirm
          </label>
          <Input id="confirm-account" name="confirm" placeholder={email} autoComplete="off" />
          <FormError>{accountState.error}</FormError>
          <SubmitButton tone="secondary" size="sm" pendingLabel="Deleting…">
            Delete my account
          </SubmitButton>
        </form>
      </div>
    </Card>
  );
}
