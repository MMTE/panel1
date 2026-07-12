import { describe, it, expect } from 'vitest';
import {
  isOriginAllowed,
  parseCorsOriginList,
  makeCorsOriginVerifier,
  buildConnectSrc,
  buildScriptSrc,
} from './contentPolicy.js';

describe('parseCorsOriginList', () => {
  it('splits, trims, and de-duplicates comma-separated origins', () => {
    expect(parseCorsOriginList('https://a.com, https://b.com , https://a.com')).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });

  it('returns [] for undefined/blank input', () => {
    expect(parseCorsOriginList(undefined)).toEqual([]);
    expect(parseCorsOriginList('   ')).toEqual([]);
  });
});

describe('isOriginAllowed (production)', () => {
  const prod = { nodeEnv: 'production', corsOrigin: 'https://panel.example.com' };

  it('accepts the configured origin', () => {
    expect(isOriginAllowed('https://panel.example.com', prod)).toBe(true);
  });

  it('rejects an arbitrary evil origin', () => {
    expect(isOriginAllowed('http://evil.com', prod)).toBe(false);
  });

  it('rejects localhost even though it would pass in dev', () => {
    expect(isOriginAllowed('http://localhost:5173', prod)).toBe(false);
  });

  it('allows same-origin / non-browser requests (no Origin header)', () => {
    expect(isOriginAllowed(undefined, prod)).toBe(true);
  });

  it('rejects everything cross-origin when CORS_ORIGIN is unset', () => {
    expect(isOriginAllowed('https://panel.example.com', { nodeEnv: 'production' })).toBe(false);
  });
});

describe('isOriginAllowed (development)', () => {
  const dev = { nodeEnv: 'development', corsOrigin: 'https://panel.example.com' };

  it('accepts localhost ports not listed in CORS_ORIGIN', () => {
    expect(isOriginAllowed('http://localhost:5173', dev)).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:3000', dev)).toBe(true);
  });

  it('still accepts the configured origin', () => {
    expect(isOriginAllowed('https://panel.example.com', dev)).toBe(true);
  });

  it('rejects non-localhost arbitrary origins', () => {
    expect(isOriginAllowed('http://evil.com', dev)).toBe(false);
  });

  it('accepts localhost even with CORS_ORIGIN unset', () => {
    expect(isOriginAllowed('http://localhost:8080', { nodeEnv: 'development' })).toBe(true);
  });
});

describe('makeCorsOriginVerifier (callback contract)', () => {
  it('calls back with allow=true for the configured origin in prod', () => {
    const verify = makeCorsOriginVerifier({ nodeEnv: 'production', corsOrigin: 'https://panel.example.com' });
    const calls: Array<{ err: Error | null; allow?: boolean }> = [];
    verify('https://panel.example.com', (err, allow) => calls.push({ err, allow }));
    expect(calls).toEqual([{ err: null, allow: true }]);
  });

  it('calls back with an Error for a disallowed origin in prod', () => {
    const verify = makeCorsOriginVerifier({ nodeEnv: 'production', corsOrigin: 'https://panel.example.com' });
    let captured: { err: Error | null; allow?: boolean } | null = null;
    verify('http://evil.com', (err, allow) => { captured = { err, allow }; });
    expect(captured?.err).toBeInstanceOf(Error);
    expect(captured?.allow).toBeUndefined();
  });

  it('allows localhost in dev via the callback', () => {
    const verify = makeCorsOriginVerifier({ nodeEnv: 'development' });
    const calls: Array<{ err: Error | null; allow?: boolean }> = [];
    verify('http://localhost:5173', (err, allow) => calls.push({ err, allow }));
    expect(calls[0]).toEqual({ err: null, allow: true });
  });
});

describe('buildConnectSrc', () => {
  it('includes API_ORIGIN and localhost in development', () => {
    expect(buildConnectSrc({ nodeEnv: 'development', apiOrigin: 'http://localhost:5173' })).toEqual([
      "'self'",
      'http://localhost:5173',
      'http://localhost:*',
      'ws://localhost:*',
    ]);
  });

  it('includes only API_ORIGIN in production (no localhost)', () => {
    expect(buildConnectSrc({ nodeEnv: 'production', apiOrigin: 'https://panel.example.com' })).toEqual([
      "'self'",
      'https://panel.example.com',
    ]);
  });

  it('falls back to just self when API_ORIGIN is unset in production', () => {
    expect(buildConnectSrc({ nodeEnv: 'production' })).toEqual(["'self'"]);
  });
});

describe('buildScriptSrc (no unsafe-eval ever)', () => {
  it('never includes unsafe-eval in any environment', () => {
    const dev = buildScriptSrc({ nodeEnv: 'development' });
    const prod = buildScriptSrc({ nodeEnv: 'production' });
    expect(dev).not.toContain("'unsafe-eval'");
    expect(prod).not.toContain("'unsafe-eval'");
  });

  it('keeps unsafe-inline in dev, drops it in prod', () => {
    expect(buildScriptSrc({ nodeEnv: 'development' })).toEqual(["'self'", "'unsafe-inline'"]);
    expect(buildScriptSrc({ nodeEnv: 'production' })).toEqual(["'self'"]);
  });
});
