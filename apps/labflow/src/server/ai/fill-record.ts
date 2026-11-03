import { z } from 'zod';
import { callModel, extractJson, AiRequestError, type ModelTransport } from './client';

/**
 * Turns someone's own words about a run into the experiment form's fields.
 *
 * It only fills in a form for a person to check: nothing is saved until they
 * press Save, and fields they already typed are left alone. The model is told
 * to copy what was said, never to supply a value that was not stated, because
 * an invented temperature in a lab record is worse than a blank one.
 */

export type FilledRecord = {
  title: string;
  performedOn: string;
  objective: string;
  protocolVersionId: string;
  protocolNotes: string;
  conditions: { name: string; value: string; unit: string }[];
  dataLocation: string;
  notes: string;
  nextSteps: string;
};

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Short name for the run, under 80 characters.' },
    performedOn: { type: 'string', description: 'YYYY-MM-DD, or empty when no date was given.' },
    objective: { type: 'string', description: 'Why the run was done, in their words.' },
    protocolVersionId: { type: 'string', description: 'An id from the protocol list, or empty.' },
    protocolNotes: { type: 'string', description: 'Anything done differently from the protocol.' },
    conditions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          value: { type: 'string' },
          unit: { type: 'string' },
        },
        required: ['name', 'value', 'unit'],
        additionalProperties: false,
      },
    },
    dataLocation: { type: 'string', description: 'Where the raw data files are kept.' },
    notes: { type: 'string', description: 'What happened at the bench: observations, problems.' },
    nextSteps: { type: 'string', description: 'What is left to do.' },
  },
  required: [
    'title',
    'performedOn',
    'objective',
    'protocolVersionId',
    'protocolNotes',
    'conditions',
    'dataLocation',
    'notes',
    'nextSteps',
  ],
  additionalProperties: false,
} as const;

const shape = z.object({
  title: z.string(),
  performedOn: z.string(),
  objective: z.string(),
  protocolVersionId: z.string(),
  protocolNotes: z.string(),
  conditions: z.array(z.object({ name: z.string(), value: z.string(), unit: z.string() })),
  dataLocation: z.string(),
  notes: z.string(),
  nextSteps: z.string(),
});

const SYSTEM = `You fill in a lab experiment record from a researcher's own description of what they did.

Copy what they said into the matching fields. Never add a value, number, unit, date or step they did not state: leave the field empty instead. A blank field is fine; an invented one corrupts the lab's record.
- conditions: only variables they controlled or set, each as name, value and unit (for example Temperature, 25, °C). Leave unit empty if none was given.
- performedOn: resolve "today" or "yesterday" against the date given; otherwise only an explicit date.
- protocolVersionId: only when they clearly name one of the listed protocols; use that protocol's newest version unless they name a version.
- notes: observations and problems in their words, lightly tidied. Do not summarise away details.
- title: a short plain name for the run built from what they described.`;

export const MAX_DESCRIPTION = 6000;

export async function fillRecordFromText(
  input: {
    text: string;
    /** The researcher's local date, YYYY-MM-DD. The server's clock is UTC. */
    today: string;
    protocols: { id: string; version: number; protocolName: string }[];
    apiKey?: string;
  },
  fetchImpl?: ModelTransport,
): Promise<FilledRecord> {
  const protocolList =
    input.protocols.length === 0
      ? '(none)'
      : input.protocols.map((p) => `- ${p.id}: ${p.protocolName} v${p.version}`).join('\n');
  const { text } = await callModel(
    {
      system: SYSTEM,
      prompt: `Today is ${input.today}.\n\nProtocols in this lab:\n${protocolList}\n\nWhat they wrote:\n"""\n${input.text.slice(0, MAX_DESCRIPTION)}\n"""`,
      schema: SCHEMA,
      effort: 'low',
      maxTokens: 4000,
      apiKey: input.apiKey,
    },
    fetchImpl,
  );
  const parsed = shape.safeParse(extractJson(text));
  if (!parsed.success) throw new AiRequestError('The model returned a record in the wrong shape. Try again.');
  const known = new Set(input.protocols.map((p) => p.id));
  const r = parsed.data;
  return {
    title: r.title.trim().slice(0, 160),
    performedOn: /^\d{4}-\d{2}-\d{2}$/.test(r.performedOn) ? r.performedOn : '',
    objective: r.objective.trim(),
    // A protocol id the lab does not have would be a dangling link: drop it.
    protocolVersionId: known.has(r.protocolVersionId) ? r.protocolVersionId : '',
    protocolNotes: r.protocolNotes.trim(),
    conditions: r.conditions
      .map((c) => ({ name: c.name.trim(), value: c.value.trim(), unit: c.unit.trim() }))
      .filter((c) => c.name && c.value)
      .slice(0, 30),
    dataLocation: r.dataLocation.trim(),
    notes: r.notes.trim(),
    nextSteps: r.nextSteps.trim(),
  };
}
