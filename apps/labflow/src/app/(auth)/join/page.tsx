import Link from 'next/link';
import { createHash } from 'node:crypto';
import { redirect } from 'next/navigation';
import { SignupForm } from '@/components/auth-forms';
import { Card } from '@/components/ui';
import { getSession } from '@/server/auth';
import { acceptInvite, findInviteByToken } from '@/server/queries';

export const metadata = { title: 'Join a lab' };
export const dynamic = 'force-dynamic';

/**
 * The invite landing page.
 *
 * Signed in already → the membership is added and they go straight through.
 * Not signed in → they sign up, and the token rides along on the form so the
 * new account joins the inviting workspace instead of creating an empty one.
 */
export default async function JoinPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token ?? '';
  const invite = token
    ? await findInviteByToken(createHash('sha256').update(token).digest('hex'))
    : null;

  if (!invite) {
    return (
      <>
        <h1 className="text-xl font-semibold tracking-tight">This invitation is not valid</h1>
        <p className="mt-1.5 text-sm text-muted">
          It may have already been used, or expired. Ask whoever invited you to send a new one.
        </p>
        <p className="mt-6 text-sm text-muted">
          <Link href="/login" className="underline underline-offset-2">
            Back to login
          </Link>
        </p>
      </>
    );
  }

  const session = await getSession();
  if (session) {
    await acceptInvite(invite.id, invite.workspaceId, session.userId, invite.role);
    redirect('/dashboard');
  }

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight">Join {invite.workspaceName}</h1>
      <p className="mt-1.5 text-sm text-muted">
        You were invited as {invite.role === 'admin' ? 'an admin' : 'a member'}. Create your account
        and you will land in that lab.
      </p>
      <Card className="mt-6 p-6">
        <SignupForm inviteToken={token} invitedEmail={invite.email} />
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link
          href={`/login?invite=${encodeURIComponent(token)}`}
          className="font-medium text-fg underline underline-offset-2"
        >
          Log in to accept
        </Link>
      </p>
    </>
  );
}
