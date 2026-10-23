'use client';

import { useFormState } from 'react-dom';
import { Badge, Card, FormError } from './ui';
import { SubmitButton } from './submit-button';
import { sendTestEmailAction } from '@/server/actions/email';
import { noState } from '@/server/actions/types';

export function EmailCheck({
  problem,
  testSender,
  from,
  you,
}: {
  problem: string | null;
  testSender: boolean;
  from: string | null;
  you: string;
}) {
  const [state, action] = useFormState(sendTestEmailAction, noState);

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-sm font-semibold tracking-tight">Email</h2>
      <p className="mb-4 text-sm text-muted">
        Invitations, password resets and sign-up confirmations go out through Resend.
      </p>
      {problem ? (
        <div className="mb-4 rounded-lg border border-warn/25 bg-warn/5 px-4 py-3 text-sm text-warn">
          Not set up: {problem} Until it is, invitations show a link to send yourself and no
          confirmations are sent.
        </div>
      ) : (
        <div className="mb-4 space-y-2 text-sm">
          <p className="flex flex-wrap items-center gap-2">
            <Badge tone="ok">Configured</Badge>
            <span className="break-all text-muted">Sending as {from}</span>
          </p>
          {testSender ? (
            <p className="rounded-lg border border-warn/25 bg-warn/5 px-4 py-3 text-warn">
              This is Resend&rsquo;s test sender. It only delivers to the address that owns the
              Resend account, so nobody else in the lab will get anything. Verify a domain in
              Resend and send from an address on it before inviting people by email.
            </p>
          ) : null}
        </div>
      )}
      <form action={action} className="space-y-3">
        <FormError>{state.error}</FormError>
        {state.ok ? (
          <p
            role="status"
            className="break-words rounded-lg border border-ok/25 bg-ok/5 px-3 py-2 text-sm text-ok"
          >
            {state.message}
          </p>
        ) : null}
        <SubmitButton tone="secondary" size="sm" pendingLabel="Sending…">
          Send a test email to {you}
        </SubmitButton>
      </form>
    </Card>
  );
}
