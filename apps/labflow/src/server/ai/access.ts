import { allowanceUsed } from '@/lib/plans';
import type { SessionContext } from '../auth';
import { blockedReason, workspacePlan } from '../paywall';
import { getLabAiKey, recordAiUse, usageCounts } from '../queries';

/**
 * Which key an AI request runs on, and whether the lab may make it.
 *
 * A lab with its own Anthropic key uses it for everything, without limit:
 * Anthropic bills the lab, not us. Every other lab uses the site's key and
 * the monthly allowance of its plan, which counts every AI feature alike.
 *
 * Checked before the request and counted after it succeeds, so a failed
 * request never uses up the allowance.
 */
/** apiKey is set only for a lab's own key; otherwise the site's key is used. */
export type AiAccess = { apiKey?: string; ownKey: boolean };
export type AiRefusal = { error: string; status: number; notConfigured?: true };

export function isRefusal(a: AiAccess | AiRefusal): a is AiRefusal {
  return 'error' in a;
}

export async function aiAccess(s: SessionContext): Promise<AiAccess | AiRefusal> {
  const blocked = await blockedReason(s);
  if (blocked) return { error: blocked, status: 402 };

  const own = await getLabAiKey(s);
  if (own) return { apiKey: own, ownKey: true };

  const site = process.env.ANTHROPIC_API_KEY;
  if (!site) {
    return {
      error:
        'AI features are not switched on for this site yet. A lab owner can add the lab\'s own Claude key in Settings, or the site needs ANTHROPIC_API_KEY.',
      status: 503,
      notConfigured: true,
    };
  }

  const { plan, limits } = await workspacePlan(s);
  const { aiThisMonth } = await usageCounts(s);
  if (aiThisMonth >= limits.aiPerMonth) {
    return { error: allowanceUsed(plan), status: 402 };
  }
  return { ownKey: false };
}

/** Counts a request that went through. */
export async function countAiUse(s: SessionContext, feature: string, access: AiAccess) {
  await recordAiUse(s, feature, access.ownKey);
}

/** Whether AI features can run for this lab at all: the site's key or its own. */
export async function labAiReady(s: SessionContext): Promise<boolean> {
  if (process.env.ANTHROPIC_API_KEY) return true;
  return (await getLabAiKey(s)) !== null;
}
