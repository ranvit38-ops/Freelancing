/**
 * Whether an Anthropic key works, asked of Anthropic itself.
 *
 * Listing one model costs nothing and needs only a valid key, so it proves
 * the key without spending the lab's credit.
 */
export function looksLikeAnthropicKey(value: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,300}$/.test(value);
}

/** Null when the key works; otherwise a sentence saying why not. */
export async function checkAnthropicKey(apiKey: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const base = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
  let response: Response;
  try {
    response = await fetchImpl(`${base}/v1/models?limit=1`, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return 'Anthropic could not be reached to check the key. Try again in a moment.';
  }
  if (response.ok) return null;
  if (response.status === 401) return 'Anthropic rejected that key. Copy it again from console.anthropic.com → API keys.';
  if (response.status === 403) return 'Anthropic says that key is not allowed to use the API.';
  return `Anthropic could not check the key (${response.status}). Try again in a moment.`;
}
