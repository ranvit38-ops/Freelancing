import { describe, expect, it } from 'vitest';
import { fieldErrorsFrom, formObject } from './types';
import { projectSchema, experimentSchema } from '@/lib/validation';

/** Reproduces exactly what a browser sends to a Next.js server action. */
function browserFormData(entries: [string, string][]): FormData {
  const fd = new FormData();
  // Next.js injects these into every server-action submission.
  fd.append('$ACTION_ID_a1b2c3', '');
  for (const [k, v] of entries) fd.append(k, v);
  fd.append('$ACTION_KEY', 'k1');
  return fd;
}

describe('formObject', () => {
  it("drops Next's internal $ACTION fields so strict schemas still validate", () => {
    const parsed = projectSchema.safeParse(
      formObject(browserFormData([['name', 'PFAS Removal'], ['tags', 'pfas']])),
    );
    expect(parsed.success).toBe(true);
  });

  it('keeps a single repeatable row as an array', () => {
    const out = formObject(browserFormData([['conditionName', 'pH']]), ['conditionName']);
    expect(out.conditionName).toEqual(['pH']);
  });

  it('collects repeated fields into one array', () => {
    const out = formObject(
      browserFormData([['conditionName', 'pH'], ['conditionName', 'Temp']]),
      ['conditionName'],
    );
    expect(out.conditionName).toEqual(['pH', 'Temp']);
  });

  it('ignores the routing fields an action reads for itself', () => {
    const parsed = experimentSchema.safeParse(
      formObject(browserFormData([['projectId', 'p-1'], ['experimentId', 'e-1'], ['title', 'Run']])),
    );
    expect(parsed.success).toBe(true);
  });

  it('parses a full experiment submission end to end', () => {
    const parsed = experimentSchema.safeParse(
      formObject(
        browserFormData([
          ['title', 'Column run'],
          ['status', 'completed'],
          ['conditionName', 'Temperature'],
          ['conditionValue', '25'],
          ['conditionUnit', '°C'],
          ['sampleCodes', 'S-201, S-202'],
        ]),
        ['conditionName', 'conditionValue', 'conditionUnit'],
      ),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.title).toBe('Column run');
      expect(parsed.data.conditionName).toEqual(['Temperature']);
    }
  });
});

describe('fieldErrorsFrom', () => {
  it('keeps the first error per field', () => {
    expect(
      fieldErrorsFrom([
        { path: ['email'], message: 'first' },
        { path: ['email'], message: 'second' },
        { path: [], message: 'root' },
      ]),
    ).toEqual({ email: 'first', _: 'root' });
  });
});
