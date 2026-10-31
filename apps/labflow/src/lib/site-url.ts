// Next replaces `process.env.NEXT_PUBLIC_…` with the build machine's value,
// even through a constant key. The host sets the address only at run time, so
// that would bake in nothing (on Render) and ignore the address set on the
// service. Reading through a parameter keeps it a run-time lookup; the
// standalone test in CI checks the built server honours it.
function runtime(source: NodeJS.ProcessEnv, key: string): string | undefined {
  return source[key];
}

/**
 * The deployment's public address, from configuration only, never from a
 * request. NEXT_PUBLIC_APP_URL when set; otherwise the address the host
 * itself publishes (Render sets RENDER_EXTERNAL_URL on every service), so a
 * deployment works without anyone having to type its own URL in.
 */
export function publicBaseUrl(): string | null {
  const base = runtime(process.env, 'NEXT_PUBLIC_APP_URL')?.trim() || process.env.RENDER_EXTERNAL_URL;
  return base ? base.replace(/\/$/, '') : null;
}

/** The public address, or the local one in development. */
export function siteUrl(): string {
  return publicBaseUrl() ?? 'http://localhost:3001';
}
