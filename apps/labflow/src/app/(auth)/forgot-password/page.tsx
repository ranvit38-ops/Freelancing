import Link from 'next/link';
import { ForgotPasswordForm } from '@/components/auth-forms';
import { Card } from '@/components/ui';

export const metadata = { title: 'Reset your password' };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-1.5 text-sm text-muted">
        We&rsquo;ll email you a link to choose a new one.
      </p>
      <Card className="mt-6 p-6">
        <ForgotPasswordForm />
      </Card>
      {/* SETUP REQUIRED: no email provider is configured, so the link is written
          to the server log instead of being delivered. */}
      <p className="mt-4 rounded-lg border border-warn/25 bg-warn/5 px-4 py-3 text-xs text-warn">
        Email delivery is not configured on this deployment yet. Reset links are written to the
        server log rather than sent.
      </p>
      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/login" className="underline underline-offset-2">
          Back to login
        </Link>
      </p>
    </>
  );
}
