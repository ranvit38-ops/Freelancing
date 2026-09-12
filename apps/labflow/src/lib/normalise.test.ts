import { describe, expect, it } from 'vitest';
import { normaliseEmail, normaliseSampleCode, slugify } from './normalise';

describe('normalise', () => {
  it('lowercases and trims email', () => {
    expect(normaliseEmail('  Ada@Lab.EDU ')).toBe('ada@lab.edu');
  });

  it('slugifies lab names', () => {
    expect(slugify('Smith Environmental Research Lab')).toBe('smith-environmental-research-lab');
    expect(slugify('  ***  ')).toBe('workspace');
    expect(slugify('Müller Group')).toBe('muller-group');
  });

  it('normalises sample codes', () => {
    expect(normaliseSampleCode(' s-104 ')).toBe('S-104');
    expect(normaliseSampleCode('batch 7')).toBe('BATCH-7');
  });
});
