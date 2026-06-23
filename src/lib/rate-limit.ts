/**
 * Minimal in-memory rate limiter for the contact form.
 *
 * HONEST LIMITATION: this is per-server-instance and resets on redeploy. On
 * Vercel's serverless/edge runtime each instance has its own memory, so this
 * stops casual abuse but is NOT a strong global limit.
 *
 * SETUP REQUIRED (optional, for production-grade limiting): swap this for a
 * shared store such as Upstash Redis (@upstash/ratelimit). The call sites use
 * the `rateLimit()` signature below, so only this file changes.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  { limit = 5, windowMs = 60_000 }: { limit?: number; windowMs?: number } = {}
): { ok: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
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

/** Best-effort client IP from common proxy headers (Vercel sets x-forwarded-for). */
export function getClientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "unknown";
}
