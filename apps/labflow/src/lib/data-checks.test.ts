import { describe, expect, it } from 'vitest';
import { checkData, welch } from './data-checks';

const toRows = (text: string) => {
  const [head, ...lines] = text.trim().split('\n').map((l) => l.split(','));
  return { columns: head!, rows: lines.map((cells) => Object.fromEntries(head!.map((h, i) => [h, cells[i] ?? '']))) };
};

// Three CRISPRi lines, GAPDH reference, triplicates; sgHDAC2 replicate 2 is off.
const CT: Record<string, Record<string, number[]>> = {
  NT: { GAPDH: [17.9, 18.0, 18.1], KDM5B: [24.1, 24.3, 24.2], HDAC2: [22.8, 22.7, 22.9] },
  sgKDM5B: { GAPDH: [18.0, 18.1, 17.9], KDM5B: [26.9, 27.1, 27.0], HDAC2: [22.9, 22.8, 22.8] },
  sgHDAC2: { GAPDH: [18.1, 18.2, 18.0], KDM5B: [24.2, 24.2, 24.4], HDAC2: [23.5, 24.6, 23.6] },
};
function qpcr() {
  const lines = ['Sample,Condition,Target,Replicate,Ct'];
  let n = 1;
  for (const [cond, targets] of Object.entries(CT)) {
    for (let rep = 0; rep < 3; rep++, n++) {
      for (const [target, cts] of Object.entries(targets)) lines.push(`S${n},${cond},${target},${rep + 1},${cts[rep]}`);
    }
  }
  return toRows(lines.join('\n'));
}

describe('checkData: qPCR', () => {
  it('computes knockdown by ΔΔCt against the control and reference gene', () => {
    const { columns, rows } = qpcr();
    const r = checkData(columns, rows);
    expect(r.kind).toMatch(/qPCR/);
    expect(r.summary).toContain('reference GAPDH');
    expect(r.summary).toContain('control NT');
    const [kdm5b, hdac2] = r.next;
    expect(kdm5b).toMatchObject({ level: 'ok' });
    expect(kdm5b!.text).toContain('85.6%');
    expect(hdac2).toMatchObject({ level: 'flag' });
    expect(hdac2!.text).toContain('only 50%');
    // The furthest-out replicate is named, so the re-run is specific.
    expect(hdac2!.text).toContain('Re-run S8');
    expect(r.checks.some((c) => c.level === 'flag' && c.text.includes('SD 0.61'))).toBe(true);
    expect(r.bars.map((b) => b.flag)).toEqual([false, true]);
  });

  it('moves the call with the knockdown bar', () => {
    const { columns, rows } = qpcr();
    const r = checkData(columns, rows, { knockdown: 45 });
    expect(r.next.every((n) => n.level === 'ok')).toBe(true);
    expect(r.refLine?.value).toBe(55);
  });

  it('asks for a reference gene rather than guessing one', () => {
    const r = checkData(...Object.values(toRows('Condition,Target,Ct\nNT,KDM5B,24\nsgKDM5B,KDM5B,27')) as [string[], Record<string, string>[]]);
    expect(r.next[0]!.text).toContain('reference-gene');
  });
});

describe('checkData: sequencing QC', () => {
  it('flags shallow samples for resequencing', () => {
    const { columns, rows } = toRows('Sample,Reads (M),%Q30,%Dup\nCG-0407,38.2,93.1,41.7\nCG-0412,12.9,88.4,22.0\nCG-0419,41.5,94.0,18.3');
    const r = checkData(columns, rows);
    expect(r.kind).toBe('Sequencing QC');
    expect(r.next[0]).toEqual({ level: 'flag', text: 'Re-pool and resequence CG-0412, or leave it out of this analysis.' });
    expect(r.checks.some((c) => c.text.includes('41.7% duplication'))).toBe(true);
  });
});

describe('checkData: anything else', () => {
  it('runs Welch on two groups of three and reports p', () => {
    const { columns, rows } = toRows('Group,Yield\nWT,10.1\nWT,9.8\nWT,10.4\nKO,7.2\nKO,7.9\nKO,6.8');
    const r = checkData(columns, rows);
    expect(r.next[0]!.text).toContain('p = 0.004');
  });

  it('says when there are too few replicates instead of testing, and ignores replicate IDs as groups', () => {
    const { columns, rows } = toRows('Replicate,Arm,gDNA (ug),Coverage\nR1,T0,412,820x\nR1,D14,398,790x\nR2,T0,405,805x\nR2,D14,377,750x');
    const r = checkData(columns, rows);
    expect(r.next.map((n) => n.text)).toEqual([
      'Every row is at or above 500x coverage (lowest 750x). Enough to go ahead.',
      'Arm (T0 vs D14): only 2 values per group, too few for a t-test on gDNA (ug) and Coverage. Add a third replicate per group to compare them.',
    ]);
  });

  it('notes empty cells', () => {
    const { columns, rows } = toRows('Sample,Value\nA,1\nB,\nC,3');
    expect(checkData(columns, rows).checks[0]!.text).toBe('1 empty cell. Fill them in or mark them NA.');
  });
});

describe('welch', () => {
  it('matches a known result', () => {
    const { t, df, p } = welch([10.1, 9.8, 10.4], [7.2, 7.9, 6.8]);
    expect(t).toBeCloseTo(7.668, 2);
    expect(df).toBeCloseTo(3.07, 1);
    expect(p).toBeGreaterThan(0.003);
    expect(p).toBeLessThan(0.006);
  });
});
