import { afterEach, describe, expect, it } from 'vitest';
import { GoogleAuthError, isOwnerEmail, readIdToken } from './google';

function idToken(claims: Record<string, unknown>): string {
  const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${part({ alg: 'RS256' })}.${part(claims)}.signature`;
}

describe('readIdToken', () => {
  it('reads a verified account', () => {
    const p = readIdToken(idToken({ email: 'ada@lab.edu', name: 'Ada Lovelace', email_verified: true }));
    expect(p).toEqual({ email: 'ada@lab.edu', name: 'Ada Lovelace', emailVerified: true });
  });

  it('accepts email_verified as the string Google sometimes sends', () => {
    expect(readIdToken(idToken({ email: 'a@b.c', email_verified: 'true' })).emailVerified).toBe(true);
  });

  it('refuses an unverified address rather than trusting it', () => {
    expect(() => readIdToken(idToken({ email: 'a@b.c', email_verified: false }))).toThrow(GoogleAuthError);
    expect(() => readIdToken(idToken({ email: 'a@b.c' }))).toThrow(GoogleAuthError);
  });

  it('falls back to the local part when Google sends no name', () => {
    expect(readIdToken(idToken({ email: 'rin.tanaka@lab.edu', email_verified: true })).name).toBe('rin.tanaka');
  });

  it('rejects malformed tokens instead of half-reading them', () => {
    expect(() => readIdToken('not-a-jwt')).toThrow(GoogleAuthError);
    expect(() => readIdToken('a.!!!.c')).toThrow(GoogleAuthError);
    expect(() => readIdToken(idToken({ name: 'No Email' }))).toThrow(GoogleAuthError);
  });
});

describe('isOwnerEmail', () => {
  const original = process.env.LABFLOW_OWNER_EMAIL;
  afterEach(() => {
    process.env.LABFLOW_OWNER_EMAIL = original;
  });

  it('is nobody when unset — no privileged address is baked in', () => {
    delete process.env.LABFLOW_OWNER_EMAIL;
    expect(isOwnerEmail('anyone@example.com')).toBe(false);
  });

  it('matches the configured address regardless of case or spacing', () => {
    process.env.LABFLOW_OWNER_EMAIL = 'Owner@Example.com';
    expect(isOwnerEmail('owner@example.com')).toBe(true);
    expect(isOwnerEmail('  OWNER@EXAMPLE.COM ')).toBe(true);
  });

  it('does not match a lookalike address', () => {
    process.env.LABFLOW_OWNER_EMAIL = 'owner@example.com';
    expect(isOwnerEmail('owner@example.com.evil.com')).toBe(false);
    expect(isOwnerEmail('notowner@example.com')).toBe(false);
  });
});

describe('exchangeGoogleCode failure paths', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env.GOOGLE_CLIENT_ID = original.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = original.GOOGLE_CLIENT_SECRET;
  });

  function configure() {
    process.env.GOOGLE_CLIENT_ID = 'cid';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
  }

  it('refuses when not configured, before any network call', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const { exchangeGoogleCode, GoogleNotConfiguredError } = await import('./google');
    let called = false;
    const spy = (async () => {
      called = true;
      return new Response('{}');
    }) as unknown as typeof fetch;
    await expect(exchangeGoogleCode('c', 'v', spy)).rejects.toBeInstanceOf(GoogleNotConfiguredError);
    expect(called).toBe(false);
  });

  it('turns a thrown network error into a sign-in failure, not a crash', async () => {
    configure();
    const { exchangeGoogleCode, GoogleAuthError } = await import('./google');
    const boom = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(exchangeGoogleCode('c', 'v', boom)).rejects.toBeInstanceOf(GoogleAuthError);
  });

  it('reports a non-2xx from Google as a sign-in failure', async () => {
    configure();
    const { exchangeGoogleCode, GoogleAuthError } = await import('./google');
    const bad = (async () => new Response('', { status: 400 })) as unknown as typeof fetch;
    await expect(exchangeGoogleCode('c', 'v', bad)).rejects.toBeInstanceOf(GoogleAuthError);
  });

  it('handles a 200 that is not JSON', async () => {
    configure();
    const { exchangeGoogleCode, GoogleAuthError } = await import('./google');
    const junk = (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch;
    await expect(exchangeGoogleCode('c', 'v', junk)).rejects.toBeInstanceOf(GoogleAuthError);
  });

  it('sends the PKCE verifier and returns the profile on success', async () => {
    configure();
    const { exchangeGoogleCode } = await import('./google');
    let sentBody = '';
    const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const good = (async (_u: string, init: RequestInit) => {
      sentBody = String(init.body);
      return new Response(
        JSON.stringify({
          id_token: `${part({ alg: 'RS256' })}.${part({ email: 'owner@example.com', name: 'Ada', email_verified: true })}.sig`,
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const profile = await exchangeGoogleCode('the-code', 'the-verifier', good);
    expect(profile.email).toBe('owner@example.com');
    expect(sentBody).toContain('code_verifier=the-verifier');
    expect(sentBody).toContain('grant_type=authorization_code');
  });
});
