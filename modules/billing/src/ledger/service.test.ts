/**
 * Ledger posting invariant tests (Phase C / Task C3).
 *
 * These tests ARE the reconciliation guarantee: every journal entry posts
 * through `post()`, which must keep debits == credits and be idempotent under
 * event redelivery. Run via PGlite (in-process Postgres) — no docker, no live
 * DB — so the suite is fully CI-runnable.
 *
 * TDD: written first, watched fail, then implemented against service.ts.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import {
  post,
  accountBalance,
  UnbalancedTransactionError,
  UnknownAccountError,
  InvalidAmountError,
  type LedgerDb,
} from './service.js';

// --- Schema (mirrors modules/billing/src/ledger/schema.ts + 0005_ledger.sql) --

const SCHEMA_SQL = `
DO $$ BEGIN CREATE TYPE ledger_account_type AS ENUM ('asset','liability','revenue','equity'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ledger_source_type AS ENUM ('invoice','payment','refund','adjustment'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ledger_transaction_status AS ENUM ('pending','posted','voided'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ledger_entry_direction AS ENUM ('debit','credit'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  code text NOT NULL,
  type ledger_account_type NOT NULL,
  currency char(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ledger_accounts_tenant_code_currency_uniq
  ON ledger_accounts (tenant_id, code, currency);

CREATE TABLE IF NOT EXISTS ledger_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  description text NOT NULL,
  source_type ledger_source_type NOT NULL,
  source_id uuid NOT NULL,
  period_start date,
  posted_at timestamptz DEFAULT now() NOT NULL,
  status ledger_transaction_status DEFAULT 'posted' NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ledger_transactions_idempotency_uniq
  ON ledger_transactions (tenant_id, source_type, source_id, period_start);
CREATE INDEX IF NOT EXISTS ledger_transactions_tenant_idx ON ledger_transactions (tenant_id);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  transaction_id uuid NOT NULL,
  account_id uuid NOT NULL,
  direction ledger_entry_direction NOT NULL,
  amount_minor bigint NOT NULL,
  currency char(3) NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
,
  CONSTRAINT ledger_entries_amount_minor_nonneg_check CHECK (amount_minor >= 0)
);
CREATE INDEX IF NOT EXISTS ledger_entries_tenant_account_idx ON ledger_entries (tenant_id, account_id);
CREATE INDEX IF NOT EXISTS ledger_entries_transaction_idx ON ledger_entries (transaction_id);
`;

/**
 * The standard test accounts for one tenant+currency. Mirrors what C4 will seed
 * in production for every tenant+currency.
 */
const TEST_ACCOUNTS: Array<{ code: string; type: 'asset' | 'liability' | 'revenue' | 'equity' }> = [
  { code: 'accounts_receivable', type: 'asset' },
  { code: 'sales_revenue', type: 'revenue' },
  { code: 'stripe_clearing', type: 'liability' },
];

interface TestWorld {
  db: LedgerDb;
  /** Raw pglite handle, for assertions that bypass the port. */
  raw: PGlite;
  tenantId: string;
  currency: string;
}

/**
 * Boot a FRESH pglite Postgres, create the ledger schema, seed the standard
 * accounts for one tenant+currency, and return both the port (for `post`) and
 * the raw pglite (for row-count assertions). Each test gets its own DB — no
 * cross-test leakage.
 */
async function withLedgerDb(testFn: (world: TestWorld) => Promise<void>): Promise<void> {
  const pglite = await PGlite.create();
  try {
    await pglite.exec(SCHEMA_SQL);
    const tenantId = crypto.randomUUID();
    const currency = 'USD';
    for (const a of TEST_ACCOUNTS) {
      await pglite.query(
        `INSERT INTO ledger_accounts (tenant_id, code, type, currency) VALUES ($1, $2, $3, $4)`,
        [tenantId, a.code, a.type, currency],
      );
    }
    const db: LedgerDb = makePgliteDb(pglite);
    await testFn({ db, raw: pglite, tenantId, currency });
  } finally {
    await pglite.close();
  }
}

/** Build a {@link LedgerDb} port over a raw PGlite instance. */
function makePgliteDb(pglite: PGlite): LedgerDb {
  const query = async (text: string, params: unknown[] = []) => {
    const res = await pglite.query(text, params as never);
    return { rows: (res.rows ?? []) as never };
  };
  const make = (): LedgerDb => ({
    query,
    async transaction<T>(fn: (tx: LedgerDb) => Promise<T>): Promise<T> {
      await pglite.exec('BEGIN');
      try {
        // `post()` runs in a single transaction; nested `transaction()` calls
        // share the same connection (no SAVEPOINT needed for the current call
        // sites — the outer BEGIN/COMMIT/ROLLBACK is the atomicity boundary).
        const result = await fn(make());
        await pglite.exec('COMMIT');
        return result;
      } catch (err) {
        await pglite.exec('ROLLBACK');
        throw err;
      }
    },
  });
  return make();
}

/** Count rows in a table for a tenant (raw, bypasses the port). */
async function count(raw: PGlite, table: 'ledger_transactions' | 'ledger_entries', tenantId: string): Promise<number> {
  const r = await raw.query(`SELECT count(*)::int AS n FROM ${table} WHERE tenant_id = $1`, [tenantId]);
  return Number((r.rows[0] as { n: number }).n);
}

// Keep drizzle's sql import "used" so the linter stays quiet (it documents that
// the harness deliberately speaks raw SQL through the port rather than going
// through the query builder).
void sql;

// --- Tests ------------------------------------------------------------------

describe('ledger post() — the posting invariant', () => {
  it('rejects an unbalanced transaction and rolls back (no tx, no entries persisted)', async () => {
    await withLedgerDb(async ({ db, tenantId, currency, raw }) => {
      const input = {
        tenantId,
        sourceType: 'invoice' as const,
        sourceId: crypto.randomUUID(),
        periodStart: '2026-01-01',
        description: 'unbalanced',
        currency,
        entries: [
          { accountCode: 'accounts_receivable', direction: 'debit' as const, amountMinor: 999n },
          { accountCode: 'sales_revenue', direction: 'credit' as const, amountMinor: 998n }, // off by 1
        ],
      };

      await expect(post(db, input)).rejects.toBeInstanceOf(UnbalancedTransactionError);

      expect(await count(raw, 'ledger_transactions', tenantId)).toBe(0);
      expect(await count(raw, 'ledger_entries', tenantId)).toBe(0);
    });
  });

  it('accepts a balanced transaction and persists 1 tx + 2 entries (replayed=false)', async () => {
    await withLedgerDb(async ({ db, tenantId, currency, raw }) => {
      const sourceId = crypto.randomUUID();
      const res = await post(db, {
        tenantId,
        sourceType: 'invoice',
        sourceId,
        periodStart: '2026-01-01',
        description: 'balanced',
        currency,
        entries: [
          { accountCode: 'accounts_receivable', direction: 'debit', amountMinor: 999n },
          { accountCode: 'sales_revenue', direction: 'credit', amountMinor: 999n },
        ],
      });

      expect(res.replayed).toBe(false);
      expect(res.transactionId).toMatch(/^[0-9a-f-]{36}$/);
      expect(await count(raw, 'ledger_transactions', tenantId)).toBe(1);
      expect(await count(raw, 'ledger_entries', tenantId)).toBe(2);
    });
  });

  it('is idempotent under re-post of the same (tenant, sourceType, sourceId, periodStart)', async () => {
    await withLedgerDb(async ({ db, tenantId, currency, raw }) => {
      const sourceId = crypto.randomUUID();
      const base = {
        tenantId,
        sourceType: 'invoice' as const,
        sourceId,
        periodStart: '2026-02-01',
        description: 'idempotent',
        currency,
        entries: [
          { accountCode: 'accounts_receivable', direction: 'debit' as const, amountMinor: 1500n },
          { accountCode: 'sales_revenue', direction: 'credit' as const, amountMinor: 1500n },
        ],
      };

      const first = await post(db, base);
      const second = await post(db, base);

      expect(first.replayed).toBe(false);
      expect(second.replayed).toBe(true);
      expect(second.transactionId).toBe(first.transactionId);

      // The double-fire guarantee: still exactly ONE transaction and TWO entries.
      expect(await count(raw, 'ledger_transactions', tenantId)).toBe(1);
      expect(await count(raw, 'ledger_entries', tenantId)).toBe(2);
    });
  });

  it('rejects a negative amountMinor (InvalidAmountError, defensive — DB CHECK not enforced under push:pg)', async () => {
    await withLedgerDb(async ({ db, tenantId, currency, raw }) => {
      await expect(
        post(db, {
          tenantId,
          sourceType: 'adjustment',
          sourceId: crypto.randomUUID(),
          periodStart: '2026-03-01',
          description: 'negative',
          currency,
          entries: [
            { accountCode: 'accounts_receivable', direction: 'debit', amountMinor: -1n },
            { accountCode: 'sales_revenue', direction: 'credit', amountMinor: -1n },
          ],
        }),
      ).rejects.toBeInstanceOf(InvalidAmountError);
      expect(await count(raw, 'ledger_transactions', tenantId)).toBe(0);
      expect(await count(raw, 'ledger_entries', tenantId)).toBe(0);
    });
  });

  it('rejects an unknown account code (UnknownAccountError, includes the code)', async () => {
    await withLedgerDb(async ({ db, tenantId, currency, raw }) => {
      await expect(
        post(db, {
          tenantId,
          sourceType: 'invoice',
          sourceId: crypto.randomUUID(),
          periodStart: '2026-04-01',
          description: 'unknown account',
          currency,
          entries: [
            { accountCode: 'does_not_exist', direction: 'debit', amountMinor: 100n },
            { accountCode: 'sales_revenue', direction: 'credit', amountMinor: 100n },
          ],
        }),
      ).rejects.toMatchObject({ name: 'UnknownAccountError', code: 'does_not_exist' });
      expect(await count(raw, 'ledger_transactions', tenantId)).toBe(0);
    });
  });

  it('rejects a single entry (cannot balance) and rejects all-debit / all-credit', async () => {
    await withLedgerDb(async ({ db, tenantId, currency, raw }) => {
      // single entry
      await expect(
        post(db, {
          tenantId,
          sourceType: 'adjustment',
          sourceId: crypto.randomUUID(),
          periodStart: '2026-05-01',
          description: 'single',
          currency,
          entries: [{ accountCode: 'accounts_receivable', direction: 'debit', amountMinor: 5n }],
        }),
      ).rejects.toBeInstanceOf(UnbalancedTransactionError);

      // all debits
      await expect(
        post(db, {
          tenantId,
          sourceType: 'adjustment',
          sourceId: crypto.randomUUID(),
          periodStart: '2026-05-02',
          description: 'all debit',
          currency,
          entries: [
            { accountCode: 'accounts_receivable', direction: 'debit', amountMinor: 5n },
            { accountCode: 'stripe_clearing', direction: 'debit', amountMinor: 5n },
          ],
        }),
      ).rejects.toBeInstanceOf(UnbalancedTransactionError);

      // all credits
      await expect(
        post(db, {
          tenantId,
          sourceType: 'adjustment',
          sourceId: crypto.randomUUID(),
          periodStart: '2026-05-03',
          description: 'all credit',
          currency,
          entries: [
            { accountCode: 'accounts_receivable', direction: 'credit', amountMinor: 5n },
            { accountCode: 'sales_revenue', direction: 'credit', amountMinor: 5n },
          ],
        }),
      ).rejects.toBeInstanceOf(UnbalancedTransactionError);

      expect(await count(raw, 'ledger_transactions', tenantId)).toBe(0);
      expect(await count(raw, 'ledger_entries', tenantId)).toBe(0);
    });
  });

  it('posts a balanced, zero-amount transaction (debits==credits==0 is still balanced)', async () => {
    await withLedgerDb(async ({ db, tenantId, currency, raw }) => {
      const res = await post(db, {
        tenantId,
        sourceType: 'adjustment',
        sourceId: crypto.randomUUID(),
        periodStart: '2026-06-01',
        description: 'zero balanced',
        currency,
        entries: [
          { accountCode: 'accounts_receivable', direction: 'debit', amountMinor: 0n },
          { accountCode: 'sales_revenue', direction: 'credit', amountMinor: 0n },
        ],
      });
      expect(res.replayed).toBe(false);
      expect(await count(raw, 'ledger_transactions', tenantId)).toBe(1);
      expect(await count(raw, 'ledger_entries', tenantId)).toBe(2);
      // balance of each leg is 0
      expect(await accountBalance(db, { tenantId, accountCode: 'accounts_receivable', currency })).toBe(0n);
    });
  });
});

describe('accountBalance — sign convention', () => {
  it('returns sum(debits) - sum(credits): +debit on AR, -credit (negative) on revenue', async () => {
    await withLedgerDb(async ({ db, tenantId, currency }) => {
      await post(db, {
        tenantId,
        sourceType: 'invoice',
        sourceId: crypto.randomUUID(),
        periodStart: '2026-07-01',
        description: 'for balance',
        currency,
        entries: [
          { accountCode: 'accounts_receivable', direction: 'debit', amountMinor: 999n },
          { accountCode: 'sales_revenue', direction: 'credit', amountMinor: 999n },
        ],
      });

      // AR was debited -> balance is +999
      expect(await accountBalance(db, { tenantId, accountCode: 'accounts_receivable', currency })).toBe(999n);
      // Revenue was credited -> balance is -999 (debits-minus-credits sign convention)
      expect(await accountBalance(db, { tenantId, accountCode: 'sales_revenue', currency })).toBe(-999n);
    });
  });

  it('returns 0n for an account with no entries', async () => {
    await withLedgerDb(async ({ db, tenantId, currency }) => {
      expect(await accountBalance(db, { tenantId, accountCode: 'stripe_clearing', currency })).toBe(0n);
    });
  });
});

describe('nullable-periodStart idempotency semantics', () => {
  it('TWO posts with the SAME source but periodStart=null BOTH insert (NOT idempotent) — pins Postgres NULL-in-unique semantics', async () => {
    // Postgres treats NULLs as distinct in a unique index, so the
    // (tenant_id, source_type, source_id, period_start) idempotency key does NOT
    // deduplicate when period_start IS NULL. ON CONFLICT ... DO NOTHING therefore
    // never engages and both inserts succeed. CONSEQUENCE (documented for C4):
    // one-shot sources (refunds, adjustments, one-off invoices) MUST pass a
    // non-null periodStart (e.g. the source's createdAt date) to get idempotency.
    await withLedgerDb(async ({ db, tenantId, currency, raw }) => {
      const sourceId = crypto.randomUUID();
      const base = {
        tenantId,
        sourceType: 'refund' as const,
        sourceId,
        periodStart: null as string | null,
        description: 'one-shot',
        currency,
        entries: [
          { accountCode: 'sales_revenue', direction: 'debit' as const, amountMinor: 500n },
          { accountCode: 'stripe_clearing', direction: 'credit' as const, amountMinor: 500n },
        ],
      };

      const first = await post(db, base);
      const second = await post(db, base);

      // Because period_start is NULL, the unique index does not match -> both
      // insert, different transaction ids, neither is a replay.
      expect(first.replayed).toBe(false);
      expect(second.replayed).toBe(false);
      expect(second.transactionId).not.toBe(first.transactionId);
      expect(await count(raw, 'ledger_transactions', tenantId)).toBe(2);
      expect(await count(raw, 'ledger_entries', tenantId)).toBe(4);
    });
  });

  it('a non-null periodStart restores idempotency for the same one-shot source (the caller-side fix)', async () => {
    await withLedgerDb(async ({ db, tenantId, currency, raw }) => {
      const sourceId = crypto.randomUUID();
      const base = {
        tenantId,
        sourceType: 'refund' as const,
        sourceId,
        // Caller supplies a non-null period (e.g. source.createdAt) -> idempotency restored.
        periodStart: '2026-07-13' as string | null,
        description: 'one-shot, pinned',
        currency,
        entries: [
          { accountCode: 'sales_revenue', direction: 'debit' as const, amountMinor: 500n },
          { accountCode: 'stripe_clearing', direction: 'credit' as const, amountMinor: 500n },
        ],
      };

      const first = await post(db, base);
      const second = await post(db, base);
      expect(first.replayed).toBe(false);
      expect(second.replayed).toBe(true);
      expect(second.transactionId).toBe(first.transactionId);
      expect(await count(raw, 'ledger_transactions', tenantId)).toBe(1);
      expect(await count(raw, 'ledger_entries', tenantId)).toBe(2);
    });
  });
});
