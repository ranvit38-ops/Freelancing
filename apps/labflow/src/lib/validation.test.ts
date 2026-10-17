import { describe, expect, it } from 'vitest';
import { experimentSchema, parseSampleCodes, projectSchema, zipConditions } from './validation';

describe('experimentSchema', () => {
  const base = { title: 'Column breakthrough run' };

  it('accepts a title alone, because capture must be fast', () => {
    const parsed = experimentSchema.parse(base);
    expect(parsed.status).toBe('planned');
    expect(parsed.objective).toBeNull();
    expect(parsed.performedOn).toBeNull();
  });

  it('rejects an empty title', () => {
    expect(experimentSchema.safeParse({ title: '   ' }).success).toBe(false);
  });

  it('turns blank optional text into null rather than empty strings', () => {
    expect(experimentSchema.parse({ ...base, conclusion: '  ' }).conclusion).toBeNull();
  });

  it('parses a date and rejects nonsense', () => {
    expect(experimentSchema.parse({ ...base, performedOn: '2026-04-02' })).toMatchObject({
      performedOn: new Date('2026-04-02'),
    });
    expect(experimentSchema.safeParse({ ...base, performedOn: 'someday' }).success).toBe(false);
  });
});

describe('projectSchema', () => {
  it('splits tags and drops blanks', () => {
    expect(projectSchema.parse({ name: 'PFAS Removal', tags: 'pfas, ,sorption ,' }).tags).toEqual([
      'pfas',
      'sorption',
    ]);
  });
});

describe('parseSampleCodes', () => {
  it('splits on commas, spaces and newlines and de-duplicates', () => {
    expect(parseSampleCodes('S-104, S-105\nS-106  S-104')).toEqual(['S-104', 'S-105', 'S-106']);
  });

  it('returns nothing for empty input', () => {
    expect(parseSampleCodes('   ')).toEqual([]);
  });

  it('takes only the ID column of rows pasted from Excel, without the header', () => {
    const sheet = 'Sample ID\tTemperature\tPressure\nSB-01\t25.3\t101\nSB-02\t25.1\t99\n';
    expect(parseSampleCodes(sheet)).toEqual(['SB-01', 'SB-02']);
  });

  it('drops a header pasted on top of a single column', () => {
    expect(parseSampleCodes('Sample ID\nSB-01\nSB-02')).toEqual(['SB-01', 'SB-02']);
  });
});

describe('zipConditions', () => {
  it('keeps complete rows and drops half-filled ones', () => {
    expect(
      zipConditions({
        conditionName: ['Temperature', '', 'pH'],
        conditionValue: ['25', '10', ''],
        conditionUnit: ['°C', 'ppm', ''],
      }),
    ).toEqual([{ name: 'Temperature', value: '25', unit: '°C' }]);
  });
});
