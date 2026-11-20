import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SignupForm } from '@/components/auth-forms';
import { GoogleButton } from '@/components/google-button';
import { JoinPaste } from '@/components/join-paste';
import { Card } from '@/components/ui';
import { getSession } from '@/server/auth';
import { PILOT_PLAN, pilotMode } from '@/lib/pilot';
import { PLANS } from '@/lib/plans';

export const metadata = { title: 'Create your account' };

export default async function SignupPage(
  props: {
    searchParams: Promise<{ error?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  if (await getSession()) redirect('/dashboard');
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1.5 text-sm text-muted">
        Join your lab with the link they sent you, or start a new lab for your research group.
      </p>
      {/* The moment a PI decides whether to bother. Saying the pilot terms here
          removes the "is this going to ask for a card" hesitation, which is the
          most common reason a signup is abandoned halfway. */}
      {pilotMode() ? (
        <p className="mt-3 rounded-lg border border-accent/25 bg-accent/5 px-4 py-3 text-sm leading-6 text-accent">
          You are joining a free pilot. Your lab gets the {PLANS[PILOT_PLAN].name} plan, which is
          every feature for up to {PLANS[PILOT_PLAN].seats} people, at no cost and with no end date.
          No card is asked for at any point.
        </p>
      ) : null}
      {/* Students are told "sign up for Labquill" and arrive here, not on the
          join link. Starting a lab of their own by mistake leaves them in an
          empty workspace, so the other road is offered before the form. */}
      <Card className="mt-6 p-5">
        <p className="text-sm font-semibold">Joining a lab that already uses Labquill?</p>
        <p className="mt-0.5 mb-3 text-xs text-muted">
          Ask whoever runs it for the join link (it is on their Team page), then paste it here.
        </p>
        <JoinPaste id="signup-join" />
      </Card>
      <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-subtle">Or start a new lab</p>
      <Card className="mt-2 space-y-4 p-6">
        <GoogleButton error={searchParams.error} />
        <SignupForm />
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-fg underline underline-offset-2">
          Log in
        </Link>
      </p>
    </>
  );
}
