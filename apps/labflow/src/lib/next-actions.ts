/**
 * "What should I do next?" derived from the structured record.
 *
 * Deliberately not AI. These are mechanical observations about documentation
 * state — a run marked complete with no conclusion, a run left in progress for
 * weeks — so the guidance is always available, always explainable, and never
 * makes a scientific claim. Wording stays about the *record*, never the work.
 */

export type ActionSeverity = 'blocking' | 'attention' | 'idea';

export type NextAction = {
  id: string;
  severity: ActionSeverity;
  title: string;
  detail: string;
  href: string;
  /** Groups the list by where the work sits. */
  context: string;
};

export type ExperimentSignal = {
  id: string;
  number: number;
  title: string;
  status: string;
  projectId: string;
  projectName: string;
  performedOn: Date | string | null;
  updatedAt: Date | string;
  hasConclusion: boolean;
  hasNextSteps: boolean;
  hasObservations: boolean;
  conditionCount: number;
  sampleCount: number;
  datasetCount: number;
};

export type ProtocolSignal = {
  id: string;
  name: string;
  latestVersion: number | null;
  experimentCount: number;
};

/** A run untouched for this long is stale rather than simply ongoing. */
export const STALE_IN_PROGRESS_DAYS = 14;

const DAY_MS = 86_400_000;

function code(n: number) {
  return `EXP-${String(n).padStart(3, '0')}`;
}

function daysBetween(from: Date | string, now: Date): number {
  const then = from instanceof Date ? from : new Date(from);
  if (Number.isNaN(then.getTime())) return 0;
  return Math.floor((now.getTime() - then.getTime()) / DAY_MS);
}

const SEVERITY_ORDER: Record<ActionSeverity, number> = {
  blocking: 0,
  attention: 1,
  idea: 2,
};

export function buildNextActions(
  experiments: ExperimentSignal[],
  protocols: ProtocolSignal[],
  now: Date = new Date(),
): NextAction[] {
  const actions: NextAction[] = [];

  for (const e of experiments) {
    const label = `${code(e.number)} · ${e.title}`;
    const href = `/experiments/${e.id}`;
    const context = e.projectName;
    const finished = e.status === 'completed' || e.status === 'repeated';

    if (finished && !e.hasConclusion) {
      actions.push({
        id: `${e.id}:conclusion`,
        severity: 'blocking',
        title: `Record the conclusion for ${label}`,
        detail: 'This run is marked finished but nothing says what you took from it.',
        href,
        context,
      });
    }

    if (finished && e.datasetCount === 0) {
      actions.push({
        id: `${e.id}:data`,
        severity: 'attention',
        title: `Attach the measurement data for ${label}`,
        detail: 'No parsed dataset is attached, so the numbers live outside the record.',
        href,
        context,
      });
    }

    if (finished && !e.hasNextSteps) {
      actions.push({
        id: `${e.id}:next-steps`,
        severity: 'idea',
        title: `Note what follows ${label}`,
        detail: 'Recording next steps is what makes the project timeline readable later.',
        href,
        context,
      });
    }

    if (e.status === 'needs_investigation' && !e.hasObservations) {
      actions.push({
        id: `${e.id}:observations`,
        severity: 'blocking',
        title: `Say what looked wrong in ${label}`,
        detail: 'This run is flagged for investigation but records no observations.',
        href,
        context,
      });
    }

    if (e.status === 'in_progress') {
      const idle = daysBetween(e.updatedAt, now);
      if (idle >= STALE_IN_PROGRESS_DAYS) {
        actions.push({
          id: `${e.id}:stale`,
          severity: 'attention',
          title: `${label} has been in progress for ${idle} days`,
          detail: 'Update it or set its status, so the dashboard reflects what is actually running.',
          href,
          context,
        });
      }
    }

    if (e.status === 'planned' && e.performedOn && daysBetween(e.performedOn, now) > 0) {
      actions.push({
        id: `${e.id}:overdue`,
        severity: 'attention',
        title: `${label} was planned for a date that has passed`,
        detail: 'Mark it in progress or completed, or move the date.',
        href,
        context,
      });
    }

    if (finished && e.conditionCount === 0) {
      actions.push({
        id: `${e.id}:conditions`,
        severity: 'attention',
        title: `No conditions recorded on ${label}`,
        detail: 'Without them this run cannot be compared with any other.',
        href,
        context,
      });
    }

    if (finished && e.sampleCount === 0) {
      actions.push({
        id: `${e.id}:samples`,
        severity: 'idea',
        title: `No samples linked to ${label}`,
        detail: 'Linking sample IDs is what lets you trace a result back to material.',
        href,
        context,
      });
    }
  }

  for (const p of protocols) {
    if (p.experimentCount === 0) {
      actions.push({
        id: `${p.id}:unused-protocol`,
        severity: 'idea',
        title: `No experiment references ${p.name}`,
        detail: 'Linking the protocol version used is the single most useful field for comparisons.',
        href: `/protocols/${p.id}`,
        context: 'Protocols',
      });
    }
  }

  return actions.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.title.localeCompare(b.title),
  );
}

export const severityLabel: Record<ActionSeverity, string> = {
  blocking: 'Needs writing down',
  attention: 'Worth a look',
  idea: 'Nice to have',
};

export const severityTone: Record<ActionSeverity, 'danger' | 'warn' | 'neutral'> = {
  blocking: 'danger',
  attention: 'warn',
  idea: 'neutral',
};
