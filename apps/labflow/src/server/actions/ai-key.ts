'use server';

import { revalidatePath } from 'next/cache';
import { rateLimit } from '@/lib/rate-limit';
import { encryptionConfigured } from '@/lib/secret-box';
import { checkAnthropicKey, looksLikeAnthropicKey } from '../ai/key-check';
import { requireSession } from '../authz';
import { MembershipRefusedError, setLabAiKey } from '../queries';
import type { ActionState } from './types';

/**
 * A lab's own Claude key: used for every AI request the lab makes, without
 * the plan's monthly limit, because Anthropic bills the lab directly.
 *
 * The key is checked with Anthropic before it is kept, so a typo fails here
 * and not halfway through someone's question, and it is stored encrypted.
 */
export async function saveLabAiKeyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession();
  if (session.role === 'member') return { error: "Only an owner or admin can change the lab's Claude key." };
  if (!encryptionConfigured()) {
    return {
      error: 'This site cannot store keys yet: LABFLOW_ENCRYPTION_KEY is not set on the server. Nothing was saved.',
    };
  }
  const limit = rateLimit(`ai-key:${session.workspaceId}`, { limit: 5, windowMs: 10 * 60_000 });
  if (!limit.ok) return { error: `Too many tries. Try again in ${Math.ceil(limit.retryAfterSec / 60)} minutes.` };

  const apiKey = String(formData.get('apiKey') ?? '').trim();
  if (!looksLikeAnthropicKey(apiKey)) {
    return {
      fieldErrors: {
        apiKey: 'That is not an Anthropic API key. They start with sk-ant- and come from console.anthropic.com.',
      },
    };
  }
  const problem = await checkAnthropicKey(apiKey);
  if (problem) return { error: `${problem} Nothing was saved.` };

  try {
    await setLabAiKey(session, apiKey);
  } catch (error) {
    if (error instanceof MembershipRefusedError) return { error: error.message };
    throw error;
  }
  revalidatePath('/', 'layout');
  return { ok: true, message: `Saved. AI requests in this lab now use the key ending ${apiKey.slice(-4)}, with no monthly limit.` };
}

export async function removeLabAiKeyAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  const session = await requireSession();
  try {
    await setLabAiKey(session, null);
  } catch (error) {
    if (error instanceof MembershipRefusedError) return { error: error.message };
    throw error;
  }
  revalidatePath('/', 'layout');
  return { ok: true, message: "Removed. AI requests use this plan's monthly allowance again." };
}
