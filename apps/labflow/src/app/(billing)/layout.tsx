import Link from 'next/link';
import { Button, ButtonLink } from '@/components/ui';
import { logoutAction } from '@/server/actions/auth';
import { requireSession } from '@/server/authz';

/**
 * A deliberately ungated shell.
 *
 * Billing lives here so a workspace whose plan has lapsed can still reach the
 * page where it would pay. Locking someone out of that page is the one mistake
 * that guarantees they never come back.
 */
export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden className="h-5 w-5 rounded-md bg-accent" />
            Labvia
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted sm:inline">{session.workspaceName}</span>
            {/* The logo was the only way back, and nobody reads a logo as a
                button: people logged out to escape this page. */}
            <ButtonLink href="/dashboard" size="sm">
              ← Back to your lab
            </ButtonLink>
            <form action={logoutAction}>
              <Button type="submit" tone="ghost" size="sm">
                Log out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">
        {children}
        <p className="mt-10 text-center">
          <Link href="/dashboard" className="text-sm font-medium text-accent underline-offset-2 hover:underline">
            ← Back to your lab
          </Link>
        </p>
      </main>
    </div>
  );
}
