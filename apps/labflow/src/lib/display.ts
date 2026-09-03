import type { ExperimentStatus, ProjectStatus } from '@/db/schema';

/** EXP-001. Zero-padded so experiments sort and scan predictably. */
export function experimentCode(n: number): string {
  return `EXP-${String(n).padStart(3, '0')}`;
}

export const experimentStatusLabel: Record<ExperimentStatus, string> = {
  planned: 'Planned',
  in_progress: 'In progress',
  completed: 'Completed',
  repeated: 'Repeated',
  needs_investigation: 'Needs investigation',
};

export const experimentStatusTone: Record<
  ExperimentStatus,
  'neutral' | 'accent' | 'ok' | 'warn' | 'danger'
> = {
  planned: 'neutral',
  in_progress: 'accent',
  completed: 'ok',
  repeated: 'accent',
  needs_investigation: 'warn',
};

export const projectStatusLabel: Record<ProjectStatus, string> = {
  planning: 'Planning',
  active: 'Active',
  on_hold: 'On hold',
  completed: 'Completed',
  archived: 'Archived',
};

/** Fixed locale and UTC so server and client render the same string. */
export function formatDate(value: Date | string | null): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** Value for an <input type="date">, which only accepts YYYY-MM-DD. */
export function toDateInput(value: Date | string | null): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

/** "3 experiments" / "1 experiment" — used all over the dashboard. */
export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
