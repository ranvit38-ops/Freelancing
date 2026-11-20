import { z } from 'zod';
import { callModel, extractJson, AiRequestError, type ModelImage, type ModelTransport } from './client';
import { MAX_DESCRIPTION } from './fill-record';

/**
 * LabBot's "fill it in for me": what someone says in their own words, turned
 * into records ready to save. A new experiment, a note on an existing one,
 * tasks, samples.
 *
 * It only proposes. Every proposal is shown to the person, who saves it with
 * a button (a new experiment opens in the normal form, filled in, to check);
 * nothing reaches the lab's record on the model's word alone. The model is
 * told to copy what was said and never to supply a value that was not
 * stated, and every id it returns is checked against this lab before it is
 * shown.
 */

export type PlannedExperiment = {
  projectId: string;
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
export type PlannedNote = { experimentId: string; body: string };
export type PlannedTask = { title: string; dueOn: string };
export type PlannedSamples = { codes: string[]; description: string; projectId: string };

export type Plan = {
  reply: string;
  experiments: PlannedExperiment[];
  notes: PlannedNote[];
  tasks: PlannedTask[];
  samples: PlannedSamples[];
};

const text = (description: string) => ({ type: 'string', description });
const SCHEMA = {
  type: 'object',
  properties: {
    reply: text('One or two plain sentences: what you prepared, or what you need to know to prepare it.'),
    experiments: {
      type: 'array',
      description: 'New runs they describe having done. Empty if none.',
      items: {
        type: 'object',
        properties: {
          projectId: text('An id from the project list, or empty when it is not clear which.'),
          title: text('Short name for the run, under 80 characters.'),
          performedOn: text('YYYY-MM-DD, or empty when no date was given.'),
          objective: text('Why the run was done, in their words.'),
          protocolVersionId: text('An id from the protocol list, or empty.'),
          protocolNotes: text('Anything done differently from the protocol.'),
          conditions: {
            type: 'array',
            items: {
              type: 'object',
              properties: { name: { type: 'string' }, value: { type: 'string' }, unit: { type: 'string' } },
              required: ['name', 'value', 'unit'],
              additionalProperties: false,
            },
          },
          dataLocation: text('Where the raw data files are kept.'),
          notes: text('What happened at the bench, in their words.'),
          nextSteps: text('What is left to do on this run.'),
        },
        required: [
          'projectId',
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
      },
    },
    notes: {
      type: 'array',
      description: 'Something to add to a run already in the list. Empty if none.',
      items: {
        type: 'object',
        properties: { experimentId: text('An id from the experiment list.'), body: text('The note, in their words.') },
        required: ['experimentId', 'body'],
        additionalProperties: false,
      },
    },
    tasks: {
      type: 'array',
      description: 'Things they say need doing. Empty if none.',
      items: {
        type: 'object',
        properties: { title: text('What needs doing, short.'), dueOn: text('YYYY-MM-DD, or empty.') },
        required: ['title', 'dueOn'],
        additionalProperties: false,
      },
    },
    samples: {
      type: 'array',
      description: 'New sample IDs they want registered. Empty if none.',
      items: {
        type: 'object',
        properties: {
          codes: { type: 'array', items: { type: 'string' }, description: 'Every ID, ranges written out.' },
          description: text('What the samples are, or empty.'),
          projectId: text('An id from the project list, or empty.'),
        },
        required: ['codes', 'description', 'projectId'],
        additionalProperties: false,
      },
    },
  },
  required: ['reply', 'experiments', 'notes', 'tasks', 'samples'],
  additionalProperties: false,
} as const;

const shape = z.object({
  reply: z.string(),
  experiments: z.array(
    z.object({
      projectId: z.string(),
      title: z.string(),
      performedOn: z.string(),
      objective: z.string(),
      protocolVersionId: z.string(),
      protocolNotes: z.string(),
      conditions: z.array(z.object({ name: z.string(), value: z.string(), unit: z.string() })),
      dataLocation: z.string(),
      notes: z.string(),
      nextSteps: z.string(),
    }),
  ),
  notes: z.array(z.object({ experimentId: z.string(), body: z.string() })),
  tasks: z.array(z.object({ title: z.string(), dueOn: z.string() })),
  samples: z.array(z.object({ codes: z.array(z.string()), description: z.string(), projectId: z.string() })),
});

const SYSTEM = `You help a researcher record their lab work. From what they write, prepare records for them to check and save:
- experiments: runs they say they did. One per run.
- notes: something to add to a run that is already in the experiment list (they name it, e.g. EXP-002, or describe it unmistakably).
- tasks: things they say need doing.
- samples: new sample IDs they want registered.

Copy what they said. Never add a value, number, unit, date, ID or step they did not state: leave the field empty instead. An invented temperature in a lab record is worse than a blank one.
- conditions: only variables they set, each as name, value and unit. Leave unit empty if none was given.
- dates: resolve "today", "yesterday" or a weekday against the date given; otherwise only an explicit date.
- projectId, experimentId, protocolVersionId: only ids from the lists given, and only when it is clear which one they mean.
- If they ask a question rather than describe work, prepare nothing and say in the reply that the Ask tab answers questions.
- Photos (a notebook page, a whiteboard, a printout) count as what they wrote. Copy what is written. Where a word or number cannot be read with confidence, leave it out and say in the reply which part you could not read. Never guess a number from bad handwriting.
Keep the reply to one or two plain sentences.`;

export async function planFromText(
  input: {
    text: string;
    /** The person's local date, YYYY-MM-DD. The server's clock is UTC. */
    today: string;
    projects: { id: string; name: string }[];
    experiments: { id: string; code: string; title: string; projectName: string }[];
    protocols: { id: string; version: number; protocolName: string }[];
    apiKey?: string;
    /** Photos of their notes, read as part of what they wrote. */
    images?: ModelImage[];
  },
  fetchImpl?: ModelTransport,
): Promise<Plan> {
  const photos = input.images?.length ?? 0;
  const list = <T>(items: T[], line: (item: T) => string) => (items.length ? items.map(line).join('\n') : '(none)');
  const { text: answer } = await callModel(
    {
      system: SYSTEM,
      prompt: [
        `Today is ${input.today}.`,
        `Projects:\n${list(input.projects, (p) => `- ${p.id}: ${p.name}`)}`,
        `Experiments (newest first):\n${list(input.experiments.slice(0, 200), (e) => `- ${e.id}: ${e.code} ${e.title} (${e.projectName})`)}`,
        `Protocols:\n${list(input.protocols, (p) => `- ${p.id}: ${p.protocolName} v${p.version}`)}`,
        input.text.trim() ? `What they wrote:\n"""\n${input.text.slice(0, MAX_DESCRIPTION)}\n"""` : '',
        photos ? `They attached ${photos === 1 ? 'a photo' : `${photos} photos`} of their notes, above. Read ${photos === 1 ? 'it' : 'them'} as what they wrote.` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
      images: input.images,
      schema: SCHEMA,
      // Handwritten numbers are where a misread costs most, so a photo gets a closer look.
      effort: photos ? 'medium' : 'low',
      maxTokens: 8000,
      apiKey: input.apiKey,
    },
    fetchImpl,
  );
  const parsed = shape.safeParse(extractJson(answer));
  if (!parsed.success) throw new AiRequestError('LabBot answered in the wrong shape. Try again.');
  return clean(parsed.data, input);
}

/**
 * What the model returned, kept only where it points at this lab's own
 * records and has something in it.
 */
export function clean(
  plan: Plan,
  lab: { projects: { id: string }[]; experiments: { id: string }[]; protocols: { id: string }[] },
): Plan {
  const projects = new Set(lab.projects.map((p) => p.id));
  const experiments = new Set(lab.experiments.map((e) => e.id));
  const protocols = new Set(lab.protocols.map((p) => p.id));
  // With one project there is nothing to choose; otherwise the person picks.
  const project = (id: string) => (projects.has(id) ? id : lab.projects.length === 1 ? lab.projects[0]!.id : '');
  const date = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '');
  return {
    reply: plan.reply.trim().slice(0, 600),
    experiments: plan.experiments
      .filter((e) => e.title.trim())
      .slice(0, 5)
      .map((e) => ({
        ...e,
        projectId: project(e.projectId),
        title: e.title.trim().slice(0, 160),
        performedOn: date(e.performedOn),
        protocolVersionId: protocols.has(e.protocolVersionId) ? e.protocolVersionId : '',
        conditions: e.conditions
          .map((c) => ({ name: c.name.trim(), value: c.value.trim(), unit: c.unit.trim() }))
          .filter((c) => c.name && c.value)
          .slice(0, 30),
      })),
    notes: plan.notes
      .filter((n) => experiments.has(n.experimentId) && n.body.trim())
      .slice(0, 10)
      .map((n) => ({ experimentId: n.experimentId, body: n.body.trim().slice(0, 4000) })),
    tasks: plan.tasks
      .filter((t) => t.title.trim())
      .slice(0, 20)
      .map((t) => ({ title: t.title.trim().slice(0, 200), dueOn: date(t.dueOn) })),
    samples: plan.samples
      .map((g) => ({
        codes: [...new Set(g.codes.map((c) => c.trim()).filter((c) => c && c.length <= 64))].slice(0, 200),
        description: g.description.trim().slice(0, 2000),
        projectId: projects.has(g.projectId) ? g.projectId : '',
      }))
      .filter((g) => g.codes.length > 0)
      .slice(0, 5),
  };
}
