import Link from 'next/link';
import { NavList, type NavItem } from '@/components/nav';
import { Button } from '@/components/ui';
import { logoutAction } from '@/server/actions/auth';
import { switchWorkspaceAction } from '@/server/actions/workspace';
import { listMyWorkspaces } from '@/server/auth';
import { listProjects } from '@/server/queries';
import { isOwnerEmail } from '@/server/google';
import { LabBotPanel } from '@/components/labbot-panel';
import { requireSession } from '@/server/authz';
import { workspacePlan } from '@/server/paywall';

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/team', label: 'Team' },
  { href: '/projects', label: 'Projects' },
  { href: '/experiments', label: 'Experiments' },
  { href: '/actions', label: 'Needs attention' },
  { href: '/files', label: 'Files' },
  { href: '/samples', label: 'Samples' },
  { href: '/inventory', label: 'Inventory' },
  { href: '/protocols', label: 'Protocols' },
  { href: '/updates', label: 'Research updates' },
  { href: '/search', label: 'Search' },
  { href: '/billing', label: 'Billing' },
  { href: '/settings', label: 'Settings' },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  // Read access is never blocked, only writes. The banner says what applies.
  const { plan, writable, state } = await workspacePlan(session);
  const myWorkspaces = await listMyWorkspaces();
  // LabBot needs somewhere to answer about; with no projects the panel hides
  // itself rather than offering an empty picker.
  const projectsForBot = (await listProjects(session)).map((p) => ({ id: p.id, name: p.name }));

  // The owner link is added for the owner alone. Everyone else never sees the
  // route exists, and the page itself refuses them regardless of the nav.
  const items = isOwnerEmail(session.userEmail)
    ? [...navItems, { href: '/owner', label: 'Owner' }]
    : navItems;

  // Only worth showing once a user actually belongs to more than one lab.
  const workspacePicker =
    myWorkspaces.length > 1 ? (
      <form action={switchWorkspaceAction} className="mt-3">
        <label htmlFor="workspace-switch" className="sr-only">
          Switch workspace
        </label>
        <select
          id="workspace-switch"
          name="workspaceId"
          defaultValue={session.workspaceId}
          className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-xs"
        >
          {myWorkspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <Button type="submit" tone="ghost" size="sm" className="mt-1 w-full justify-start px-2">
          Switch workspace
        </Button>
      </form>
    ) : (
      <p className="mt-3 truncate text-xs text-muted" title={session.workspaceName}>
        {session.workspaceName}
      </p>
    );

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
            Labvia
          </span>
          <span className="text-sm text-muted group-open:hidden">Menu</span>
          <span className="hidden text-sm text-muted group-open:inline">Close</span>
        </summary>
        <nav aria-label="Main" className="px-3 pb-3">
          <NavList items={items} />
        </nav>
        {identity}
      </details>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="px-6 py-5">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden className="h-5 w-5 rounded-md bg-accent" />
            Labvia
          </Link>
          {workspacePicker}
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3">
          <NavList items={items} />
        </nav>
        {identity}
      </aside>

      <main className="min-w-0 flex-1">
        {writable ? null : (
          <div className="border-b border-warn/25 bg-warn/5 px-5 py-3 text-sm text-warn sm:px-8">
            This workspace is read-only because its plan has ended. Nothing has been deleted.{' '}
            <Link href="/billing" className="font-medium underline underline-offset-2">
              Choose a plan
            </Link>{' '}
            to record again.
          </div>
        )}
        {writable && state?.status === 'trialing' && trialDaysLeft(state) !== null ? (
          <div
            className={`border-b px-5 py-2.5 text-sm sm:px-8 ${
              trialDaysLeft(state)! <= 3
                ? 'border-warn/25 bg-warn/5 text-warn'
                : 'border-line bg-raised text-muted'
            }`}
          >
            {trialDaysLeft(state)! <= 0
              ? 'Your trial has ended. This workspace is on the free plan now.'
              : `${trialDaysLeft(state)} ${
                  trialDaysLeft(state) === 1 ? 'day' : 'days'
                } left in your trial. After that this workspace moves to the free plan: 1 project, 10 experiments, and nothing is deleted.`}{' '}
            <Link href="/billing" className="font-medium underline underline-offset-2">
              See plans
            </Link>
          </div>
        ) : null}
        {plan === 'free' ? (
          <div className="border-b border-line bg-raised px-5 py-2 text-xs text-muted sm:px-8">
            Free plan: 1 project, 10 experiments, 5 LabBot questions a month.{' '}
            <Link href="/billing" className="underline underline-offset-2 hover:text-fg">
              See plans
            </Link>
          </div>
        ) : null}
        <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">{children}</div>
      </main>
      <LabBotPanel projects={projectsForBot} />
    </div>
  );
}

/** Whole days remaining, or null when the trial has no end recorded. */
function trialDaysLeft(state: { trialEndsAt: Date | string | null }): number | null {
  if (!state.trialEndsAt) return null;
  return Math.ceil((new Date(state.trialEndsAt).getTime() - Date.now()) / 86_400_000);
}
