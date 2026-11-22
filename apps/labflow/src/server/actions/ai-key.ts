'use server';

import { revalidatePath } from 'next/cache';
import { rateLimit } from '@/lib/rate-limit';
import { encryptionConfigured } from '@/lib/secret-box';
import { checkAnthropicKey, looksLikeAnthropicKey } from '../ai/key-check';
import { requireSession } from '../authz';
import { aiAccess, isRefusal } from '../ai/access';
import { AiNotConfiguredError, AiRequestError, callModel } from '../ai/client';
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

/**
 * One tiny real request to Claude with whichever key this lab uses, so whoever
 * just set a key can see it work (or why it does not) before anyone relies on
 * it. Not counted toward the month: it is a check, not a use.
 */
export async function testAiConnectionAction(): Promise<{ ok: boolean; message: string }> {
  const session = await requireSession();
  if (session.role === 'member') return { ok: false, message: 'Only an owner or admin can run the check.' };
  const access = await aiAccess(session);
  if (isRefusal(access)) return { ok: false, message: access.error };
  const limited = rateLimit(`ai-test:${session.workspaceId}`, { limit: 5, windowMs: 60_000 });
  if (!limited.ok) return { ok: false, message: `Try again in ${limited.retryAfterSec} seconds.` };
  const started = Date.now();
  try {
    const { text, model } = await callModel({
      system: 'You are a connection check. Reply with exactly: OK',
      prompt: 'Connection check.',
      maxTokens: 200,
      effort: 'low',
      apiKey: access.apiKey,
    });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    return {
      ok: true,
      message: `Working. ${model} answered in ${seconds} s using ${access.ownKey ? "the lab's own key" : "the site's key"}${/ok/i.test(text) ? '' : ' (with an unexpected reply, but the connection is fine)'}.`,
    };
  } catch (error) {
    if (error instanceof AiNotConfiguredError || error instanceof AiRequestError) return { ok: false, message: error.message };
    throw error;
  }
}
