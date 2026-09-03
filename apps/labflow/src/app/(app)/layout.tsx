import Link from 'next/link';
import { NavList, type NavItem } from '@/components/nav';
import { Button } from '@/components/ui';
import { logoutAction } from '@/server/actions/auth';
import { requireSession } from '@/server/authz';

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/projects', label: 'Projects' },
  { href: '/experiments', label: 'Experiments' },
  { href: '/samples', label: 'Samples' },
  { href: '/protocols', label: 'Protocols' },
  { href: '/updates', label: 'Research updates' },
  { href: '/search', label: 'Search' },
  { href: '/settings', label: 'Settings' },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  const identity = (
    <div className="border-t border-line px-3 py-3">
      <p className="truncate px-3 text-sm font-medium">{session.userName}</p>
      <p className="truncate px-3 text-xs text-muted">{session.userEmail}</p>
      <form action={logoutAction} className="mt-2 px-1">
        <Button type="submit" tone="ghost" size="sm" className="w-full justify-start">
          Log out
        </Button>
      </form>
    </div>
  );

  return (
    <div className="flex min-h-dvh flex-col bg-bg lg:flex-row">
      {/* Mobile: a native disclosure, so navigation works without client JS. */}
      <details className="group border-b border-line bg-surface lg:hidden">
        <summary className="flex h-14 cursor-pointer list-none items-center justify-between px-4">
          <span className="flex items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden className="h-5 w-5 rounded-md bg-accent" />
            LabFlow
          </span>
          <span className="text-sm text-muted group-open:hidden">Menu</span>
          <span className="hidden text-sm text-muted group-open:inline">Close</span>
        </summary>
        <nav aria-label="Main" className="px-3 pb-3">
          <NavList items={navItems} />
        </nav>
        {identity}
      </details>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="px-6 py-5">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden className="h-5 w-5 rounded-md bg-accent" />
            LabFlow
          </Link>
          <p className="mt-3 truncate text-xs text-muted" title={session.workspaceName}>
            {session.workspaceName}
          </p>
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3">
          <NavList items={navItems} />
        </nav>
        {identity}
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">{children}</div>
      </main>
    </div>
  );
}
