'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from './ui';

export type NavItem = { href: string; label: string; badge?: number };

/**
 * A small mark of colour per section, so the list reads at a glance and each
 * part of the app keeps one colour wherever it appears. Decoration only: the
 * label always says what it is.
 */
const HUE: Record<string, string> = {
  '/dashboard': 'bg-accent',
  '/notifications': 'bg-amber',
  '/start': 'bg-teal',
  '/projects': 'bg-violet',
  '/protocols': 'bg-amber',
  '/files': 'bg-teal',
  '/team': 'bg-rose',
  '/tasks': 'bg-accent',
  '/chat': 'bg-violet',
  '/calendar': 'bg-amber',
  '/activity': 'bg-rose',
  '/inventory': 'bg-amber',
  '/samples': 'bg-teal',
};

/**
 * Highlights the section the user is in. `/experiments/abc` lights up
 * "Experiments"; only `/` style exact matches are used for the dashboard.
 */
export function NavList({ items, className }: { items: NavItem[]; className?: string }) {
  const pathname = usePathname();
  return (
    <ul className={cx('space-y-0.5', className)}>
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`)) ||
          (item.href !== '/dashboard' && pathname === item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'flex items-center justify-between rounded-lg px-3 py-1.5 text-sm transition-colors',
                active ? 'bg-accent-soft font-semibold text-accent' : 'text-muted hover:bg-raised hover:text-fg',
              )}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span aria-hidden className={cx('h-2 w-2 shrink-0 rounded-sm', HUE[item.href] ?? 'bg-subtle', !active && 'opacity-80')} />
                <span className="truncate">{item.label}</span>
              </span>
              {item.badge ? (
                <span
                  aria-label={`${item.badge} unread`}
                  title={`${item.badge} unread`}
                  className="min-w-5 rounded-full bg-accent px-1.5 text-center text-[11px] font-semibold leading-5 text-accent-fg"
                >
                  {item.badge}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
