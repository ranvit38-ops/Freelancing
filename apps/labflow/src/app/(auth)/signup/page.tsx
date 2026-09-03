import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SignupForm } from '@/components/auth-forms';
import { Card } from '@/components/ui';
import { getSession } from '@/server/auth';

export const metadata = { title: 'Start a lab' };

export default async function SignupPage() {
  if (await getSession()) redirect('/dashboard');
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Start a lab</h1>
      <p className="mt-1.5 text-sm text-muted">
        Creates your account and a workspace for your research group.
      </p>
      <Card className="mt-6 p-6">
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
