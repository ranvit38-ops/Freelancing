import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SignupForm } from '@/components/auth-forms';
import { GoogleButton } from '@/components/google-button';
import { Card } from '@/components/ui';
import { getSession } from '@/server/auth';
import { PILOT_PLAN, pilotMode } from '@/lib/pilot';
import { PLANS } from '@/lib/plans';

export const metadata = { title: 'Start a lab' };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  if (await getSession()) redirect('/dashboard');
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Start a lab</h1>
      <p className="mt-1.5 text-sm text-muted">
        Creates your account and a workspace for your research group.
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
      <Card className="mt-6 space-y-4 p-6">
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
