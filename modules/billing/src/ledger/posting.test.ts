/**
 * Ledger posting-rule tests (Phase C / Task C4 — invoice / payment / refund).
 *
 * These tests ARE the accounting guarantee for the business layer: every rule
 * funnels money through {@link post} (balanced + idempotent), money is `bigint`
 * minor units (no float), refunds are append-only, and large amounts (> 2^53)
 * survive the bigint-mode:number trap. Run via PGlite (in-process Postgres) —
 * no docker, no live DB — so the suite is CI-runnable.
 *
 * TDD: written first, watched fail, then implemented against posting.ts.
 *
 * The harness extends C3's (service.test.ts) by also creating `refund_records`
 * and seeding the full 5-account chart via the production {@link ensureStandardAccounts}.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { toMinor } from '@panel1/core';
import { accountBalance, type LedgerDb } from './service.js';
import {
  postInvoiceIssued,
  postPaymentSucceeded,
  postRefund,
  totalRefunded,
  InvoiceTotalMismatchError,
} from './posting.js';
import { ensureStandardAccounts, STANDARD_ACCOUNTS } from './accounts.js';

// --- Schema (mirrors modules/billing/src/ledger/schema.ts + 0005_ledger.sql) --

const SCHEMA_SQL = `
DO $$ BEGIN CREATE TYPE ledger_account_type AS ENUM ('asset','liability','revenue','equity'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ledger_source_type AS ENUM ('invoice','payment','refund','adjustment'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ledger_transaction_status AS ENUM ('pending','posted','voided'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE ledger_entry_direction AS ENUM ('debit','credit'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE refund_record_status AS ENUM ('pending','succeeded','failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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

CREATE TABLE IF NOT EXISTS refund_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  gateway_ref text,
  amount_minor bigint NOT NULL,
  currency char(3) NOT NULL,
  status refund_record_status NOT NULL,
  created_at timestamptz DEFAULT now()
,
  CONSTRAINT refund_records_amount_minor_positive_check CHECK (amount_minor > 0)
);
CREATE INDEX IF NOT EXISTS refund_records_tenant_payment_idx ON refund_records (tenant_id, payment_id);
`;

interface TestWorld {
  db: LedgerDb;
  /** Raw pglite handle, for row-count / amount assertions that bypass the port. */
  raw: PGlite;
  tenantId: string;
  currency: string;
}

/**
 * Boot a FRESH pglite Postgres, create the ledger schema (incl. refund_records),
 * and seed the 5 standard accounts via the real {@link ensureStandardAccounts}.
 * Each test gets its own DB — no cross-test leakage.
 */
async function withLedgerDb(testFn: (world: TestWorld) => Promise<void>): Promise<void> {
  const pglite = await PGlite.create();
  try {
    await pglite.exec(SCHEMA_SQL);
    const tenantId = crypto.randomUUID();
    const currency = 'USD';
    const db: LedgerDb = makePgliteDb(pglite);
    await ensureStandardAccounts(db, { tenantId, currency });
    await testFn({ db, raw: pglite, tenantId, currency });
  } finally {
    await pglite.close();
  }
}

/** Build a {@link LedgerDb} port over a raw PGlite instance (mirrors service.test.ts). */
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
async function count(
  raw: PGlite,
  table: 'ledger_transactions' | 'ledger_entries' | 'refund_records',
  tenantId: string,
): Promise<number> {
  const r = await raw.query(`SELECT count(*)::int AS n FROM ${table} WHERE tenant_id = $1`, [tenantId]);
  return Number((r.rows[0] as { n: number }).n);
}

/** Read a `bigint` amount straight from the DB as a JS bigint (raw ::text cast). */
async function sumAmount(
  raw: PGlite,
  table: 'ledger_entries' | 'refund_records',
  whereClause: string,
  params: unknown[],
): Promise<bigint> {
  const r = await raw.query(`SELECT COALESCE(SUM(amount_minor), 0)::text AS s FROM ${table} WHERE ${whereClause}`, params);
  return BigInt((r.rows[0] as { s: string }).s);
}

// --- Tests: account seeding --------------------------------------------------

describe('ensureStandardAccounts — idempotent chart-of-accounts seeding', () => {
  it('seeds all 5 standard accounts for a tenant+currency and is idempotent on re-call', async () => {
    const pglite = await PGlite.create();
    try {
      await pglite.exec(SCHEMA_SQL);
      const db = makePgliteDb(pglite);
      const tenantId = crypto.randomUUID();
      const currency = 'USD';

      await ensureStandardAccounts(db, { tenantId, currency });
      await ensureStandardAccounts(db, { tenantId, currency }); // idempotent

      const r = await pglite.query(
        `SELECT code, type FROM ledger_accounts WHERE tenant_id = $1 AND currency = $2 ORDER BY code`,
        [tenantId, currency],
      );
      const rows = r.rows as Array<{ code: string; type: string }>;
      expect(rows).toHaveLength(STANDARD_ACCOUNTS.length);
      const byCode = new Map(rows.map((x) => [x.code, x.type]));
      for (const a of STANDARD_ACCOUNTS) {
        expect(byCode.get(a.code)).toBe(a.type);
      }
    } finally {
      await pglite.close();
    }
  });
});

// --- Tests: invoice issued ---------------------------------------------------

describe('postInvoiceIssued', () => {
  it('posts a balanced 3-line entry: DR ar = CR revenue + CR tax', async () => {
    await withLedgerDb(async ({ db, tenantId, currency }) => {
      const invoice = {
        id: crypto.randomUUID(),
        tenantId,
        currency,
        subtotal: '100.00',
        tax: '20.00',
        total: '120.00',
        createdAt: '2026-07-13',
      };

      const res = await postInvoiceIssued(db, { invoice });
      expect(res.replayed).toBe(false);

      // AR debited by total: balance = +toMinor(total)
      const ar = await accountBalanceRaw({ db }, { tenantId, accountCode: 'accounts_receivable', currency });
      expect(ar).toBe(toMinor('120.00', currency));
      // Revenue credited by subtotal: balance = -toMinor(subtotal)
      const rev = await accountBalanceRaw({ db }, { tenantId, accountCode: 'sales_revenue', currency });
      expect(rev).toBe(-toMinor('100.00', currency));
      // Tax payable credited by tax
      const tax = await accountBalanceRaw({ db }, { tenantId, accountCode: 'tax_payable', currency });
      expect(tax).toBe(-toMinor('20.00', currency));
    });
  });

  it('is idempotent: re-posting the same invoice replays (single tx, single entry set)', async () => {
    await withLedgerDb(async ({ db, tenantId, currency, raw }) => {
      const invoice = {
        id: crypto.randomUUID(),
        tenantId,
        currency,
        subtotal: '50.00',
        tax: '0.00',
        total: '50.00',
        createdAt: '2026-07-13',
      };

      const first = await postInvoiceIssued(db, { invoice });
      const second = await postInvoiceIssued(db, { invoice });
      expect(first.replayed).toBe(false);
      expect(second.replayed).toBe(true);
      expect(second.transactionId).toBe(first.transactionId);

      // Still exactly ONE invoice transaction and THREE entries.
      const txCount = await count(raw, 'ledger_transactions', tenantId);
      expect(txCount).toBe(1);
      const entrySum = await sumAmount(raw, 'ledger_entries', 'tenant_id = $1', [tenantId]);
      // 3 legs of 5000 (one debit ar, one credit revenue, one zero credit tax)
      // total movement magnitude = 5000 (dr) + 5000 (cr rev) + 0 (tax) = 10000
      expect(entrySum).toBe(10000n);
    });
  });

  it('throws InvoiceTotalMismatchError (no post) when subtotal + tax !== total', async () => {
    await withLedgerDb(async ({ db, tenantId, currency, raw }) => {
      const invoice = {
        id: crypto.randomUUID(),
        tenantId,
        currency,
        subtotal: '100.00',
        tax: '20.00',
        total: '119.99', // drift: 100 + 20 != 119.99
        createdAt: '2026-07-13',
      };

      await expect(postInvoiceIssued(db, { invoice })).rejects.toBeInstanceOf(InvoiceTotalMismatchError);

      // Nothing posted.
      expect(await count(raw, 'ledger_transactions', tenantId)).toBe(0);
      expect(await count(raw, 'ledger_entries', tenantId)).toBe(0);
    });
  });
});

// --- Tests: payment succeeded ------------------------------------------------

describe('postPaymentSucceeded — covered state-machine flag', () => {
  it('a partial payment leaves covered === false (invoice NOT yet paid)', async () => {
    await withLedgerDb(async ({ db, tenantId, currency }) => {
      const invoice = {
        id: crypto.randomUUID(),
        tenantId,
        currency,
        subtotal: '100.00',
        tax: '0.00',
        total: '100.00',
        createdAt: '2026-07-13',
      };
      await postInvoiceIssued(db, { invoice });

      // Partial payment of 60.00 against a 100.00 invoice.
      const payment = {
        id: crypto.randomUUID(),
        tenantId,
        currency,
        amount: '60.00',
        createdAt: '2026-07-14',
      };
      const res = await postPaymentSucceeded(db, { payment, invoice });
      expect(res.replayed).toBe(false);
      expect(res.covered).toBe(false);

      // stripe_clearing debited 6000; AR credited 6000 (so AR balance = 10000-6000 = 4000 > 0).
      const ar = await accountBalanceRaw({ db }, { tenantId, accountCode: 'accounts_receivable', currency });
      expect(ar).toBe(4000n);
    });
  });

  it('a second payment covering the remainder flips covered === true', async () => {
    await withLedgerDb(async ({ db, tenantId, currency }) => {
      const invoice = {
        id: crypto.randomUUID(),
        tenantId,
        currency,
        subtotal: '100.00',
        tax: '0.00',
        total: '100.00',
        createdAt: '2026-07-13',
      };
      await postInvoiceIssued(db, { invoice });

      const p1 = { id: crypto.randomUUID(), tenantId, currency, amount: '60.00', createdAt: '2026-07-14' };
      const r1 = await postPaymentSucceeded(db, { payment: p1, invoice });
      expect(r1.covered).toBe(false);

      const p2 = { id: crypto.randomUUID(), tenantId, currency, amount: '40.00', createdAt: '2026-07-15' };
      const r2 = await postPaymentSucceeded(db, { payment: p2, invoice });
      expect(r2.covered).toBe(true);

      // AR balance is now exactly 0 (settled).
      const ar = await accountBalanceRaw({ db }, { tenantId, accountCode: 'accounts_receivable', currency });
      expect(ar).toBe(0n);
    });
  });

  it('is idempotent: re-posting the same payment replays and does not double-count', async () => {
    await withLedgerDb(async ({ db, tenantId, currency, raw }) => {
      const invoice = {
        id: crypto.randomUUID(),
        tenantId,
        currency,
        subtotal: '100.00',
        tax: '0.00',
        total: '100.00',
        createdAt: '2026-07-13',
      };
      await postInvoiceIssued(db, { invoice });

      const payment = { id: crypto.randomUUID(), tenantId, currency, amount: '100.00', createdAt: '2026-07-14' };
      const first = await postPaymentSucceeded(db, { payment, invoice });
      const second = await postPaymentSucceeded(db, { payment, invoice });
      expect(first.replayed).toBe(false);
      expect(second.replayed).toBe(true);
      expect(second.transactionId).toBe(first.transactionId);

      // Single payment transaction; AR still settled exactly once.
      const txCount = await count(raw, 'ledger_transactions', tenantId);
      expect(txCount).toBe(2); // 1 invoice + 1 payment
      const ar = await accountBalanceRaw({ db }, { tenantId, accountCode: 'accounts_receivable', currency });
      expect(ar).toBe(0n);
      expect(first.covered).toBe(true);
    });
  });
});

// --- Tests: refund -----------------------------------------------------------

describe('postRefund / totalRefunded — append-only, succeeded-only', () => {
  it('appends a refund_records row AND posts the balanced entry for a succeeded refund', async () => {
    await withLedgerDb(async ({ db, tenantId, currency, raw }) => {
      // Setup: an invoice + payment so AR has something to refund against.
      const invoice = {
        id: crypto.randomUUID(),
        tenantId,
        currency,
        subtotal: '100.00',
        tax: '0.00',
        total: '100.00',
        createdAt: '2026-07-13',
      };
      await postInvoiceIssued(db, { invoice });
      const payment = { id: crypto.randomUUID(), tenantId, currency, amount: '100.00', createdAt: '2026-07-14' };
      await postPaymentSucceeded(db, { payment, invoice });

      const res = await postRefund(db, {
        payment,
        refundAmountMinor: 3000n,
        gatewayRef: 're_abc123',
        status: 'succeeded',
        createdAt: '2026-07-16',
      });
      expect(res.posted).toBe(true);
      expect(res.replayed).toBe(false);
      expect(res.refundRecordId).toMatch(/^[0-9a-f-]{36}$/);

      // refund_records has exactly 1 row.
      expect(await count(raw, 'refund_records', tenantId)).toBe(1);
      // totalRefunded reflects it.
      expect(await totalRefunded(db, { paymentId: payment.id })).toBe(3000n);

      // Ledger: refunds debited 3000, AR credited 3000 (AR balance goes from 0 to -3000).
      const ar = await accountBalanceRaw({ db }, { tenantId, accountCode: 'accounts_receivable', currency });
      expect(ar).toBe(-3000n);
      const refundsBal = await accountBalanceRaw({ db }, { tenantId, accountCode: 'refunds', currency });
      expect(refundsBal).toBe(3000n);
    });
  });

  it('a FAILED refund appends a record but does NOT increase totalRefunded and does NOT post', async () => {
    await withLedgerDb(async ({ db, tenantId, currency, raw }) => {
      const invoice = {
        id: crypto.randomUUID(),
        tenantId,
        currency,
        subtotal: '100.00',
        tax: '0.00',
        total: '100.00',
        createdAt: '2026-07-13',
      };
      await postInvoiceIssued(db, { invoice });
      const payment = { id: crypto.randomUUID(), tenantId, currency, amount: '100.00', createdAt: '2026-07-14' };
      await postPaymentSucceeded(db, { payment, invoice });

      const res = await postRefund(db, {
        payment,
        refundAmountMinor: 5000n,
        gatewayRef: 're_failed',
        status: 'failed',
        createdAt: '2026-07-16',
      });
      expect(res.posted).toBe(false);

      // The record IS preserved (append-only audit), but the ledger was NOT touched.
      expect(await count(raw, 'refund_records', tenantId)).toBe(1);
      expect(await totalRefunded(db, { paymentId: payment.id })).toBe(0n);
      // AR balance unchanged from the post-payment 0.
      const ar = await accountBalanceRaw({ db }, { tenantId, accountCode: 'accounts_receivable', currency });
      expect(ar).toBe(0n);
      const refundsBal = await accountBalanceRaw({ db }, { tenantId, accountCode: 'refunds', currency });
      expect(refundsBal).toBe(0n);
    });
  });

  it('a second succeeded refund appends a second record (no overwrite) and totalRefunded sums them', async () => {
    await withLedgerDb(async ({ db, tenantId, currency, raw }) => {
      const invoice = {
        id: crypto.randomUUID(),
        tenantId,
        currency,
        subtotal: '100.00',
        tax: '0.00',
        total: '100.00',
        createdAt: '2026-07-13',
      };
      await postInvoiceIssued(db, { invoice });
      const payment = { id: crypto.randomUUID(), tenantId, currency, amount: '100.00', createdAt: '2026-07-14' };
      await postPaymentSucceeded(db, { payment, invoice });

      await postRefund(db, {
        payment,
        refundAmountMinor: 3000n,
        gatewayRef: 're_one',
        status: 'succeeded',
        createdAt: '2026-07-16',
      });
      await postRefund(db, {
        payment,
        refundAmountMinor: 2000n,
        gatewayRef: 're_two',
        status: 'succeeded',
        createdAt: '2026-07-17',
      });

      // TWO records (append-only, distinct gateway refs / record ids).
      expect(await count(raw, 'refund_records', tenantId)).toBe(2);
      // Sum of succeeded.
      expect(await totalRefunded(db, { paymentId: payment.id })).toBe(5000n);
      // Ledger reflects the sum (AR -5000, refunds +5000).
      const ar = await accountBalanceRaw({ db }, { tenantId, accountCode: 'accounts_receivable', currency });
      expect(ar).toBe(-5000n);
      const refundsBal = await accountBalanceRaw({ db }, { tenantId, accountCode: 'refunds', currency });
      expect(refundsBal).toBe(5000n);
    });
  });

  it('is idempotent per refund sourceId: re-posting the same refund record replays (no double entry)', async () => {
    await withLedgerDb(async ({ db, tenantId, currency, raw }) => {
      const invoice = {
        id: crypto.randomUUID(),
        tenantId,
        currency,
        subtotal: '100.00',
        tax: '0.00',
        total: '100.00',
        createdAt: '2026-07-13',
      };
      await postInvoiceIssued(db, { invoice });
      const payment = { id: crypto.randomUUID(), tenantId, currency, amount: '100.00', createdAt: '2026-07-14' };
      await postPaymentSucceeded(db, { payment, invoice });

      const args = {
        payment,
        refundAmountMinor: 2500n,
        gatewayRef: 're_idem',
        status: 'succeeded' as const,
        createdAt: '2026-07-16',
      };
      // NOTE: a redelivered refund event carries the SAME refund record id, so
      // we re-call postRefund — but each call inserts a NEW refund_records row
      // (append-only). The ledger idempotency therefore lives at the post()
      // level: the same (tenant, 'refund', recordId, createdAt) replays. To
      // simulate the redelivery faithfully, we post once, then re-post with the
      // SAME refundRecordId by reusing the returned id as sourceId. Since the
      // second postRefund call would append a second record, the real-world
      // redelivery guard is that the gateway event is deduped upstream (R2d
      // webhook_events). Here we verify the ledger layer's own idempotency:
      // calling post() twice with the same source never double-posts.
      const first = await postRefund(db, args);

      // Re-invoke the ledger post directly with the same source id to prove
      // idempotency at the money layer.
      const { post } = await import('./service.js');
      const replay = await post(db, {
        tenantId,
        sourceType: 'refund',
        sourceId: first.refundRecordId,
        periodStart: args.createdAt,
        description: 'replay',
        currency,
        entries: [
          { accountCode: 'refunds', direction: 'debit', amountMinor: 2500n },
          { accountCode: 'accounts_receivable', direction: 'credit', amountMinor: 2500n },
        ],
      });
      expect(replay.replayed).toBe(true);
      expect(replay.transactionId).toBe(first.transactionId);

      // One refund record, one refund transaction, no double-count.
      expect(await count(raw, 'refund_records', tenantId)).toBe(1);
      expect(await totalRefunded(db, { paymentId: payment.id })).toBe(2500n);
    });
  });
});

// --- Tests: no float anywhere (large-amount precision) ----------------------

describe('large-amount precision — the bigint-mode:number trap', () => {
  it('survives amounts that overflow a JS number (> 2^53 minor units) end-to-end', async () => {
    await withLedgerDb(async ({ db, tenantId, currency, raw }) => {
      // 999,999,999.99 USD = 99,999,999,999 minor units = ~9.99e10.
      // 2^53 = 9,007,199,254,740,992 (~9.0e15), so a single 999,999,999.99
      // invoice is fine for a JS number. To actually exceed 2^53 we use a
      // number with > 16 significant digits in minor units: 9,007,199,254,740,993
      // (= 2^53 + 1) minor units. fromMinor would format that as
      // 90,071,992,547,409.93 USD — a balance-sheet-scale figure. Proving this
      // round-trips exactly demonstrates the bigint path; the float path
      // (Number(amount_minor)) would lose the +1 and read back 2^53.
      const largeMinor = 2n ** 53n + 1n; // 9,007,199,254,740,993
      // Express as a decimal string for toMinor: 90071992547409.93
      const largeDecimal = '90071992547409.93';
      expect(toMinor(largeDecimal, currency)).toBe(largeMinor);

      const invoice = {
        id: crypto.randomUUID(),
        tenantId,
        currency,
        subtotal: largeDecimal,
        tax: '0.00',
        total: largeDecimal,
        createdAt: '2026-07-13',
      };
      await postInvoiceIssued(db, { invoice });

      // accountBalance reads via SUM(...)::text + BigInt — must survive intact.
      const ar = await accountBalanceRaw({ db }, { tenantId, accountCode: 'accounts_receivable', currency });
      expect(ar).toBe(largeMinor);

      // Raw SUM(amount_minor)::text on the DB also survives (proves it's the
      // ::text cast, not a JS-number round-trip, that preserves precision).
      const rawSum = await sumAmount(
        raw,
        'ledger_entries',
        'tenant_id = $1 AND direction = $2',
        [tenantId, 'debit'],
      );
      expect(rawSum).toBe(largeMinor);

      // And a deliberately wrong float-coercion would NOT equal this — pinning
      // that the bigint path is what's keeping precision. Number(2n**53n+1n)
      // rounds to 2^53 (the +1 is lost), so the float reading is off-by-one.
      const floatReading = Number(largeMinor);
      const bigintBack = BigInt(floatReading);
      expect(bigintBack).not.toBe(largeMinor); // Number() lost the +1
      expect(bigintBack).toBe(2n ** 53n); // rounded down to the representable double
    });
  });

  it('postRefund + totalRefunded preserve precision for large refund sums', async () => {
    await withLedgerDb(async ({ db, tenantId, currency }) => {
      const invoice = {
        id: crypto.randomUUID(),
        tenantId,
        currency,
        subtotal: '90071992547409.93',
        tax: '0.00',
        total: '90071992547409.93',
        createdAt: '2026-07-13',
      };
      await postInvoiceIssued(db, { invoice });
      const payment = {
        id: crypto.randomUUID(),
        tenantId,
        currency,
        amount: '90071992547409.93',
        createdAt: '2026-07-14',
      };
      await postPaymentSucceeded(db, { payment, invoice });

      const largeMinor = 2n ** 53n + 1n;
      const res = await postRefund(db, {
        payment,
        refundAmountMinor: largeMinor,
        gatewayRef: 're_big',
        status: 'succeeded',
        createdAt: '2026-07-16',
      });
      expect(res.posted).toBe(true);

      // totalRefunded uses SUM(amount_minor)::text + BigInt — survives.
      expect(await totalRefunded(db, { paymentId: payment.id })).toBe(largeMinor);
    });
  });
});

// --- Helper: thin wrapper so test intent reads as "the AR balance" ----------

/**
 * Same as the production {@link accountBalance} (sum debits - sum credits,
 * coerced via BigInt). Wrapped only for test readability.
 */
async function accountBalanceRaw(
  world: { db: LedgerDb },
  input: { tenantId: string; accountCode: string; currency: string },
): Promise<bigint> {
  return accountBalance(world.db, input);
}
