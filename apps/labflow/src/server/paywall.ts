import { redirect } from 'next/navigation';
import {
  PLANS,
  canWrite,
  effectivePlan,
  formatLimitBytes,
  limitsFor,
  toSubscriptionState,
  type Limits,
  type PlanId,
  type SubscriptionState,
} from '@/lib/plans';
import { getSubscription, usageCounts } from './queries';
import type { SessionContext } from './auth';

/**
 * The paywall.
 *
 * Two separate ideas, deliberately kept apart:
 *
 *  - **Read-only.** A *paid* plan that lapsed stops accepting writes. Records
 *    stay readable and nothing is ever deleted — a research tool that destroys
 *    data on a timer is one no lab will trust, and it does not convert anyone.
 *  - **Free limits.** The free plan writes fine, up to small caps.
 *
 * Every check runs server-side, in the layout and again in each write action,
 * so there is no client state to tamper with and no route to reach directly.
 */

export type WorkspacePlan = {
  state: SubscriptionState | null;
  plan: PlanId;
  limits: Limits;
  writable: boolean;
};

/**
 * Local override for exploring the paid product without paying.
 *
 * Refused outright in production, so this can never ship as a backdoor: the
 * check is on NODE_ENV, which the hosting platform sets, not on anything a
 * request can influence.
 */
function paywallDisabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.LABFLOW_DISABLE_PAYWALL === '1';
}

export async function workspacePlan(session: SessionContext): Promise<WorkspacePlan> {
  if (paywallDisabled()) {
    return {
      state: null,
      plan: 'department',
      limits: PLANS.department.limits,
      writable: true,
    };
  }

  const state = toSubscriptionState(await getSubscription(session));
  return {
    state,
    plan: effectivePlan(state),
    limits: limitsFor(state),
    writable: canWrite(state),
  };
}

/** Read access is never blocked; only writes are. */
export async function requireWorkspace(session: SessionContext): Promise<WorkspacePlan> {
  return workspacePlan(session);
}

/** A feature the current plan does not include. */
export async function requireFeature(
  session: SessionContext,
  feature: 'compare' | 'researchMemory' | 'pptxExport' | 'pubmed' | 'discussion',
): Promise<void> {
  const { limits } = await workspacePlan(session);
  if (!limits[feature]) redirect('/billing?upgrade=' + feature);
}

/**
 * Reason this workspace cannot write right now, or null.
 *
 * `adding` names what is about to be created so the per-plan cap for that thing
 * is checked too — a free workspace at ten experiments may still post a note.
 */
export async function blockedReason(
  session: SessionContext,
  adding?: 'project' | 'experiment' | 'upload' | 'ai',
): Promise<string | null> {
  const { plan, limits, writable } = await workspacePlan(session);

  if (!writable) {
    return 'This workspace is read-only because its plan has ended. Everything already recorded stays readable — choose a plan to write again.';
  }
  if (!adding) return null;

  const usage = await usageCounts(session);
  const upgrade = ` Upgrade to ${PLANS.lab.name} for unlimited.`;

  if (adding === 'project' && limits.projects !== null && usage.projects >= limits.projects) {
    return `The ${PLANS[plan].name} plan allows ${limits.projects} project${limits.projects === 1 ? '' : 's'}.${upgrade}`;
  }
  if (
    adding === 'experiment' &&
    limits.experiments !== null &&
    usage.experiments >= limits.experiments
  ) {
    return `The ${PLANS[plan].name} plan allows ${limits.experiments} experiments.${upgrade}`;
  }
  if (
    adding === 'upload' &&
    limits.storageBytes !== null &&
    usage.storageBytes >= limits.storageBytes
  ) {
    return `The ${PLANS[plan].name} plan includes ${formatLimitBytes(limits.storageBytes)} of uploads, which this workspace has used.${upgrade}`;
  }
  if (adding === 'ai' && usage.aiThisMonth >= limits.aiPerMonth) {
    return `The ${PLANS[plan].name} plan includes ${limits.aiPerMonth} LabBot questions a month, which this workspace has used.${upgrade}`;
  }
  return null;
}
