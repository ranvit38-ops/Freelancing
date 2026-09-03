'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from './ui';

/** Sub-navigation inside a project. Kept flat — depth costs clicks. */
export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  const tabs = [
    { href: base, label: 'Overview' },
    { href: `${base}/timeline`, label: 'Timeline' },
    { href: `${base}/compare`, label: 'Compare' },
    { href: `${base}/samples`, label: 'Samples' },
    { href: `${base}/memory`, label: 'Research memory' },
    { href: `${base}/assistant`, label: 'AI assistant' },
    { href: `${base}/updates`, label: 'Research updates' },
  ];

  return (
    <nav aria-label="Project sections" className="mb-6 border-b border-line">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'block whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors',
                  active
                    ? 'border-accent font-medium text-fg'
                    : 'border-transparent text-muted hover:text-fg',
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
