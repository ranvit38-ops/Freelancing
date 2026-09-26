import { describe, expect, it } from 'vitest';
import { isDisposableEmail, normaliseEmail } from './trial-eligibility';

describe('normaliseEmail', () => {
  it('treats gmail dots and plus-addresses as one person', () => {
    expect(normaliseEmail('a.b+trial2@gmail.com')).toBe('ab@gmail.com');
    expect(normaliseEmail('AB@Gmail.com')).toBe('ab@gmail.com');
    expect(normaliseEmail('a.b@googlemail.com')).toBe('ab@googlemail.com');
  });

  it('strips plus-addressing everywhere, since almost every provider has it', () => {
    expect(normaliseEmail('priya+labvia@stanford.edu')).toBe('priya@stanford.edu');
  });

  it('keeps dots outside Google, where they are part of the address', () => {
    // p.raman@stanford.edu and praman@stanford.edu are two different people.
    expect(normaliseEmail('p.raman@stanford.edu')).toBe('p.raman@stanford.edu');
  });

  it('leaves anything that is not an address alone rather than mangling it', () => {
    expect(normaliseEmail('not-an-email')).toBe('not-an-email');
    expect(normaliseEmail('@nolocal.com')).toBe('@nolocal.com');
  });

  it('takes the domain from the last @, so an embedded one cannot fake it', () => {
    // The domain here is gmail.com, so Google's dot rule applies to the whole
    // local part. What matters is that "evil.com" is never read as the domain.
    expect(normaliseEmail('user@evil.com@gmail.com')).toBe('user@evilcom@gmail.com');
    expect(normaliseEmail('user@evil.com@stanford.edu')).toBe('user@evil.com@stanford.edu');
  });
});

describe('isDisposableEmail', () => {
  it('spots the throwaway providers people actually use', () => {
    expect(isDisposableEmail('someone@mailinator.com')).toBe(true);
    expect(isDisposableEmail('SOMEONE@Yopmail.com')).toBe(true);
  });

  it('leaves real addresses alone, universities and consumer mail alike', () => {
    expect(isDisposableEmail('priya@stanford.edu')).toBe(false);
    expect(isDisposableEmail('someone@gmail.com')).toBe(false);
    expect(isDisposableEmail('lab@charite.de')).toBe(false);
  });
});
