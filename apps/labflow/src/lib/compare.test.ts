import { describe, expect, it } from 'vitest';
import { buildComparison, changeTrail, type ComparableExperiment } from './compare';

const base: ComparableExperiment = {
  id: 'a',
  number: 37,
  title: 'Run A',
  status: 'completed',
  performedOn: '2026-03-01',
  researcherName: 'Joseph Okafor',
  objective: 'Measure breakthrough.',
  hypothesis: 'Later than v3.',
  protocolName: 'PFAS Extraction',
  protocolVersion: 4,
  conditions: [{ name: 'Temperature', value: '25', unit: '°C' }],
  sampleCodes: ['S-104'],
  summary: 'Breakthrough at 34 BV',
  observations: null,
  conclusion: null,
  nextSteps: null,
};

const row = (rows: ReturnType<typeof buildComparison>, key: string) =>
  rows.find((r) => r.key === key);

describe('buildComparison', () => {
  it('returns nothing for an empty selection', () => {
    expect(buildComparison([])).toEqual([]);
  });

  it('marks a row as differing only when recorded values differ', () => {
    const rows = buildComparison([
      base,
      { ...base, id: 'b', number: 38 },
      { ...base, id: 'c', number: 39, conditions: [{ name: 'Temperature', value: '30', unit: '°C' }] },
    ]);
    expect(row(rows, 'condition:Temperature')?.values).toEqual(['25 °C', '25 °C', '30 °C']);
    expect(row(rows, 'condition:Temperature')?.differs).toBe(true);
    expect(row(rows, 'researcher')?.differs).toBe(false);
  });

  it('surfaces protocol version changes', () => {
    const rows = buildComparison([base, { ...base, id: 'b', protocolVersion: 5 }]);
    expect(row(rows, 'protocol')?.values).toEqual(['PFAS Extraction v4', 'PFAS Extraction v5']);
    expect(row(rows, 'protocol')?.differs).toBe(true);
  });

  it('includes a condition recorded in only one run, as a gap', () => {
    const rows = buildComparison([
      base,
      { ...base, id: 'b', conditions: [{ name: 'pH', value: '7.2', unit: null }] },
    ]);
    expect(row(rows, 'condition:pH')?.values).toEqual([null, '7.2']);
    expect(row(rows, 'condition:pH')?.differs).toBe(true);
  });

  it('does not treat two undocumented fields as a difference', () => {
    const rows = buildComparison([base, { ...base, id: 'b' }]);
    expect(row(rows, 'conclusion')?.differs).toBe(false);
  });
});

describe('changeTrail', () => {
  it('renders a compact trail with gaps marked', () => {
    expect(changeTrail(['25 °C', '25 °C', '30 °C'])).toBe('25 °C → 25 °C → 30 °C');
    expect(changeTrail(['v4', null])).toBe('v4 → —');
  });
});
