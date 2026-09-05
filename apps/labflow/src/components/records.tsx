import Link from 'next/link';
import { Badge, EmptyState } from './ui';
import {
  experimentCode,
  experimentStatusLabel,
  experimentStatusTone,
  formatDate,
} from '@/lib/display';
import type { ExperimentStatus } from '@/db/schema';

export function StatusBadge({ status }: { status: ExperimentStatus }) {
  return <Badge tone={experimentStatusTone[status]}>{experimentStatusLabel[status]}</Badge>;
}

export type ExperimentRowData = {
  id: string;
  number: number;
  title: string;
  status: ExperimentStatus;
  objective: string | null;
  performedOn: Date | string | null;
  projectName?: string | null;
  protocolName?: string | null;
  protocolVersion?: number | null;
};

export function ExperimentList({
  experiments,
  showProject = false,
  empty,
}: {
  experiments: ExperimentRowData[];
  showProject?: boolean;
  empty?: React.ReactNode;
}) {
  if (experiments.length === 0) {
    return empty ?? <EmptyState title="No experiments yet." />;
  }
  return (
    <ul className="divide-y divide-line">
      {experiments.map((e) => (
        <li key={e.id}>
          <Link
            href={`/experiments/${e.id}`}
            className="flex flex-col gap-1 px-5 py-3.5 transition-colors hover:bg-raised sm:flex-row sm:items-center sm:gap-4"
          >
            <span className="w-20 shrink-0 font-mono text-xs text-subtle">
              {experimentCode(e.number)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{e.title}</span>
              <span className="mt-0.5 block truncate text-xs text-muted">
                {[
                  showProject ? e.projectName : null,
                  e.protocolName ? `${e.protocolName} v${e.protocolVersion ?? '—'}` : null,
                  e.objective,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'No objective recorded'}
              </span>
            </span>
            <span className="shrink-0 text-xs text-subtle sm:w-24 sm:text-right">
              {formatDate(e.performedOn)}
            </span>
            <span className="shrink-0 sm:w-40 sm:text-right">
              <StatusBadge status={e.status} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
