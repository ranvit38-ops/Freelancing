import { describe, expect, it } from 'vitest';
import { normaliseEmail, normaliseSampleCode, sameSitePath, slugify } from './normalise';

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

describe('sameSitePath', () => {
  it('keeps a path on this site, query and all', () => {
    expect(sameSitePath('/experiments/abc?tab=files')).toBe('/experiments/abc?tab=files');
  });

  it('refuses anything a browser would take to another site', () => {
    for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'evil.com', '', ' /x', '/x y', 'javascript:alert(1)']) {
      expect(sameSitePath(bad)).toBeNull();
    }
  });
});

