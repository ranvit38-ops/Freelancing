import Link from 'next/link';
import { ResetPasswordForm } from '@/components/auth-forms';
import { Card } from '@/components/ui';

export const metadata = { title: 'Choose a new password' };

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams.token ?? '';
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Choose a new password</h1>
      <Card className="mt-6 p-6">
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <p className="text-sm text-muted">
            This link is missing its reset token.{' '}
            <Link href="/forgot-password" className="underline underline-offset-2">
              Request a new one
            </Link>
            .
          </p>
        )}
      </Card>
    </>
  );
}
