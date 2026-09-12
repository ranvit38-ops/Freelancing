import { afterEach, describe, expect, it } from 'vitest';
import { AiNotConfiguredError, AiRequestError, callModel, extractJson } from './client';

// callModel reads the model name through the validated env, which checks every
// variable at once. The database is irrelevant here; this just satisfies it.
process.env.DATABASE_URL ??= 'postgres://test:test@127.0.0.1:5432/test';

const originalKey = process.env.ANTHROPIC_API_KEY;
afterEach(() => {
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalKey;
});

describe('callModel', () => {
  it('refuses to run without credentials rather than returning something invented', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(callModel({ system: 's', prompt: 'p' })).rejects.toBeInstanceOf(
      AiNotConfiguredError,
    );
  });
});

describe('the request Labvia actually sends', () => {
  it('sends no sampling parameters, which the current models reject outright', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    let sent: Record<string, unknown> = {};
    const fake = (async (_url: unknown, init: unknown) => {
      sent = JSON.parse((init as { body: string }).body);
      return {
        ok: true,
        json: async () => ({ content: [{ type: 'text', text: 'fine' }] }),
      };
    }) as unknown as typeof fetch;

    await callModel({ system: 's', prompt: 'p' }, fake);

    // temperature, top_p and top_k are gone from the current models and a
    // request carrying one comes back 400. This is the check that would have
    // caught it, so it stays.
    expect(sent).not.toHaveProperty('temperature');
    expect(sent).not.toHaveProperty('top_p');
    expect(sent).not.toHaveProperty('top_k');
    expect(sent.max_tokens).toBeGreaterThanOrEqual(8000);
    expect(String(sent.model)).toMatch(/^claude-/);
  });

  it('repeats what the API said went wrong rather than only its status code', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const fake = (async () => ({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({ error: { message: 'temperature: Extra inputs are not permitted' } }),
    })) as unknown as typeof fetch;

    await expect(callModel({ system: 's', prompt: 'p' }, fake)).rejects.toThrow(
      /temperature: Extra inputs are not permitted/,
    );
  });
});

describe('extractJson', () => {
  it('reads a bare JSON object', () => {
    expect(extractJson('{"answer":"yes"}')).toEqual({ answer: 'yes' });
  });

  it('reads JSON out of a fenced block', () => {
    expect(extractJson('Here you go:\n```json\n{"a":1}\n```\n')).toEqual({ a: 1 });
  });

  it('reads JSON surrounded by prose', () => {
    expect(extractJson('Sure. {"a":[1,2]} Hope that helps.')).toEqual({ a: [1, 2] });
  });

  it('throws rather than guessing when there is no JSON', () => {
    expect(() => extractJson('I cannot answer that.')).toThrow(AiRequestError);
  });

  it('throws on malformed JSON instead of returning a partial object', () => {
    expect(() => extractJson('{"a": }')).toThrow(AiRequestError);
  });
});
