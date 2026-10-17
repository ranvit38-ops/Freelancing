import { describe, expect, it } from 'vitest';
import { parseDelimitedText } from './dataset';
import {
  buildDraft,
  dateFromFilename,
  draftIsEmpty,
  splitUnit,
  titleFromFilename,
} from './experiment-draft';

describe('titleFromFilename', () => {
  it('turns a real filename into what the experiment is called', () => {
    expect(titleFromFilename('2024-06-12_pfas_sorption_run3.csv')).toBe('Pfas sorption run3');
  });

  it('keeps an acronym the researcher chose, rather than title-casing it', () => {
    expect(titleFromFilename('PFAS_breakthrough.csv')).toBe('PFAS breakthrough');
    expect(titleFromFilename('qPCR plate 4.xlsx')).toBe('QPCR plate 4');
  });

  it('drops the debris that carries no meaning into a record', () => {
    expect(titleFromFilename('sorption_FINAL_v2_copy.csv')).toBe('Sorption');
  });

  it('returns null when nothing is left worth using', () => {
    expect(titleFromFilename('data.csv')).toBeNull();
    expect(titleFromFilename('2024-06-12.csv')).toBeNull();
  });
});

describe('dateFromFilename', () => {
  it('reads an ISO date', () => {
    expect(dateFromFilename('2024-06-12_run.csv')).toBe('2024-06-12');
    expect(dateFromFilename('20240612_run.csv')).toBe('2024-06-12');
  });

  it('reads a day-first date, which is what most of the world writes', () => {
    expect(dateFromFilename('12-06-2024_run.csv')).toBe('2024-06-12');
  });

  it('does not invent a date out of other numbers', () => {
    expect(dateFromFilename('run_1234.csv')).toBeNull();
    expect(dateFromFilename('sample-99.csv')).toBeNull();
  });
});

describe('splitUnit', () => {
  it('separates a unit written into the header', () => {
    expect(splitUnit('mass (mg)')).toEqual({ name: 'mass', unit: 'mg' });
    expect(splitUnit('temp [C]')).toEqual({ name: 'temp', unit: 'C' });
  });

  it('leaves a header with no unit alone', () => {
    expect(splitUnit('replicate')).toEqual({ name: 'replicate', unit: null });
  });
});

describe('buildDraft', () => {
  const csv = [
    'sample,temperature (C),pH,concentration (mg/L),absorbance',
    'S-101,25,7,10,0.412',
    'S-102,25,7,20,0.788',
    'S-103,25,7,40,1.502',
  ].join('\n');

  it('reads a constant column as a condition, not as a measurement', () => {
    // The whole point: "every row says 25 degrees" means the run was done at
    // 25 degrees. That is the metadata nobody records and everybody needs.
    const draft = buildDraft([
      { filename: '2024-06-12_sorption.csv', table: parseDelimitedText(csv) },
    ]);
    expect(draft.conditions).toEqual(
      expect.arrayContaining([
        { name: 'temperature', value: '25', unit: 'C' },
        { name: 'pH', value: '7', unit: null },
      ]),
    );
  });

  it('does not mistake a column that varies for a condition', () => {
    const draft = buildDraft([{ filename: 'x.csv', table: parseDelimitedText(csv) }]);
    expect(draft.conditions.map((c) => c.name)).not.toContain('concentration');
    expect(draft.conditions.map((c) => c.name)).not.toContain('absorbance');
  });

  it('collects sample codes from the column that holds them', () => {
    const draft = buildDraft([{ filename: 'x.csv', table: parseDelimitedText(csv) }]);
    expect(draft.sampleCodes).toEqual(['S-101', 'S-102', 'S-103']);
  });

  it('summarises what varies, with its unit', () => {
    const draft = buildDraft([{ filename: 'x.csv', table: parseDelimitedText(csv) }]);
    expect(draft.observations).toContain('concentration');
    expect(draft.observations).toContain('mg/L');
  });

  it('takes the name and date from the filename', () => {
    const draft = buildDraft([
      { filename: '2024-06-12_sorption.csv', table: parseDelimitedText(csv) },
    ]);
    expect(draft.title).toBe('Sorption');
    expect(draft.performedOn).toBe('2024-06-12');
  });

  it('says where every value came from, so it can be judged rather than trusted', () => {
    const draft = buildDraft([
      { filename: '2024-06-12_sorption.csv', table: parseDelimitedText(csv) },
    ]);
    expect(draft.source.join(' ')).toContain('2024-06-12_sorption.csv');
    expect(draft.source.join(' ')).toContain('never changed');
  });

  it('does not repeat a condition when the same file is given twice', () => {
    const table = parseDelimitedText(csv);
    const draft = buildDraft([
      { filename: 'a.csv', table },
      { filename: 'a.csv', table },
    ]);
    expect(draft.conditions.filter((c) => c.name === 'temperature')).toHaveLength(1);
  });

  it('will not call a single row constant, because one row varies over nothing', () => {
    const draft = buildDraft([
      { filename: 'one.csv', table: parseDelimitedText('temperature,ph\n25,7') },
    ]);
    expect(draft.conditions).toEqual([]);
  });

  it('handles a file it could not parse without inventing anything', () => {
    const draft = buildDraft([{ filename: 'scan.pdf', table: null }]);
    expect(draft.conditions).toEqual([]);
    expect(draft.sampleCodes).toEqual([]);
    expect(draft.observations).toBeNull();
    // The name is still worth having: it is the one thing a PDF does tell you.
    expect(draft.title).toBe('Scan');
  });

  it('reports an empty draft as empty rather than as a filled-in blank', () => {
    expect(draftIsEmpty(buildDraft([{ filename: 'data.csv', table: null }]))).toBe(true);
    expect(draftIsEmpty(buildDraft([{ filename: 'sorption.csv', table: null }]))).toBe(false);
  });
});
