/**
 * What a newcomer should look at, and in what order.
 *
 * The point of Labvia for a new student is not having to ask five people
 * where to start. This turns what the lab has already recorded into a
 * sequence: why each project exists, what is already known, how the work is
 * done, the first run everything is compared to, where it stands now, the
 * latest summary, and then the lab's shared files in the order a person
 * would want them (orientation before methods, methods before data).
 *
 * Pure, so the order is testable and the same every time.
 */

export type PathProject = {
  id: string;
  name: string;
  researchQuestion: string | null;
  status: string;
  isExample: boolean;
  updatedAt: Date | string;
};
export type PathExperiment = {
  id: string;
  code: string;
  title: string;
  projectId: string;
  performedOn: string | null;
  status: string;
  protocolName: string | null;
};
export type PathProtocol = { id: string; name: string; projectId: string | null };
export type PathUpdate = { id: string; title: string; projectId: string; updatedAt: Date | string };
export type PathFile = { id: string; filename: string; createdAt: Date | string; attached: boolean };

export type ReadingStep = {
  key: string;
  title: string;
  why: string;
  href: string;
  group: string;
};

const ACTIVE = new Set(['active', 'planning']);

/** Orientation first, then methods, background, data, and last the slides. */
export function fileRank(filename: string): number {
  const name = filename.toLowerCase();
  if (/(readme|welcome|onboard|overview|intro|handbook|guide|start)/.test(name)) return 0;
  if (/(safety|sop|protocol|method|procedure|training)/.test(name)) return 1;
  if (/(review|background|paper|proposal|grant|aims)/.test(name) || /\.(pdf|docx?)$/.test(name)) return 2;
  if (/\.(csv|tsv|xlsx?|json)$/.test(name)) return 3;
  if (/(slide|meeting|present|talk|poster)/.test(name) || /\.pptx?$/.test(name)) return 4;
  return 5;
}

const FILE_WHY = [
  'Orientation written for people joining. Read it first.',
  'How things are done here, and what to be careful of.',
  'Background reading behind the work.',
  'Raw data the lab has shared, oldest first.',
  'Slides from meetings. Easier once you know the background.',
  'Shared with the lab.',
];

function time(value: Date | string | null): number {
  return value ? new Date(value).getTime() : 0;
}

export function buildReadingPath(input: {
  projects: PathProject[];
  experiments: PathExperiment[];
  protocols: PathProtocol[];
  updates: PathUpdate[];
  files: PathFile[];
  maxExperimentsPerProject?: number;
}): ReadingStep[] {
  const steps: ReadingStep[] = [];
  const perProject = input.maxExperimentsPerProject ?? 5;

  // Live projects first, most recently touched first; the worked example last.
  const projects = [...input.projects].sort(
    (a, b) =>
      Number(a.isExample) - Number(b.isExample) ||
      Number(ACTIVE.has(b.status)) - Number(ACTIVE.has(a.status)) ||
      time(b.updatedAt) - time(a.updatedAt),
  );

  for (const p of projects) {
    const group = p.isExample ? `${p.name} (example)` : p.name;
    steps.push({
      key: `project:${p.id}`,
      title: `Why “${p.name}” exists`,
      why: p.researchQuestion ? `The question it is answering: ${p.researchQuestion}` : 'What the project is for and where it is up to.',
      href: `/projects/${p.id}`,
      group,
    });

    const runs = input.experiments
      .filter((e) => e.projectId === p.id)
      .sort((a, b) => (a.performedOn ?? '9999').localeCompare(b.performedOn ?? '9999') || a.code.localeCompare(b.code));

    if (runs.length > 1) {
      steps.push({
        key: `memory:${p.id}`,
        title: `What the lab already knows about ${p.name}`,
        why: 'Every run summarised in one page, so the details that follow make sense.',
        href: `/projects/${p.id}/memory`,
        group,
      });
    }

    const usedProtocols = new Set(runs.map((e) => e.protocolName).filter(Boolean));
    for (const pr of input.protocols.filter((x) => x.projectId === p.id || usedProtocols.has(x.name))) {
      steps.push({
        key: `protocol:${pr.id}`,
        title: `How it is done: ${pr.name}`,
        why: 'The method the runs follow. Read it before the results.',
        href: `/protocols/${pr.id}`,
        group,
      });
    }

    // The first run, then the most recent ones: the baseline and where it is
    // now matter more than every step in between.
    const picked = runs.length <= perProject ? runs : [runs[0]!, ...runs.slice(-(perProject - 1))];
    picked.forEach((e, i) => {
      const first = i === 0 && runs.length > 1;
      const last = i === picked.length - 1 && runs.length > 1;
      steps.push({
        key: `experiment:${e.id}`,
        title: `${e.code}: ${e.title}`,
        why: first
          ? 'The first run. Later ones are compared against it.'
          : last
            ? 'The most recent run: where the project stands now.'
            : e.status === 'planned'
              ? 'Planned next.'
              : 'A step along the way.',
        href: `/experiments/${e.id}`,
        group,
      });
    });

    const latestUpdate = input.updates
      .filter((u) => u.projectId === p.id)
      .sort((a, b) => time(b.updatedAt) - time(a.updatedAt))[0];
    if (latestUpdate) {
      steps.push({
        key: `update:${latestUpdate.id}`,
        title: latestUpdate.title,
        why: 'The latest write-up of this project. A good check that you have followed it.',
        href: `/updates/${latestUpdate.id}`,
        group,
      });
    }
  }

  const loose = input.files
    // Screenshots pasted into chat are conversation, not reading.
    .filter((f) => !f.attached && !/^pasted-\d+/.test(f.filename))
    .sort((a, b) => fileRank(a.filename) - fileRank(b.filename) || time(a.createdAt) - time(b.createdAt));
  for (const f of loose.slice(0, 12)) {
    steps.push({
      key: `file:${f.id}`,
      title: f.filename,
      why: FILE_WHY[fileRank(f.filename)]!,
      href: `/api/files/${f.id}`,
      group: 'Lab files',
    });
  }

  return steps;
}
