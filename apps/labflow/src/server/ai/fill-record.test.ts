import { afterEach, describe, expect, it } from 'vitest';
import { fillRecordFromText } from './fill-record';

process.env.DATABASE_URL ??= 'postgres://test:test@127.0.0.1:5432/test';
const originalKey = process.env.ANTHROPIC_API_KEY;
const originalBase = process.env.ANTHROPIC_BASE_URL;
afterEach(() => {
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalKey;
  if (originalBase === undefined) delete process.env.ANTHROPIC_BASE_URL;
  else process.env.ANTHROPIC_BASE_URL = originalBase;
});

/** A model that answers with `answer` and remembers what it was sent. */
function fakeModel(answer: object) {
  const seen: { body: Record<string, unknown>; headers: Record<string, string> }[] = [];
  const transport = (async (_url: unknown, init: unknown) => {
    const { body, headers } = init as { body: string; headers: Record<string, string> };
    seen.push({ body: JSON.parse(body), headers });
    return {
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: JSON.stringify(answer) }], stop_reason: 'end_turn' }),
    };
  }) as unknown as typeof fetch;
  return { transport, seen };
}

const protocols = [{ id: '11111111-1111-1111-1111-111111111111', version: 2, protocolName: 'Tensiometer' }];
const answer = {
  title: 'Surface tension, batch 3',
  performedOn: '2026-10-16',
  objective: 'Check the new soil extract batch',
  protocolVersionId: protocols[0]!.id,
  protocolNotes: '',
  conditions: [
    { name: 'Temperature', value: '25', unit: '°C' },
    { name: '', value: 'stray', unit: '' },
  ],
  dataLocation: 'Lab PC D:\\Tensiometer\\2026-10',
  notes: 'Noisy after sample 6, probably a bubble.',
  nextSteps: 'Repeat 6–9',
};

describe('fillRecordFromText', () => {
  it('asks for JSON in a fixed shape and returns the fields the person described', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    delete process.env.ANTHROPIC_BASE_URL;
    const { transport, seen } = fakeModel(answer);
    const record = await fillRecordFromText({ text: 'Ran the tensiometer…', today: '2026-10-17', protocols }, transport);

    const config = seen[0]!.body.output_config as { format: { type: string } };
    expect(config.format.type).toBe('json_schema');
    expect(String(seen[0]!.body.messages)).not.toBe('');
    expect(record.protocolVersionId).toBe(protocols[0]!.id);
    expect(record.conditions).toEqual([{ name: 'Temperature', value: '25', unit: '°C' }]);
    expect(record.notes).toContain('bubble');
  });

  it('drops a protocol the lab does not have and a date that is not a date', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    const { transport } = fakeModel({ ...answer, protocolVersionId: 'made-up', performedOn: 'last Tuesday' });
    const record = await fillRecordFromText({ text: 'Ran the tensiometer…', today: '2026-10-17', protocols }, transport);
    expect(record.protocolVersionId).toBe('');
    expect(record.performedOn).toBe('');
  });

  it('opts into the refusal fallback on the Claude API but not through a custom gateway', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    delete process.env.ANTHROPIC_BASE_URL;
    const direct = fakeModel(answer);
    await fillRecordFromText({ text: 'Ran it', today: '2026-10-17', protocols }, direct.transport);
    expect(direct.seen[0]!.body.fallbacks).toBe('default');
    expect(direct.seen[0]!.headers['anthropic-beta']).toBe('server-side-fallback-2026-07-01');

    process.env.ANTHROPIC_BASE_URL = 'https://gateway.example';
    const proxied = fakeModel(answer);
    await fillRecordFromText({ text: 'Ran it', today: '2026-10-17', protocols }, proxied.transport);
    expect(proxied.seen[0]!.body).not.toHaveProperty('fallbacks');
  });
});
