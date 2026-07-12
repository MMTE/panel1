/**
 * In-memory token-bucket rate limiter for auth endpoints (R13).
 *
 * Limitations (intentional, single-tenant-first):
 * - State lives in-process; it RESETS ON RESTART.
 * - Per-process — not shared across multiple API instances. If you scale out,
 *   move this to Redis.
 *
 * Default policy: 10 logins per 60s per IP. Overage denies with a Retry-After
 * hint (seconds until the oldest token in the window expires).
 */

export interface RateLimitConfig {
  /** Max successful consume() calls within `windowMs`. */
  max: number;
  /** Sliding window length in milliseconds. */
  windowMs: number;
}

export const DEFAULT_AUTH_RATE_LIMIT: Readonly<RateLimitConfig> = Object.freeze({
  max: 10,
  windowMs: 60_000,
});

export interface RateLimitResult {
  allowed: boolean;
  /** Remaining tokens in the current window (>= 0). */
  remaining: number;
  /** Seconds until the caller may retry; 0 when allowed. */
  retryAfterSec: number;
}

interface Bucket {
  /** Timestamps of successful consume() calls, oldest first. */
  hits: number[];
}

/**
 * Token-bucket / fixed-sliding-window limiter keyed by an arbitrary string
 * (typically the client IP). Inject `now` (ms) and optionally `config` so tests
 * can drive the clock and shrink the window.
 */
export class AuthRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly config: RateLimitConfig;
  private readonly now: () => number;

  constructor(
    config: RateLimitConfig = DEFAULT_AUTH_RATE_LIMIT,
    now: () => number = () => Date.now(),
  ) {
    this.config = config;
    this.now = now;
  }

  /**
   * Attempt to consume one token for `key`. Returns whether it was allowed and
   * metadata for retry hints. Idempotent per call (does not re-prune mid-call).
   */
  consume(key: string): RateLimitResult {
    const now = this.now();
    const windowStart = now - this.config.windowMs;
    const bucket = this.buckets.get(key);

    if (!bucket) {
      // First hit — allow and record.
      this.buckets.set(key, { hits: [now] });
      return { allowed: true, remaining: this.config.max - 1, retryAfterSec: 0 };
    }

    // Drop hits that aged out of the window (sliding window).
    while (bucket.hits.length > 0 && bucket.hits[0]! <= windowStart) {
      bucket.hits.shift();
    }

    if (bucket.hits.length < this.config.max) {
      bucket.hits.push(now);
      return {
        allowed: true,
        remaining: this.config.max - bucket.hits.length,
        retryAfterSec: 0,
      };
    }

    // Deny: retry after the oldest in-window hit ages out.
    const oldest = bucket.hits[0]!;
    const retryAfterMs = oldest + this.config.windowMs - now;
    const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  /** Clear all buckets (mainly for tests). */
  reset(): void {
    this.buckets.clear();
  }
}

/**
 * Extract a best-effort client IP from an Express request: first hop of
 * `x-forwarded-for` if present, else `req.ip`, else the raw socket address.
 */
export function getClientIp(req: {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string | null };
}): string {
  const xff = req.headers['x-forwarded-for'];
  const first = Array.isArray(xff) ? xff[0] : xff;
  if (first && first.trim().length > 0) {
    // First hop is the original client (left-most entry).
    return first.split(',')[0]!.trim();
  }
  if (req.ip) return req.ip;
  return req.socket?.remoteAddress ?? 'unknown';
}

/** Shared singleton used by the auth router. */
export const authRateLimiter = new AuthRateLimiter();
