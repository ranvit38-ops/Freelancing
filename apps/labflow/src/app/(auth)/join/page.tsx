import Link from 'next/link';
import { createHash } from 'node:crypto';
import { JoinLabForm, LoginForm, SignupForm } from '@/components/auth-forms';
import { GoogleButton } from '@/components/google-button';
import { Card, cx } from '@/components/ui';
import { getSession, type SessionContext } from '@/server/auth';
import { switchAccountForJoinAction } from '@/server/actions/auth';
import { joinWouldBeRefused } from '@/server/join';
import { findInviteByToken, findWorkspaceByJoinCode, isMember } from '@/server/queries';

export const metadata = { title: 'Join a lab' };
export const dynamic = 'force-dynamic';

/**
 * Where a join link or an emailed invitation lands.
 *
 * Signed out → they either create an account or log in to the one they have,
 * and either way the link rides along so they finish inside the lab.
 * Signed in → they see who they are signed in as and press Join. Nothing
 * happens without that press: joining on page load could not switch them into
 * the lab, so it looked like the link had done nothing.
 */
export default async function JoinPage({
  searchParams,
}: {
  searchParams: { token?: string; code?: string; have?: string };
}) {
  const code = searchParams.code ?? '';
  const token = code ? '' : (searchParams.token ?? '');
  const haveAccount = searchParams.have === '1';

  const target: { id: string; name: string; email?: string } | null = code
    ? await findWorkspaceByJoinCode(code)
    : token
      ? await findInviteByToken(createHash('sha256').update(token).digest('hex')).then((invite) =>
          invite ? { id: invite.workspaceId, name: invite.workspaceName, email: invite.email } : null,
        )
      : null;

  if (!target) {
    return (
      <>
        <h1 className="text-xl font-semibold tracking-tight">
          {code ? 'This join link is not valid' : 'This invitation is not valid'}
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          It may have been switched off, used already, or replaced with a new one. Ask whoever sent
          it to you for a fresh link.
        </p>
        <p className="mt-6 text-sm text-muted">
          <Link href="/login" className="underline underline-offset-2">
            Go to login
          </Link>
        </p>
      </>
    );
  }

  const session = await getSession();
  if (session) return <SignedIn session={session} lab={target} code={code} token={token} />;

  const base = code ? `/join?code=${encodeURIComponent(code)}` : `/join?token=${encodeURIComponent(token)}`;

  return (
    <>
      <p className="text-sm font-medium text-accent">You&rsquo;re invited</p>
      <h1 className="mt-1 text-xl font-semibold tracking-tight">Join {target.name}</h1>
      <p className="mt-1.5 text-sm text-muted">
        {haveAccount
          ? 'Log in and you will be added to the lab straight away.'
          : 'Make an account and you will be added to the lab straight away.'}
      </p>

      <div role="tablist" aria-label="New or returning" className="mt-6 grid grid-cols-2 gap-1 rounded-lg border border-line bg-raised p-1 text-sm">
        <TabLink href={base} active={!haveAccount}>
          I&rsquo;m new here
        </TabLink>
        <TabLink href={`${base}&have=1`} active={haveAccount}>
          I have an account
        </TabLink>
      </div>

      <Card className="mt-3 space-y-4 p-6">
        <GoogleButton joinCode={code || undefined} invite={token || undefined} />
        {haveAccount ? (
          <LoginForm joinCode={code || undefined} inviteToken={token || undefined} />
        ) : (
          <SignupForm joinCode={code || undefined} inviteToken={token || undefined} invitedEmail={target.email} />
        )}
      </Card>
    </>
  );
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      replace
      className={cx(
        'rounded-md px-3 py-1.5 text-center font-medium transition-colors',
        active ? 'bg-surface text-accent shadow-sm ring-1 ring-accent/40' : 'text-muted hover:text-fg',
      )}
    >
      {children}
    </Link>
  );
}

async function SignedIn({
  session,
  lab,
  code,
  token,
}: {
  session: SessionContext;
  lab: { id: string; name: string };
  code: string;
  token: string;
}) {
  const already = await isMember(lab.id, session.userId);
  // Asked before they press anything, so a full lab is explained up front
  // rather than after a button that looked like it would work.
  const full = !already && code ? await joinWouldBeRefused(lab.id) : false;

  return (
    <>
      <p className="text-sm font-medium text-accent">{already ? 'Welcome back' : 'You’re invited'}</p>
      <h1 className="mt-1 text-xl font-semibold tracking-tight">
        {already ? `You’re already in ${lab.name}` : `Join ${lab.name}`}
      </h1>
      <p className="mt-1.5 text-sm text-muted">
        {already
          ? 'This is the link to send to the rest of your lab. Anyone who opens it can join.'
          : full
            ? `${lab.name} has used all of its seats, so this link cannot add anyone else right now. Ask whoever runs the lab.`
            : 'One click and you are in. Everything the lab has shared will be waiting.'}
      </p>

      <Card className="mt-6 space-y-4 p-6">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/10 text-sm font-semibold text-accent"
          >
            {(session.userName || session.userEmail).slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 text-sm">
            <span className="block text-xs text-muted">Signed in as</span>
            <span className="block truncate font-medium">{session.userName}</span>
            <span className="block truncate text-xs text-muted">{session.userEmail}</span>
          </span>
        </div>
        {full ? null : (
          <JoinLabForm
            joinCode={code || undefined}
            inviteToken={token || undefined}
            label={already ? `Open ${lab.name}` : `Join ${lab.name}`}
          />
        )}
      </Card>

      <form action={switchAccountForJoinAction} className="mt-6 text-center text-sm text-muted">
        {code ? <input type="hidden" name="joinCode" value={code} /> : null}
        {token ? <input type="hidden" name="inviteToken" value={token} /> : null}
        Not you?{' '}
        <button type="submit" className="font-medium text-fg underline underline-offset-2">
          Use a different account
        </button>
      </form>
    </>
  );
}
