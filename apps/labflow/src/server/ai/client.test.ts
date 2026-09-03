import { afterEach, describe, expect, it } from 'vitest';
import { AiNotConfiguredError, AiRequestError, callModel, extractJson } from './client';

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
