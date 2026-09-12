import Link from 'next/link';
import { Badge, EmptyState } from './ui';
import { severityLabel, severityTone, type NextAction } from '@/lib/next-actions';

/**
 * Guidance about the *record*, never about the science. Each row says what is
 * undocumented and links straight to the place it would be written.
 */
export function NextActionsList({
  actions,
  limit,
  emptyTitle = 'Nothing outstanding',
  emptyDescription = 'Every finished experiment has its conclusion, data and next steps recorded.',
}: {
  actions: NextAction[];
  limit?: number;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (actions.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }
  const shown = limit ? actions.slice(0, limit) : actions;

  return (
    <ul className="divide-y divide-line">
      {shown.map((action) => (
        <li key={action.id}>
          <Link href={action.href} className="block px-5 py-3.5 transition-colors hover:bg-raised">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <span className="min-w-0 text-sm font-medium">{action.title}</span>
              <Badge tone={severityTone[action.severity]}>{severityLabel[action.severity]}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted">{action.detail}</p>
            <p className="mt-1 text-xs text-subtle">{action.context}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
