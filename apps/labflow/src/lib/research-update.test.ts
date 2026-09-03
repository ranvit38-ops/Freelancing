import { describe, expect, it } from 'vitest';
import { buildUpdateDraft, defaultUpdateTitle } from './research-update';
import type { ComparableExperiment } from './compare';

const project = { name: 'PFAS Removal Study', researchQuestion: 'Which sorbent lasts longest?', description: null };

const base: ComparableExperiment = {
  id: 'a',
  number: 4,
  title: 'Baseline GAC column',
  status: 'completed',
  performedOn: '2026-02-03',
  researcherName: 'Joseph Okafor',
  objective: 'Measure breakthrough.',
  hypothesis: 'Later than v3.',
  protocolName: 'PFAS Extraction',
  protocolVersion: 4,
  conditions: [{ name: 'Temperature', value: '25', unit: '°C' }],
  sampleCodes: ['S-104'],
  summary: 'Breakthrough at 34 bed volumes.',
  observations: null,
  conclusion: 'GAC gives a short breakthrough time.',
  nextSteps: 'Try the resin.',
};

const section = (sections: ReturnType<typeof buildUpdateDraft>, heading: string) =>
  sections.find((s) => s.heading === heading)!;

describe('buildUpdateDraft', () => {
  it('uses the project research question verbatim', () => {
    expect(section(buildUpdateDraft(project, [base]), 'Research question').body).toBe(
      'Which sorbent lasts longest?',
    );
  });

  it('attributes results and interpretation to the researcher, not the record', () => {
    const sections = buildUpdateDraft(project, [base]);
    expect(section(sections, 'Results').source).toBe('researcher');
    expect(section(sections, 'Interpretation').source).toBe('researcher');
    expect(section(sections, 'Experimental conditions').source).toBe('record');
  });

  it('renders condition changes as a trail across the selected runs', () => {
    const sections = buildUpdateDraft(project, [
      base,
      { ...base, id: 'b', number: 5, conditions: [{ name: 'Temperature', value: '30', unit: '°C' }] },
    ]);
    expect(section(sections, 'Experimental conditions').body).toContain('Temperature: 25 °C → 30 °C');
    expect(section(sections, 'Comparison with previous experiments').body).toContain('Temperature');
  });

  it('reports objectives and hypotheses, not experiment titles', () => {
    const sections = buildUpdateDraft(project, [base]);
    expect(section(sections, 'Objectives').body).toBe('EXP-004: Measure breakthrough.');
    expect(section(sections, 'Hypotheses').body).toBe('EXP-004: Later than v3.');
  });

  it('says so plainly when a section has nothing recorded', () => {
    const sections = buildUpdateDraft(project, [{ ...base, summary: null, conclusion: null }]);
    expect(section(sections, 'Results').body).toBe('No result summaries recorded.');
    expect(section(sections, 'Interpretation').body).toBe('No conclusions recorded yet.');
  });

  it('does not pretend to compare a single experiment', () => {
    expect(section(buildUpdateDraft(project, [base]), 'Comparison with previous experiments').body)
      .toContain('nothing to compare');
  });

  it('never invents content for an empty selection', () => {
    const sections = buildUpdateDraft(project, []);
    expect(section(sections, 'Experimental approach').body).toBe('No experiments selected.');
    expect(sections.every((s) => s.body.trim().length > 0)).toBe(true);
  });
});

describe('defaultUpdateTitle', () => {
  it('names a single experiment and a range', () => {
    expect(defaultUpdateTitle('PFAS', [{ number: 4 }])).toBe('PFAS — EXP-004');
    expect(defaultUpdateTitle('PFAS', [{ number: 6 }, { number: 4 }])).toBe('PFAS — EXP-004 to EXP-006');
    expect(defaultUpdateTitle('PFAS', [])).toBe('PFAS');
  });
});
