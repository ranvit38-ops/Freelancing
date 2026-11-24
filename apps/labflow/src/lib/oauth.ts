import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * OAuth 2.0 authorization-code helpers.
 *
 * State defeats CSRF: a login the user did not start arrives without the
 * matching cookie and is rejected. PKCE defeats code interception: the code is
 * useless without the verifier, which never leaves this server.
 */

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** S256 challenge, the plain method is not offered. */
export function codeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/** Constant-time, so a state value cannot be recovered a character at a time. */
export function statesMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function googleAuthUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  verifier: string;
  /** The address this browser signed in with last time: Google can skip its account chooser. */
  loginHint?: string;
}): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', input.state);
  url.searchParams.set('code_challenge', codeChallenge(input.verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  // Returning from "Continue as you@…": go straight to that account. Otherwise
  // show the chooser rather than silently reusing whichever one is signed in.
  const hint = input.loginHint?.trim();
  if (hint && hint.length <= 254 && /^[^\s@]+@[^\s@]+$/.test(hint)) url.searchParams.set('login_hint', hint);
  else url.searchParams.set('prompt', 'select_account');
  return url.toString();
}
