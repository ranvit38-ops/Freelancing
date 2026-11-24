import { describe, expect, it } from 'vitest';
import { codeChallenge, googleAuthUrl, randomToken, statesMatch } from './oauth';

describe('randomToken', () => {
  it('is url-safe and different every time', () => {
    const a = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(randomToken());
  });
});

describe('codeChallenge', () => {
  it('matches the RFC 7636 S256 worked example', () => {
    // Appendix B of RFC 7636.
    expect(codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });
});

describe('statesMatch', () => {
  it('accepts a matching pair and rejects everything else', () => {
    expect(statesMatch('abc', 'abc')).toBe(true);
    expect(statesMatch('abc', 'abd')).toBe(false);
    expect(statesMatch('abc', 'abcd')).toBe(false);
    expect(statesMatch(undefined, 'abc')).toBe(false);
    expect(statesMatch('abc', undefined)).toBe(false);
    expect(statesMatch('', '')).toBe(false);
  });
});

describe('googleAuthUrl', () => {
  const url = new URL(
    googleAuthUrl({
      clientId: 'cid',
      redirectUri: 'https://app.test/api/auth/google/callback',
      state: 'st',
      verifier: 'ver',
    }),
  );

  it('points at Google with the expected scopes and response type', () => {
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('response_type')).toBe('code');
  });

  it('carries state and an S256 challenge, never the raw verifier', () => {
    expect(url.searchParams.get('state')).toBe('st');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(codeChallenge('ver'));
    expect(url.toString()).not.toContain('ver&');
    expect(url.searchParams.get('code_verifier')).toBeNull();
  });
});

describe('googleAuthUrl login hint', () => {
  const base = { clientId: 'c', redirectUri: 'https://x/cb', state: 's', verifier: 'v'.repeat(43) };
  it('skips the chooser for a remembered address, and ignores anything that is not one', () => {
    const hinted = new URL(googleAuthUrl({ ...base, loginHint: 'me@gmail.com' }));
    expect(hinted.searchParams.get('login_hint')).toBe('me@gmail.com');
    expect(hinted.searchParams.get('prompt')).toBeNull();
    const junk = new URL(googleAuthUrl({ ...base, loginHint: 'not an email' }));
    expect(junk.searchParams.get('login_hint')).toBeNull();
    expect(junk.searchParams.get('prompt')).toBe('select_account');
  });
});
