import { describe, expect, it } from 'vitest';
import { runAgainInitial } from './run-again';

describe('runAgainInitial', () => {
  const source = {
    id: 'exp-1',
    title: 'Crystal violet assay',
    objective: 'Quantify biofilm biomass.',
    hypothesis: 'Plasma treatment increases attachment.',
    protocolVersionId: 'pv-2',
    conditions: [
      { name: 'Temperature', value: '37', unit: '°C' },
      { name: 'Shaking', value: 'none', unit: null },
    ],
    samples: [{ code: 'PD-01' }, { code: 'PD-02' }],
  };

  it('carries over the plan and links the new run to the old one', () => {
    const initial = runAgainInitial(source);
    expect(initial).toMatchObject({
      title: 'Crystal violet assay',
      objective: 'Quantify biofilm biomass.',
      hypothesis: 'Plasma treatment increases attachment.',
      protocolVersionId: 'pv-2',
      repeatsExperimentId: 'exp-1',
      sampleCodes: 'PD-01, PD-02',
    });
    expect(initial.conditions).toEqual([
      { name: 'Temperature', value: '37', unit: '°C' },
      { name: 'Shaking', value: 'none', unit: '' },
    ]);
  });

  it('starts everything that belongs to this run alone empty', () => {
    const initial = runAgainInitial(source);
    expect(initial.performedOn).toBe('');
    expect(initial.status).toBe('in_progress');
    for (const key of ['dataLocation', 'protocolNotes', 'summary', 'observations', 'conclusion', 'nextSteps'] as const) {
      expect(initial[key]).toBe('');
    }
  });

  it('copes with a bare source record', () => {
    const initial = runAgainInitial(
      { ...source, objective: null, hypothesis: null, protocolVersionId: null, conditions: [], samples: [] },
    );
    expect(initial).toMatchObject({ objective: '', hypothesis: '', protocolVersionId: '', sampleCodes: '' });
    expect(initial.conditions).toEqual([]);
  });
});
