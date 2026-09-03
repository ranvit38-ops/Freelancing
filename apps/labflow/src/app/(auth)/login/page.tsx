import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth-forms';
import { Card } from '@/components/ui';
import { getSession } from '@/server/auth';

export const metadata = { title: 'Log in' };

export default async function LoginPage() {
  if (await getSession()) redirect('/dashboard');
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Log in to LabFlow</h1>
      <p className="mt-1.5 text-sm text-muted">Pick up where your lab left off.</p>
      <Card className="mt-6 p-6">
        <LoginForm />
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        New here?{' '}
        <Link href="/signup" className="font-medium text-fg underline underline-offset-2">
          Start a lab
        </Link>
      </p>
    </>
  );
}
