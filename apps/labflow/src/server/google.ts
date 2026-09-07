import { absoluteUrl } from './mailer';

/**
 * Google sign-in.
 *
 * SETUP REQUIRED: create an OAuth client at
 * https://console.cloud.google.com/apis/credentials (type: Web application),
 * add this app's callback as an authorised redirect URI, then set
 * GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. Without both, the button is not
 * shown and the routes refuse — never a half-working login.
 */

export class GoogleNotConfiguredError extends Error {
  constructor() {
    super('Google sign-in is not configured on this deployment.');
    this.name = 'GoogleNotConfiguredError';
  }
}

export class GoogleAuthError extends Error {}

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleRedirectUri(): string {
  return absoluteUrl('/api/auth/google/callback');
}

export type GoogleProfile = { email: string; name: string; emailVerified: boolean };

/**
 * Exchanges the code for tokens and reads the profile.
 *
 * The id_token's payload is read for the email, but the token is NOT trusted on
 * its signature alone — it came straight from Google's token endpoint over TLS
 * in response to our own client secret, which is what makes it trustworthy
 * here. A token arriving any other way would need full signature verification.
 */
export async function exchangeGoogleCode(
  code: string,
  verifier: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleProfile> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new GoogleNotConfiguredError();

  let response: Response;
  try {
    response = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: googleRedirectUri(),
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }),
    });
  } catch {
    // fetch throws rather than returning on DNS failure, a reset connection or
    // a blocked egress. That is a failed sign-in, not a 500.
    throw new GoogleAuthError('Could not reach Google to complete the sign-in.');
  }

  if (!response.ok) {
    throw new GoogleAuthError(`Google rejected the sign-in (${response.status}).`);
  }

  let tokens: { id_token?: string };
  try {
    tokens = (await response.json()) as { id_token?: string };
  } catch {
    throw new GoogleAuthError('Google returned a response that could not be read.');
  }
  if (!tokens.id_token) throw new GoogleAuthError('Google returned no identity token.');

  return readIdToken(tokens.id_token);
}

/** Decodes the JWT payload. Exported so its edge cases can be tested. */
export function readIdToken(idToken: string): GoogleProfile {
  const payload = idToken.split('.')[1];
  if (!payload) throw new GoogleAuthError('Google returned a malformed identity token.');

  let claims: { email?: string; name?: string; email_verified?: boolean | string };
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new GoogleAuthError('Google returned an unreadable identity token.');
  }

  if (!claims.email) throw new GoogleAuthError('Google did not return an email address.');
  // Google sends this as a boolean or the string "true" depending on the flow.
  const verified = claims.email_verified === true || claims.email_verified === 'true';
  if (!verified) {
    throw new GoogleAuthError('That Google account has no verified email address.');
  }

  return {
    email: claims.email,
    name: claims.name?.trim() || claims.email.split('@')[0]!,
    emailVerified: true,
  };
}

/** True when this address is the deployment owner, who is comped. */
export function isOwnerEmail(email: string): boolean {
  const owner = process.env.LABFLOW_OWNER_EMAIL?.trim().toLowerCase();
  if (!owner) return false;
  return owner === email.trim().toLowerCase();
}
