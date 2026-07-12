import { describe, it, expect } from 'vitest';
import { AuthRateLimiter, getClientIp, DEFAULT_AUTH_RATE_LIMIT } from './rateLimiter.js';

describe('AuthRateLimiter (token bucket)', () => {
  it('allows up to `max` calls within the window then denies the next', () => {
    let clock = 1_000;
    const limiter = new AuthRateLimiter(
      { max: 3, windowMs: 1_000 },
      () => clock,
    );

    const r1 = limiter.consume('1.2.3.4');
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    expect(limiter.consume('1.2.3.4').allowed).toBe(true); // 2
    expect(limiter.consume('1.2.3.4').allowed).toBe(true); // 3 — at the limit

    const r4 = limiter.consume('1.2.3.4'); // 4th — over
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
    expect(r4.retryAfterSec).toBeGreaterThan(0);
  });

  it('keys buckets independently per IP', () => {
    let clock = 5_000;
    const limiter = new AuthRateLimiter(
      { max: 1, windowMs: 1_000 },
      () => clock,
    );

    expect(limiter.consume('10.0.0.1').allowed).toBe(true);
    expect(limiter.consume('10.0.0.1').allowed).toBe(false); // 10.0.0.1 exhausted
    expect(limiter.consume('10.0.0.2').allowed).toBe(true); // different IP still allowed
  });

  it('resets after the window elapses (mocked clock)', () => {
    let clock = 100;
    const windowMs = 2_000;
    const limiter = new AuthRateLimiter({ max: 2, windowMs }, () => clock);

    // Exhaust the bucket.
    expect(limiter.consume('k').allowed).toBe(true);
    expect(limiter.consume('k').allowed).toBe(true);
    expect(limiter.consume('k').allowed).toBe(false); // denied

    // Move past the window — the oldest hit ages out and the bucket reopens.
    clock += windowMs + 1;
    const after = limiter.consume('k');
    expect(after.allowed).toBe(true);
    expect(after.remaining).toBe(1);
  });

  it('uses the default 10/min policy from DEFAULT_AUTH_RATE_LIMIT', () => {
    expect(DEFAULT_AUTH_RATE_LIMIT.max).toBe(10);
    expect(DEFAULT_AUTH_RATE_LIMIT.windowMs).toBe(60_000);

    let clock = 0;
    const limiter = new AuthRateLimiter(DEFAULT_AUTH_RATE_LIMIT, () => clock);
    for (let i = 0; i < 10; i++) {
      expect(limiter.consume('ip').allowed).toBe(true);
    }
    // 11th in the same window is denied.
    const denied = limiter.consume('ip');
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSec).toBeGreaterThan(0);
  });
});

describe('getClientIp', () => {
  it('uses the first hop of x-forwarded-for when present', () => {
    const ip = getClientIp({
      headers: { 'x-forwarded-for': '203.0.113.7, 70.41.3.18' },
      ip: '10.0.0.1',
      socket: { remoteAddress: '10.0.0.1' },
    });
    expect(ip).toBe('203.0.113.7');
  });

  it('falls back to req.ip when no forwarded header', () => {
    const ip = getClientIp({
      headers: {},
      ip: '10.0.0.1',
      socket: { remoteAddress: '10.0.0.1' },
    });
    expect(ip).toBe('10.0.0.1');
  });

  it('falls back to socket remote address when req.ip is missing', () => {
    const ip = getClientIp({
      headers: {},
      socket: { remoteAddress: '192.0.2.9' },
    });
    expect(ip).toBe('192.0.2.9');
  });
});
