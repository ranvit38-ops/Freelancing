import { describe, expect, it } from 'vitest';
import { buildReadingPath, fileRank, MAX_PATH_FILES, pathFiles } from './reading-path';

const project = (id: string, extra: Partial<Parameters<typeof buildReadingPath>[0]['projects'][number]> = {}) => ({
  id,
  name: `Project ${id}`,
  researchQuestion: `Question ${id}?`,
  status: 'active',
  isExample: false,
  updatedAt: '2026-09-01',
  ...extra,
});
const run = (id: string, projectId: string, performedOn: string) => ({
  id,
  code: `EXP-${id}`,
  title: `Run ${id}`,
  projectId,
  performedOn,
  status: 'completed',
  protocolName: 'Column packing',
});

describe('buildReadingPath', () => {
  const steps = buildReadingPath({
    projects: [project('ex', { isExample: true, updatedAt: '2026-09-20' }), project('a')],
    experiments: [run('3', 'a', '2026-03-01'), run('1', 'a', '2026-01-01'), run('2', 'a', '2026-02-01')],
    protocols: [{ id: 'p1', name: 'Column packing', projectId: null }],
    updates: [{ id: 'u1', title: 'Spring update', projectId: 'a', updatedAt: '2026-04-01' }],
    files: [
      { id: 'f1', filename: 'group-meeting.pptx', createdAt: '2026-01-01', attached: false },
      { id: 'f2', filename: 'README-new-students.pdf', createdAt: '2026-05-01', attached: false },
      { id: 'f3', filename: 'lab-safety-SOP.pdf', createdAt: '2026-02-01', attached: false },
      { id: 'f4', filename: 'raw.csv', createdAt: '2026-03-01', attached: true },
      { id: 'f5', filename: 'pasted-1790380047285.png', createdAt: '2026-03-01', attached: false },
    ],
  });
  const keys = steps.map((s) => s.key);

  it('leaves the made-up worked example out once the lab has a real project', () => {
    expect(keys).toContain('project:a');
    expect(keys.some((k) => k.endsWith(':ex'))).toBe(false);
  });

  it('leaves the worked example out once the lab has shared a file, even with no projects yet', () => {
    const steps = buildReadingPath({
      projects: [project('ex', { isExample: true })],
      experiments: [],
      protocols: [],
      updates: [],
      files: [{ id: 'w', filename: 'Welcome.pdf', createdAt: '2026-01-01', attached: false }],
    });
    expect(steps.map((s) => s.key)).toEqual(['file:w']);
  });

  it('shows the worked example while it is all the lab has', () => {
    const only = buildReadingPath({
      projects: [project('ex', { isExample: true, name: 'Example: PFAS removal' })],
      experiments: [],
      protocols: [],
      updates: [],
      files: [],
    });
    expect(only[0]).toMatchObject({ key: 'project:ex', group: 'Example: PFAS removal' });
  });

  it('goes why → what is known → how → first run → … → latest → write-up', () => {
    expect(keys.slice(0, 7)).toEqual([
      'project:a',
      'memory:a',
      'protocol:p1',
      'experiment:1',
      'experiment:2',
      'experiment:3',
      'update:u1',
    ]);
    expect(steps.find((s) => s.key === 'experiment:1')?.why).toMatch(/first run/i);
    expect(steps.find((s) => s.key === 'experiment:3')?.why).toMatch(/most recent/i);
  });

  it('orders shared files orientation first, slides last, and skips ones on an experiment or pasted into chat', () => {
    const files = keys.filter((k) => k.startsWith('file:'));
    expect(files).toEqual(['file:f2', 'file:f3', 'file:f1']);
  });
});

describe('documents and long file lists on the path', () => {
  const empty = { projects: [], experiments: [], protocols: [], updates: [] };

  it('opens a Labvia document in the editor, titled without its .md', () => {
    const [step] = buildReadingPath({
      ...empty,
      files: [{ id: 'd1', filename: 'Welcome to the lab.md', createdAt: '2026-01-01', attached: false, isDocument: true }],
    });
    expect(step).toMatchObject({ href: '/docs/d1', title: 'Welcome to the lab' });
    expect(step!.why).toMatch(/read it first/i);
  });

  it('still downloads an uploaded markdown file rather than opening the editor', () => {
    const [step] = buildReadingPath({
      ...empty,
      files: [{ id: 'u1', filename: 'notes.md', createdAt: '2026-01-01', attached: false }],
    });
    expect(step).toMatchObject({ href: '/api/files/u1', title: 'notes.md' });
  });

  it('lists at most MAX_PATH_FILES files, so the page can say how many more there are', () => {
    const files = Array.from({ length: MAX_PATH_FILES + 3 }, (_, i) => ({
      id: `f${i}`,
      filename: `data-${i}.csv`,
      createdAt: `2026-01-${String(i + 1).padStart(2, '0')}`,
      attached: false,
    }));
    expect(buildReadingPath({ ...empty, files })).toHaveLength(MAX_PATH_FILES);
    expect(pathFiles(files).length - MAX_PATH_FILES).toBe(3);
  });
});

describe('fileRank', () => {
  it('reads intent from the name', () => {
    expect(fileRank('Welcome to the lab.docx')).toBe(0);
    expect(fileRank('HPLC_SOP_v3.pdf')).toBe(1);
    expect(fileRank('review-2024.pdf')).toBe(2);
    expect(fileRank('plate_reader.xlsx')).toBe(3);
    expect(fileRank('group meeting.pptx')).toBe(4);
  });
});
