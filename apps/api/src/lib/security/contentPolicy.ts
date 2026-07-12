/**
 * Pure, env-driven origin decisions for CORS and CSP connectSrc (R13).
 *
 * Factored out of index.ts so they can be unit-tested without booting Express.
 *
 * Env vars:
 * - CORS_ORIGIN: comma-separated allowlist of origins accepted by CORS in ALL
 *   environments. In production this is the ONLY source of truth.
 * - API_ORIGIN: a single origin used to build CSP `connectSrc` (the web client's
 *   public URL, e.g. https://panel.example.com).
 * - NODE_ENV: when 'development', localhost origins are also accepted as a
 *   convenience and unsafe-inline is retained.
 */

export interface OriginPolicyInput {
  nodeEnv?: string;
  corsOrigin?: string;
  apiOrigin?: string;
}

const LOCALHOST_REGEX = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

/**
 * Parse a comma-separated CORS_ORIGIN env value into a trimmed, de-duplicated
 * list of origins. Empty/blank entries are dropped.
 */
export function parseCorsOriginList(corsOrigin: string | undefined): string[] {
  if (!corsOrigin) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of corsOrigin.split(',')) {
    const v = raw.trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/**
 * Decide whether a request `Origin` header is allowed by CORS.
 *
 * - In production: allowed only if it appears in CORS_ORIGIN (case-sensitive
 *   exact match). A missing/blank CORS_ORIGIN means CORS denies all cross-origin
 *   requests (same-origin requests have no Origin header and are still allowed
 *   by browsers).
 * - In development: localhost/127.0.0.1 origins are additionally allowed for
 *   convenience, even if CORS_ORIGIN is unset.
 *
 * `origin === undefined` returns true: same-origin requests and non-browser
 * clients (curl, server-to-server) omit the Origin header, and CORS only
 * restricts credentialed cross-origin browser requests.
 */
export function isOriginAllowed(origin: string | undefined, input: OriginPolicyInput): boolean {
  if (origin === undefined) return true;

  const configured = parseCorsOriginList(input.corsOrigin);
  if (configured.includes(origin)) return true;

  if (isDevelopment(input)) {
    return LOCALHOST_REGEX.test(origin);
  }
  return false;
}

/**
 * CORS origin callback compatible with the `cors` middleware signature:
 * `(err: Error | null, allow?: boolean) => void`.
 */
export function makeCorsOriginVerifier(input: OriginPolicyInput) {
  return (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (isOriginAllowed(origin, input)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  };
}

/**
 * Build the CSP `connectSrc` list. In production it is `['self', <API_ORIGIN>]`
 * when API_ORIGIN is set (or just `['self']`). In development, localhost HTTP
 * and WS origins are appended so dev tooling can reach the API.
 */
export function buildConnectSrc(input: OriginPolicyInput): string[] {
  const src = ["'self'"];
  const apiOrigin = input.apiOrigin?.trim();
  if (apiOrigin) {
    src.push(apiOrigin);
  }
  if (isDevelopment(input)) {
    src.push('http://localhost:*', 'ws://localhost:*');
  }
  return src;
}

/**
 * Build the CSP `scriptSrc` list. `unsafe-eval` is NEVER included. `unsafe-inline`
 * is retained only in development as a conservative default (the API is a JSON
 * backend, so CSP script-src is largely inert, but we keep dev parity with the
 * web client). In production only 'self' is emitted.
 */
export function buildScriptSrc(input: OriginPolicyInput): string[] {
  if (isDevelopment(input)) {
    return ["'self'", "'unsafe-inline'"];
  }
  return ["'self'"];
}

function isDevelopment(input: OriginPolicyInput): boolean {
  return (input.nodeEnv ?? process.env.NODE_ENV ?? '') === 'development';
}
