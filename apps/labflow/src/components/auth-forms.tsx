'use client';

import Link from 'next/link';
import { useFormState } from 'react-dom';
import { Field, FormError, Input } from './ui';
import { SubmitButton } from './submit-button';
import {
  loginAction,
  requestPasswordResetAction,
  resetPasswordAction,
  signupAction,
} from '@/server/actions/auth';
import { noState } from '@/server/actions/types';

export function LoginForm({ inviteToken }: { inviteToken?: string }) {
  const [state, action] = useFormState(loginAction, noState);
  return (
    <form action={action} className="space-y-4">
      {inviteToken ? <input type="hidden" name="inviteToken" value={inviteToken} /> : null}
      <FormError>{state.error}</FormError>
      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <Field label="Password" htmlFor="password" error={state.fieldErrors?.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton className="w-full" pendingLabel="Logging in…">
        Log in
      </SubmitButton>
      <p className="text-center text-sm text-muted">
        <Link href="/forgot-password" className="underline underline-offset-2 hover:text-fg">
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}

export function SignupForm({
  inviteToken,
  invitedEmail,
}: {
  inviteToken?: string;
  invitedEmail?: string;
}) {
  const [state, action] = useFormState(signupAction, noState);
  return (
    <form action={action} className="space-y-4">
      {inviteToken ? <input type="hidden" name="inviteToken" value={inviteToken} /> : null}
      <FormError>{state.error}</FormError>
      <Field label="Your name" htmlFor="name" error={state.fieldErrors?.name}>
        <Input id="name" name="name" autoComplete="name" required autoFocus />
      </Field>
      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={invitedEmail}
          required
        />
      </Field>
      <Field
        label="Password"
        htmlFor="password"
        hint="At least 10 characters."
        error={state.fieldErrors?.password}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </Field>
      <Field
        label="Lab or research group"
        htmlFor="workspaceName"
        hint="This becomes your workspace. Everyone you invite shares it."
        error={state.fieldErrors?.workspaceName}
      >
        <Input
          id="workspaceName"
          name="workspaceName"
          placeholder="Smith Environmental Research Lab"
          required
        />
      </Field>
      <Field label="Institution" htmlFor="institution" optional error={state.fieldErrors?.institution}>
        <Input id="institution" name="institution" placeholder="University of Somewhere" />
      </Field>
      <SubmitButton className="w-full" pendingLabel="Creating your lab…">
        Start a lab
      </SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useFormState(requestPasswordResetAction, noState);
  if (state.ok) {
    return (
      <p className="rounded-lg border border-line bg-raised px-4 py-3 text-sm text-muted">
        {state.message}
      </p>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <FormError>{state.error}</FormError>
      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <SubmitButton className="w-full" pendingLabel="Sending…">
        Send reset link
      </SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useFormState(resetPasswordAction, noState);
  if (state.ok) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-ok/25 bg-ok/5 px-4 py-3 text-sm text-ok">
          {state.message}
        </p>
        <Link href="/login" className="text-sm underline underline-offset-2">
          Go to login
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormError>{state.error}</FormError>
      <Field
        label="New password"
        htmlFor="password"
        hint="At least 10 characters."
        error={state.fieldErrors?.password}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
          autoFocus
        />
      </Field>
      <SubmitButton className="w-full" pendingLabel="Updating…">
        Set new password
      </SubmitButton>
    </form>
  );
}
