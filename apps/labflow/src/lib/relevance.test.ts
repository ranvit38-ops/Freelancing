import { describe, expect, it } from 'vitest';
import { pickRelevant, questionTerms, relevance } from './relevance';

describe('questionTerms', () => {
  it('keeps the words that carry meaning and drops filler', () => {
    expect(questionTerms('What did Ana find in the HPLC run on biochar?')).toEqual(['ana', 'find', 'hplc', 'run', 'biochar']);
  });

  it('keeps codes and decimals intact', () => {
    expect(questionTerms('Compare EXP-004 at pH 6.5')).toEqual(['compare', 'exp-004', '6.5']);
  });
});

describe('pickRelevant', () => {
  const items = ['newest note about lunch', 'biochar HPLC results', 'older HPLC calibration', 'oldest'];

  it('puts matches first, best match first', () => {
    expect(pickRelevant(items, ['biochar', 'hplc'], (x) => x, 2)).toEqual(['biochar HPLC results', 'older HPLC calibration']);
  });

  it('falls back to the given order (newest first) when nothing matches', () => {
    expect(pickRelevant(items, ['zebrafish'], (x) => x, 2)).toEqual(['newest note about lunch', 'biochar HPLC results']);
  });

  it('scores zero for an empty question', () => {
    expect(relevance([], 'anything')).toBe(0);
  });
});
