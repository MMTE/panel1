import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * JWT fail-closed tests (R7).
 *
 * auth.ts validates JWT_SECRET eagerly at module load. To exercise both the
 * "missing/short secret throws" and "valid secret round-trips" paths we control
 * process.env.JWT_SECRET and re-import the module fresh (vi.resetModules +
 * dynamic import) so the eager check re-runs under each environment.
 *
 * The DB module and dotenv are mocked so the test exercises ONLY the JWT secret
 * logic — dotenv's config() is a no-op (it would otherwise re-load .env and
 * silently re-set JWT_SECRET after we delete it), and db is a stub so no real
 * connection is opened.
 */
vi.mock('dotenv', () => ({ config: () => ({ parsed: {} }) }));

// Mock the DB layer so importing auth.ts never touches postgres or DATABASE_URL.
vi.mock('../db/index.js', () => ({
  db: {
    delete: vi.fn(() => ({ where: vi.fn() })),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{}]) })) })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })) })),
        where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })),
      })),
    })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
  },
}));

const VALID_SECRET = 'a'.repeat(64); // 64 chars, well above the 32-char floor

describe('JWT fail-closed (auth.ts)', () => {
  const prevSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    // Ensure a clean slate; setup-env.ts may have loaded .env already.
    delete process.env.JWT_SECRET;
    vi.resetModules();
  });

  afterEach(() => {
    // Restore so other suites are unaffected.
    if (prevSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = prevSecret;
    }
    vi.resetModules();
  });

  it('throws at module load when JWT_SECRET is unset', async () => {
    delete process.env.JWT_SECRET;
    await expect(import('./auth.js')).rejects.toThrow(/JWT_SECRET/);
  });

  it('throws at module load when JWT_SECRET is shorter than 32 chars', async () => {
    process.env.JWT_SECRET = 'short-secret'; // 11 chars
    await expect(import('./auth.js')).rejects.toThrow(/at least 32 characters/);
  });

  it('round-trips generateToken/verifyToken with a valid >=32-char secret', async () => {
    process.env.JWT_SECRET = VALID_SECRET;
    const { generateToken, verifyToken } = await import('./auth.js');

    const payload = { userId: 'u-1', email: 'a@b.com', role: 'CLIENT' };
    const token = generateToken(payload);
    expect(typeof token).toBe('string');

    const decoded = verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.userId).toBe('u-1');
    expect(decoded?.email).toBe('a@b.com');
    expect(decoded?.role).toBe('CLIENT');
  });

  it('returns null for a tampered token even with a valid secret', async () => {
    process.env.JWT_SECRET = VALID_SECRET;
    const { generateToken, verifyToken } = await import('./auth.js');

    const token = generateToken({ userId: 'u-2', email: 'c@d.com', role: 'ADMIN' });
    const tampered = token.slice(0, -4) + 'AAAA';
    expect(verifyToken(tampered)).toBeNull();
  });
});
