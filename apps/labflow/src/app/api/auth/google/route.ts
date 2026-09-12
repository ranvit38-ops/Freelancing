import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { googleAuthUrl, randomToken } from '@/lib/oauth';
import { absoluteUrl } from '@/server/mailer';
import { googleConfigured, googleRedirectUri } from '@/server/google';

export const runtime = 'nodejs';
// Never prerendered. Every path through this route reads per-request state or
// the deployment's own public URL, neither of which exists at build time, and
// a build that tried would fail on a deployment URL it cannot know yet.
export const dynamic = 'force-dynamic';

/** Starts Google sign-in: mints state + PKCE verifier, then redirects. */
export async function GET(request: Request) {
  if (!googleConfigured()) {
    return NextResponse.redirect(absoluteUrl('/login?error=google_unconfigured'));
  }

  const state = randomToken();
  const verifier = randomToken();
  const invite = new URL(request.url).searchParams.get('invite') ?? '';

  // httpOnly so no script can read them; short-lived because a sign-in that
  // takes more than ten minutes should start over.
  const options = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  };
  const jar = cookies();
  jar.set('g_state', state, options);
  jar.set('g_verifier', verifier, options);
  if (invite) jar.set('g_invite', invite, options);

  return NextResponse.redirect(
    googleAuthUrl({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      redirectUri: googleRedirectUri(),
      state,
      verifier,
    }),
  );
}
