import { describe, expect, it } from 'vitest';
import { clean, planFromText, type Plan } from './assistant';

process.env.DATABASE_URL ??= 'postgres://test:test@127.0.0.1:5432/test';

const P1 = '11111111-1111-1111-1111-111111111111';
const P2 = '22222222-2222-2222-2222-222222222222';
const E1 = '33333333-3333-3333-3333-333333333333';
const FOREIGN = '99999999-9999-9999-9999-999999999999';

const experiment = (projectId: string, extra: Partial<Plan['experiments'][number]> = {}) => ({
  projectId,
  title: 'Batch 3 at 30 C',
  performedOn: '2026-11-19',
  objective: '',
  protocolVersionId: '',
  protocolNotes: '',
  conditions: [{ name: 'Temperature', value: '30', unit: '°C' }],
  dataLocation: '',
  notes: '',
  nextSteps: '',
  ...extra,
});

const lab = { projects: [{ id: P1 }, { id: P2 }], experiments: [{ id: E1 }], protocols: [] };

describe('clean', () => {
  it("keeps only this lab's ids, and leaves the project for the person to pick when unclear", () => {
    const plan = clean(
      {
        reply: ' Prepared. ',
        experiments: [experiment(P2), experiment(FOREIGN, { protocolVersionId: FOREIGN })],
        notes: [
          { experimentId: E1, body: ' dirty ring ' },
          { experimentId: FOREIGN, body: 'from another lab' },
        ],
        tasks: [],
        samples: [{ codes: ['S-1', 'S-1', ' ', 'S-2'], description: '', projectId: FOREIGN }],
        events: [],
      },
      lab,
    );
    expect(plan.reply).toBe('Prepared.');
    expect(plan.experiments.map((e) => e.projectId)).toEqual([P2, '']);
    expect(plan.experiments[1]!.protocolVersionId).toBe('');
    expect(plan.notes).toEqual([{ experimentId: E1, body: 'dirty ring' }]);
    expect(plan.samples).toEqual([{ codes: ['S-1', 'S-2'], description: '', projectId: '' }]);
  });

  it('uses the only project when the lab has one', () => {
    const plan = clean({ reply: '', experiments: [experiment('')], notes: [], tasks: [], samples: [], events: [] }, {
      ...lab,
      projects: [{ id: P1 }],
    });
    expect(plan.experiments[0]!.projectId).toBe(P1);
  });

  it('drops invented dates, empty tasks and conditions without a value', () => {
    const plan = clean(
      {
        reply: '',
        experiments: [experiment(P1, { performedOn: 'next Tuesday', conditions: [{ name: 'pH', value: '', unit: '' }] })],
        notes: [],
        tasks: [
          { title: 'Order tips', dueOn: 'Friday' },
          { title: '  ', dueOn: '' },
        ],
        samples: [],
        events: [
          { title: ' Group meeting ', onDate: '2026-11-26', atTime: '14:00', notes: 'Room 204' },
          { title: 'Seminar', onDate: 'Thursday', atTime: '2pm', notes: '' },
          { title: ' ', onDate: '2026-11-26', atTime: '', notes: '' },
        ],
      },
      lab,
    );
    expect(plan.experiments[0]!.performedOn).toBe('');
    expect(plan.experiments[0]!.conditions).toEqual([]);
    expect(plan.tasks).toEqual([{ title: 'Order tips', dueOn: '' }]);
    // A day or time the model could not pin down is left for the person to pick.
    expect(plan.events).toEqual([
      { title: 'Group meeting', onDate: '2026-11-26', atTime: '14:00', notes: 'Room 204' },
      { title: 'Seminar', onDate: '', atTime: '', notes: '' },
    ]);
  });
});

describe('planFromText', () => {
  it('sends the lab lists and the output shape, at low effort, and cleans the answer', async () => {
    const sent: Record<string, unknown>[] = [];
    const transport = (async (_url: unknown, init: unknown) => {
      sent.push(JSON.parse((init as { body: string }).body));
      const answer: Plan = { reply: 'Ok.', experiments: [experiment(FOREIGN)], notes: [], tasks: [], samples: [], events: [] };
      return { ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(answer) }], stop_reason: 'end_turn' }) };
    }) as unknown as typeof fetch;

    const plan = await planFromText(
      {
        text: 'Ran batch 3 at 30 C today.',
        today: '2026-11-20',
        projects: [{ id: P1, name: 'Tensiometer' }],
        experiments: [{ id: E1, code: 'EXP-001', title: 'Batch 1', projectName: 'Tensiometer' }],
        protocols: [],
        apiKey: 'sk-ant-test',
      },
      transport,
    );

    const body = sent[0]!;
    const prompt = JSON.stringify(body.messages);
    expect(prompt).toContain(`${P1}: Tensiometer`);
    expect(prompt).toContain(`${E1}: EXP-001 Batch 1`);
    expect(prompt).toContain('Today is 2026-11-20');
    expect(body.output_config).toMatchObject({ effort: 'low', format: { type: 'json_schema' } });
    // The foreign project became the lab's only one.
    expect(plan.experiments[0]!.projectId).toBe(P1);
  });

  it('sends photos ahead of the words, without words if there are none, and reads them more carefully', async () => {
    const sent: Record<string, unknown>[] = [];
    const transport = (async (_url: unknown, init: unknown) => {
      sent.push(JSON.parse((init as { body: string }).body));
      const answer: Plan = { reply: 'Read it.', experiments: [], notes: [], tasks: [{ title: 'Relabel box 4', dueOn: '' }], samples: [], events: [] };
      return { ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(answer) }], stop_reason: 'end_turn' }) };
    }) as unknown as typeof fetch;

    const plan = await planFromText(
      { text: '', today: '2026-11-20', projects: [], experiments: [], protocols: [], apiKey: 'sk-ant-test', images: [{ mediaType: 'image/jpeg', data: 'AAAA' }] },
      transport,
    );

    const content = (sent[0]!.messages as { content: { type: string; text?: string; source?: unknown }[] }[])[0]!.content;
    expect(content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } });
    expect(content[1]!.text).toContain('They attached a photo of their notes');
    expect(content[1]!.text).not.toContain('What they wrote');
    expect(sent[0]!.output_config).toMatchObject({ effort: 'medium' });
    expect(plan.tasks).toEqual([{ title: 'Relabel box 4', dueOn: '' }]);
  });
});
