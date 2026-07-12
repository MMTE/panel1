import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Ledger service tests run against an in-process Postgres (PGlite) — no
    // docker, no live DB — so the whole suite is CI-runnable.
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
});
