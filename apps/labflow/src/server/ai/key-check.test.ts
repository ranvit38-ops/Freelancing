import { describe, expect, it } from 'vitest';
import { checkAnthropicKey, looksLikeAnthropicKey } from './key-check';

const answer = (status: number) => (async () => new Response('{}', { status })) as typeof fetch;

describe('lab Claude key', () => {
  it('only accepts something shaped like an Anthropic key', () => {
    expect(looksLikeAnthropicKey('sk-ant-api03-' + 'a'.repeat(40))).toBe(true);
    expect(looksLikeAnthropicKey('sk-proj-' + 'a'.repeat(40))).toBe(false);
    expect(looksLikeAnthropicKey('sk-ant-short')).toBe(false);
    expect(looksLikeAnthropicKey('sk-ant-api03-' + 'a'.repeat(40) + ' extra')).toBe(false);
  });

  it('asks Anthropic and explains a refusal', async () => {
    expect(await checkAnthropicKey('k', answer(200))).toBeNull();
    expect(await checkAnthropicKey('k', answer(401))).toMatch(/rejected/);
    expect(await checkAnthropicKey('k', answer(403))).toMatch(/not allowed/);
    const down = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    expect(await checkAnthropicKey('k', down)).toMatch(/could not be reached/);
  });
});
