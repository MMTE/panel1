import type { Config } from 'drizzle-kit';

/**
 * Schema source for drizzle-kit push:pg / generate.
 *
 * Two entries:
 *  1. The app-side DDL copies under ./src/db/schema/* (pre-existing source of truth
 *     for the legacy tables — kept until the push:pg → migrate cutover).
 *  2. The canonical ledger definitions in the billing module, pushed DIRECTLY so
 *     the new money-core tables are not duplicated into ./src/db/schema/*. New
 *     money tables should follow this pattern (define once in the module).
 */
export default {
  schema: [
    './src/db/schema/*',
    '../../modules/billing/src/ledger/schema.ts',
  ],
  out: './src/db/migrations',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/panel1_dev',
  },
  strict: false,
  verbose: false,
} satisfies Config;