import { describe, expect, it } from 'vitest';
import { dmKey, dmParticipants } from './dm';

const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const c = '33333333-3333-4333-8333-333333333333';

describe('dmKey', () => {
  it('names a pair the same way whoever starts it', () => {
    expect(dmKey([a, b])).toBe(dmKey([b, a]));
  });

  it('ignores repeats', () => {
    expect(dmKey([a, b, a])).toBe(dmKey([a, b]));
  });
});

describe('dmParticipants', () => {
  it('reads a key back into people', () => {
    expect(dmParticipants(dmKey([c, a, b]))).toEqual([a, b, c]);
  });

  it('refuses anything that is not a canonical key', () => {
    expect(dmParticipants(a)).toBeNull();
    expect(dmParticipants(`${b}.${a}`)).toBeNull();
    expect(dmParticipants(`${a}.not-an-id`)).toBeNull();
    expect(dmParticipants('lab')).toBeNull();
  });
});
