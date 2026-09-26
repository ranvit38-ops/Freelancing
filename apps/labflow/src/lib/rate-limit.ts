/**
 * Minimal in-memory rate limiter, guarding the credential endpoints.
 *
 * HONEST LIMITATION: per-process and reset on redeploy. On a multi-instance or
 * serverless deployment each instance keeps its own counters, so this stops
 * casual credential stuffing, not a distributed attack.
 *
 * SETUP REQUIRED (for production): swap the store for Upstash Redis or similar.
 * Call sites only use `rateLimit()`, so only this file changes.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Stops the map growing without bound on a long-lived server. */
const MAX_BUCKETS = 10_000;

export function rateLimit(
  key: string,
  { limit = 5, windowMs = 60_000 }: { limit?: number; windowMs?: number } = {},
): { ok: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();

  if (buckets.size > MAX_BUCKETS) {
    for (const [k, b] of buckets) if (now > b.resetAt) buckets.delete(k);
  }

  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
  }
  if (bucket.count >= limit) {
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { ok: true, remaining: limit - bucket.count, retryAfterSec: 0 };
}

/** Best-effort client IP from the usual proxy headers. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return headers.get('x-real-ip') ?? 'unknown';
}

/** For tests only. */
export function resetRateLimits() {
  buckets.clear();
}

/**
 * A filename safe to interpolate into a Content-Disposition header.
 *
 * Quotes end the value early and CR/LF would split the header entirely, so
 * both are removed rather than escaped.
 */
export function headerSafeFilename(name: string): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"\\]/g, '')
    .trim();
  return cleaned.slice(0, 200) || 'download';
}
