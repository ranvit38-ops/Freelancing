'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from './ui';

export type NavItem = { href: string; label: string };

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
                'block rounded-lg px-3 py-1.5 text-sm transition-colors',
                active ? 'bg-raised font-medium text-fg' : 'text-muted hover:bg-raised hover:text-fg',
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
