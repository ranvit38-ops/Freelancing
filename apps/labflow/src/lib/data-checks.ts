/**
 * Checks on a dataset, and the step they point to next.
 *
 * Three shapes are recognised from their column names: qPCR Ct values
 * (knockdown by ΔΔCt against a reference gene and a control condition),
 * sequencing QC (reads per sample), and anything else (summary checks, and a
 * Welch t-test when there are two groups with at least three values each).
 *
 * Every suggestion comes from a stated threshold the person can see, never
 * from a model, so it is the same every time and can be argued with. The
 * thresholds are common bench rules of thumb, shown on the page as such; the
 * knockdown bar is the person's to set.
 */

export type Level = 'ok' | 'warn' | 'flag';
export type Finding = { level: Level; text: string };
export type Bar = { label: string; value: number; display: string; flag: boolean };

export type DataChecks = {
  kind: string;
  summary: string;
  next: Finding[];
  checks: Finding[];
  bars: Bar[];
  chartTitle: string;
  refLine?: { value: number; label: string };
  max: number;
  /** The rules of thumb used, so the page can say what the calls rest on. */
  rules: string[];
};

export const DEFAULT_KNOCKDOWN = 70;
/** Replicate Ct spread above this is re-run in most labs' qPCR SOPs. */
export const MAX_REPLICATE_SD = 0.5;
export const MIN_READS_MILLIONS = 20;
export const MIN_SCREEN_COVERAGE = 500;

type Rows = Record<string, string>[];

export const toNum = (v: string | undefined): number => {
  const s = String(v ?? '').trim().replace(/[x%×]$/i, '').replace(/,/g, '');
  return s === '' || Number.isNaN(Number(s)) ? NaN : Number(s);
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => (xs.length < 2 ? 0 : Math.sqrt(xs.reduce((a, x) => a + (x - mean(xs)) ** 2, 0) / (xs.length - 1)));
const r1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString('en-US');
const r2 = (x: number) => (Math.round(x * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const listJoin = (xs: string[]) => (xs.length < 3 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const findCol = (cols: string[], re: RegExp) => cols.find((c) => re.test(c));

/* ── Welch's t-test ─────────────────────────────────────────────────────── */

function lgamma(z: number): number {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  const zz = z - 1;
  let x = c[0]!;
  for (let i = 1; i < 9; i++) x += c[i]! / (zz + i);
  const t = zz + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(x);
}

function betacf(a: number, b: number, x: number): number {
  const tiny = 1e-30;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  d = 1 / (Math.abs(d) < tiny ? tiny : d);
  let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    for (const aa of [(m * (b - m) * x) / ((a - 1 + m2) * (a + m2)), (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + 1 + m2))]) {
      d = 1 + aa * d;
      d = 1 / (Math.abs(d) < tiny ? tiny : d);
      c = 1 + aa / c;
      if (Math.abs(c) < tiny) c = tiny;
      h *= d * c;
    }
    if (Math.abs(d * c - 1) < 3e-12) break;
  }
  return h;
}

function ibeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Two-sided Welch's t-test. */
export function welch(a: number[], b: number[]): { t: number; df: number; p: number } {
  const va = sd(a) ** 2 / a.length;
  const vb = sd(b) ** 2 / b.length;
  const t = (mean(a) - mean(b)) / Math.sqrt(va + vb);
  const df = (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1));
  return { t, df, p: ibeta(df / (df + t * t), df / 2, 0.5) };
}

const formatP = (p: number) => (p < 0.001 ? 'p < 0.001' : `p = ${p < 0.01 ? p.toFixed(3) : r2(p)}`);

/* ── qPCR ───────────────────────────────────────────────────────────────── */

const REF_GENE_RE = /^(GAPDH|ACTB|B2M|18S|RPLP0|HPRT1?|TBP|PPIA)$/i;
const CONTROL_RE = /^(nt|ntc|non[- ]?targeting|control|ctrl|scramble|scr|vehicle|dmso|wt|mock|empty)/i;

function qpcr(columns: string[], rows: Rows, cols: { ct: string; target: string; cond: string }, threshold: number): DataChecks {
  const sample = findCol(columns, /sample|well/i);
  const rep = findCol(columns, /^rep/i);
  const keyOf = (r: Record<string, string>) => (sample ? r[sample] ?? '' : `${r[cols.cond]} rep ${rep ? r[rep] : '?'}`);
  const checks: Finding[] = [];
  const next: Finding[] = [];
  const rules = [`Replicates more than ${MAX_REPLICATE_SD} Ct apart (SD) are flagged for a re-run.`, `Knockdown is called against your bar of ${threshold}%.`];
  const usable = rows.filter((r) => !Number.isNaN(toNum(r[cols.ct])) && r[cols.target] && r[cols.cond]);
  const missing = rows.length - usable.length;
  if (missing) checks.push({ level: 'flag', text: `${plural(missing, 'row')} without a Ct value, condition or target. They are left out.` });
  const targets = [...new Set(usable.map((r) => r[cols.target]!))];
  const conditions = [...new Set(usable.map((r) => r[cols.cond]!))];
  const ref = targets.find((t) => REF_GENE_RE.test(t));
  const control = conditions.find((c) => CONTROL_RE.test(c)) ?? conditions[0];
  if (!ref || !control) {
    return {
      kind: 'qPCR (Ct values)',
      summary: `${usable.length} Ct values · ${plural(targets.length, 'target')}`,
      checks: [...checks, { level: 'flag', text: 'No reference gene found (looked for GAPDH, ACTB, B2M, 18S, RPLP0, HPRT1, TBP and PPIA).' }],
      next: [{ level: 'flag', text: 'Add reference-gene wells, then the fold change appears here.' }],
      bars: [],
      chartTitle: '',
      max: 100,
      rules,
    };
  }
  const refCt = new Map(usable.filter((r) => r[cols.target] === ref).map((r) => [keyOf(r), toNum(r[cols.ct])]));
  type Group = { cond: string; target: string; cts: number[]; dcts: number[]; rows: Record<string, string>[]; worst?: Record<string, string> };
  const groups = new Map<string, Group>();
  for (const r of usable) {
    const ct = toNum(r[cols.ct]);
    if (ct > 35) checks.push({ level: 'warn', text: `${keyOf(r)} ${r[cols.target]}: Ct ${r1(ct)} is near the detection limit.` });
    const key = `${r[cols.cond]}|${r[cols.target]}`;
    if (!groups.has(key)) groups.set(key, { cond: r[cols.cond]!, target: r[cols.target]!, cts: [], dcts: [], rows: [] });
    const g = groups.get(key)!;
    g.cts.push(ct);
    g.rows.push(r);
    const rc = refCt.get(keyOf(r));
    if (r[cols.target] !== ref && rc !== undefined) g.dcts.push(ct - rc);
  }
  for (const g of groups.values()) {
    const s = sd(g.cts);
    if (g.cts.length > 1 && s > MAX_REPLICATE_SD) {
      const m = mean(g.cts);
      g.worst = g.rows.reduce((a, r) => (Math.abs(toNum(r[cols.ct]) - m) > Math.abs(toNum(a[cols.ct]) - m) ? r : a));
      checks.push({ level: 'flag', text: `${g.cond} · ${g.target}: replicates spread SD ${r2(s)} Ct. ${keyOf(g.worst)} at ${r1(toNum(g.worst[cols.ct]))} is furthest out.` });
    }
  }
  const bars: Bar[] = [];
  for (const g of groups.values()) {
    if (g.cond === control || g.target === ref || !g.dcts.length) continue;
    const base = groups.get(`${control}|${g.target}`);
    if (!base?.dcts.length) continue;
    const ddct = mean(g.dcts) - mean(base.dcts);
    const fc = 2 ** -ddct;
    const left = fc * 100;
    const onTarget = g.cond.toLowerCase().replace(/^(sg|si|sh)/, '').includes(g.target.toLowerCase());
    if (onTarget) {
      const kd = 100 - left;
      bars.push({ label: `${g.cond} · ${g.target}`, value: left, display: `${r1(left)}%`, flag: kd < threshold });
      if (kd >= threshold) {
        next.push({ level: 'ok', text: `${g.cond} knocks ${g.target} down by ${r1(kd)}% (ΔΔCt ${r2(ddct)}), above your ${threshold}% bar. This line is ready for the next step.` });
      } else {
        next.push({
          level: 'flag',
          text: `${g.cond} knocks ${g.target} down by only ${r1(kd)}% (ΔΔCt ${r2(ddct)}), below your ${threshold}% bar. ${g.worst ? `Re-run ${keyOf(g.worst)} first, since its replicate is off. ` : ''}If it holds, try a second guide or check the knockdown machinery before going further.`,
        });
      }
    } else if (Math.abs(ddct) >= 1) {
      checks.push({ level: 'warn', text: `${g.cond} also changes ${g.target} ${r1(fc)}-fold. Check for an off-target effect.` });
    }
  }
  if (!next.length) {
    next.push({ level: 'warn', text: `No on-target pairs found. Name each condition after its target (for example sgKDM5B for KDM5B) and include a control such as NT.` });
  }
  if (!checks.length) checks.push({ level: 'ok', text: `Replicates agree (all within ${MAX_REPLICATE_SD} Ct) and every well has a value.` });
  return {
    kind: 'qPCR knockdown (ΔΔCt)',
    summary: `${usable.length} Ct values · ${plural(conditions.length, 'condition')} · reference ${ref} · control ${control}`,
    next,
    checks,
    bars,
    chartTitle: 'Expression left, relative to control',
    refLine: { value: 100 - threshold, label: `${threshold}% knockdown` },
    max: 100,
    rules,
  };
}

/* ── Sequencing QC ──────────────────────────────────────────────────────── */

function seqQc(columns: string[], rows: Rows, readsCol: string): DataChecks {
  const sample = findCol(columns, /sample/i)!;
  const q30 = findCol(columns, /q30/i);
  const dup = findCol(columns, /dup/i);
  const checks: Finding[] = [];
  const low: string[] = [];
  const bars: Bar[] = [];
  for (const r of rows) {
    const reads = toNum(r[readsCol]);
    const name = r[sample] || 'row';
    if (Number.isNaN(reads)) continue;
    const flag = reads < MIN_READS_MILLIONS;
    if (flag) low.push(name);
    bars.push({ label: name, value: reads, display: `${r1(reads)}M`, flag });
    if (q30 && toNum(r[q30]) < 90) checks.push({ level: 'warn', text: `${name}: ${r1(toNum(r[q30]))}% Q30, below 90%.` });
    if (dup && toNum(r[dup]) > 40) checks.push({ level: 'warn', text: `${name}: ${r1(toNum(r[dup]))}% duplication, above 40%. Often fine for highly expressed genes; check library complexity.` });
  }
  if (low.length) checks.unshift({ level: 'flag', text: `${listJoin(low)} ${low.length === 1 ? 'has' : 'have'} fewer than ${MIN_READS_MILLIONS}M reads, too shallow for differential expression.` });
  const fine = bars.filter((b) => !b.flag).map((b) => b.label);
  const next: Finding[] = [];
  if (low.length) next.push({ level: 'flag', text: `Re-pool and resequence ${listJoin(low)}, or leave ${low.length === 1 ? 'it' : 'them'} out of this analysis.` });
  if (fine.length) next.push({ level: 'ok', text: `${listJoin(fine)} ${fine.length === 1 ? 'is' : 'are'} deep enough. Continue to alignment and counting.` });
  return {
    kind: 'Sequencing QC',
    summary: `${plural(bars.length, 'sample')} · reads in millions`,
    next,
    checks: checks.length ? checks : [{ level: 'ok', text: `Every sample has at least ${MIN_READS_MILLIONS}M reads.` }],
    bars,
    chartTitle: 'Reads per sample (millions)',
    refLine: { value: MIN_READS_MILLIONS, label: `${MIN_READS_MILLIONS}M minimum` },
    max: Math.max(MIN_READS_MILLIONS * 1.25, ...bars.map((b) => b.value)) * 1.1,
    rules: [`Under ${MIN_READS_MILLIONS}M reads is flagged as too shallow; Q30 under 90% and duplication over 40% are noted.`],
  };
}

/* ── Anything else ──────────────────────────────────────────────────────── */

function generic(columns: string[], rows: Rows): DataChecks {
  const numeric = new Set(
    columns.filter((c) => {
      const vals = rows.map((r) => r[c] ?? '').filter((v) => v.trim() !== '');
      return vals.length > 0 && vals.filter((v) => !Number.isNaN(toNum(v))).length / vals.length >= 0.8;
    }),
  );
  const checks: Finding[] = [];
  const next: Finding[] = [];
  const rules = ['Values more than 2 SD from their column mean are noted when a column has 5 or more.'];
  const empty = rows.reduce((n, r) => n + columns.filter((c) => (r[c] ?? '').trim() === '').length, 0);
  if (empty) checks.push({ level: 'warn', text: `${plural(empty, 'empty cell')}. Fill them in or mark them NA.` });
  for (const c of numeric) {
    const xs = rows.map((r) => toNum(r[c])).filter((x) => !Number.isNaN(x));
    if (!xs.length) continue;
    const m = mean(xs);
    const s = sd(xs);
    if (xs.length >= 5 && s > 0) {
      const out = rows.filter((r) => Math.abs((toNum(r[c]) - m) / s) > 2);
      if (out.length) checks.push({ level: 'warn', text: `${c}: ${plural(out.length, 'value')} more than 2 SD from the mean (${out.map((r) => r[c]).join(', ')}). Check for a pipetting or entry error.` });
    }
    if (/coverage/i.test(c)) {
      rules.push(`Coverage under ${MIN_SCREEN_COVERAGE}x is flagged, the usual floor for a pooled CRISPR screen.`);
      const low = rows.filter((r) => toNum(r[c]) < MIN_SCREEN_COVERAGE);
      if (low.length) checks.push({ level: 'flag', text: `${plural(low.length, 'row')} below ${MIN_SCREEN_COVERAGE}x coverage.` });
      else next.push({ level: 'ok', text: `Every row is at or above ${MIN_SCREEN_COVERAGE}x coverage (lowest ${r1(Math.min(...xs))}x). Enough to go ahead.` });
    }
  }
  // Two groups and a measurement: compare them. Replicate IDs are not groups.
  for (const g of columns) {
    if (numeric.has(g) || /^rep/i.test(g)) continue;
    const levels = [...new Set(rows.map((r) => r[g] ?? '').filter(Boolean))];
    if (levels.length !== 2) continue;
    const [la, lb] = levels as [string, string];
    const tooFew: { m: string; n: number }[] = [];
    for (const m of numeric) {
      const a = rows.filter((r) => r[g] === la).map((r) => toNum(r[m])).filter((x) => !Number.isNaN(x));
      const b = rows.filter((r) => r[g] === lb).map((r) => toNum(r[m])).filter((x) => !Number.isNaN(x));
      if (a.length < 3 || b.length < 3) {
        tooFew.push({ m, n: Math.min(a.length, b.length) });
        continue;
      }
      const { t, df, p } = welch(a, b);
      next.push({
        level: p < 0.05 ? 'ok' : 'warn',
        text: `${m}: ${la} ${r2(mean(a))} vs ${lb} ${r2(mean(b))}, Welch t = ${r2(t)}, df = ${r1(df)}, ${formatP(p)}. ${p < 0.05 ? 'A difference at p < 0.05.' : 'Not distinguishable at this n; more replicates would tell.'}`,
      });
    }
    if (tooFew.length) {
      next.push({
        level: 'warn',
        text: `${g} (${la} vs ${lb}): only ${Math.min(...tooFew.map((x) => x.n))} values per group, too few for a t-test on ${listJoin(tooFew.map((x) => x.m))}. Add a third replicate per group to compare them.`,
      });
    }
  }
  const labelCols = columns.filter((c) => !numeric.has(c));
  const valueCol = columns.find((c) => numeric.has(c));
  const bars: Bar[] = valueCol
    ? rows.slice(0, 24).map((r, i) => ({
        label: labelCols.map((c) => r[c]).filter(Boolean).join(' · ') || `Row ${i + 1}`,
        value: toNum(r[valueCol]) || 0,
        display: r[valueCol] ?? '',
        flag: false,
      }))
    : [];
  if (!next.length && !checks.some((c) => c.level !== 'ok')) {
    next.push({ level: 'ok', text: 'Nothing looks off. Note what it shows in the experiment, or add the next run as rows.' });
  }
  return {
    kind: 'Table',
    summary: `${plural(rows.length, 'row')} · ${plural(columns.length, 'column')} · ${plural(numeric.size, 'numeric column')}`,
    next,
    checks: checks.length ? checks : [{ level: 'ok', text: 'No empty cells and no values far from the rest.' }],
    bars,
    chartTitle: valueCol ?? '',
    max: Math.max(1, ...bars.map((b) => b.value)) * 1.1,
    rules,
  };
}

/** Works out what kind of data this is, checks it, and suggests the next step. */
export function checkData(columns: string[], rows: Rows, opts: { knockdown?: number } = {}): DataChecks {
  const threshold = Math.min(99, Math.max(1, Math.round(opts.knockdown ?? DEFAULT_KNOCKDOWN)));
  const ct = findCol(columns, /^(ct|cq|ct mean|cq mean)$/i);
  const target = findCol(columns, /target|gene|primer/i);
  const cond = findCol(columns, /condition|group|treatment|guide|sgrna|line/i);
  if (ct && target && cond) return qpcr(columns, rows, { ct, target, cond }, threshold);
  const reads = findCol(columns, /reads/i);
  if (reads && findCol(columns, /sample/i)) return seqQc(columns, rows, reads);
  return generic(columns, rows);
}
