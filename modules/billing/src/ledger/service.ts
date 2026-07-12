/**
 * Ledger posting invariant (Phase C / Task C3 — D2 money core).
 *
 * This is where "the books reconcile to Stripe to the cent" actually lives. Every
 * journal entry posts through {@link post}, which guarantees two things:
 *
 *   1. **Balanced**: every transaction has sum(debits) === sum(credits).
 *   2. **Idempotent**: re-posting the same `(tenantId, sourceType, sourceId,
 *      periodStart)` is a no-op that returns the existing transaction id with
 *      `replayed: true`. This makes webhook / event redelivery safe.
 *
 * Both guarantees hold inside a single SQL transaction, so a validation or
 * balance-check failure rolls the whole post back atomically.
 *
 * ## DB port
 * {@link post} / {@link accountBalance} operate on a {@link LedgerDb} — a
 * minimal `{ query, transaction }` port over Postgres. This keeps the posting
 * logic driver-agnostic: in production, C4 wraps the app's drizzle `ctx.db`
 * (postgres-js) to satisfy the port (a few-line adapter — see
 * {@link wrapLedgerDb}); in tests, the port is backed by PGlite (in-process
 * Postgres, no docker). The port speaks parameterized SQL strings so the real
 * Postgres `ON CONFLICT ... DO NOTHING RETURNING` semantics are exercised
 * end-to-end in CI.
 *
 * ## Money
 * Amounts are `bigint` minor units of the transaction's single `currency`
 * (see C1's `@panel1/core` money helpers). `amountMinor` is the magnitude;
 * sign comes from `direction` (debit/credit), not the amount. `post` validates
 * `amountMinor >= 0n` defensively because the DB `CHECK (amount_minor >= 0)`
 * is NOT enforced under `drizzle-kit push:pg` (drizzle-kit 0.20.x skips
 * `check()`).
 *
 * ## nullable-periodStart idempotency subtlety (load-bearing — read this)
 * The idempotency unique index is
 * `(tenant_id, source_type, source_id, period_start)`. Postgres treats NULLs as
 * **distinct** in a unique index, so when `period_start IS NULL` the index does
 * NOT match across rows and `ON CONFLICT ... DO NOTHING` never engages. That
 * means **a NULL `periodStart` is NOT idempotent**: re-posting the same source
 * with a null period inserts a second, duplicate transaction.
 *
 * Resolution (deliberate, pinned by tests in service.test.ts):
 *   - **Recurring sources** (e.g. subscription renewal for a billing period)
 *     pass the period's start date — naturally unique per period.
 *   - **One-shot sources** (a refund, an adjustment, a one-off invoice) MUST
 *     pass a non-null `periodStart` (typically the source's `createdAt` date) to
 *     get idempotency. Passing `null` is permitted (it will post) but a second
 *     post with the same source + `null` will insert a duplicate — so callers
 *     must choose deliberately. The null-period behavior is asserted explicitly
 *     so a regression is caught at CI.
 *
 * ## accountBalance sign convention
 * {@link accountBalance} returns `sum(debits) - sum(credits)` as a `bigint`.
 * Debiting an account increases its balance; crediting decreases it. So an
 * invoice that debits `accounts_receivable` and credits `sales_revenue` yields
 * `accountBalance(ar) === +999n` and `accountBalance(revenue) === -999n`. This
 * is the figure the M1 reconciliation compares against Stripe (the AR balance
 * is what customers owe; the stripe_clearing liability balance is what we owe
 * Stripe / what's been collected).
 */
import type { QueryResultRow } from './types.js';

// --- DB port ----------------------------------------------------------------

/**
 * Row shape returned by {@link LedgerDb.query}: an array of plain objects keyed
 * by column name. `bigint` columns arrive as strings over the JSON wire format
 * (both `postgres-js` and PGlite); callers coerce with `BigInt(...)`.
 */
export type DbRow = QueryResultRow;

/**
 * Minimal Postgres port that {@link post} and {@link accountBalance} need.
 *
 * - `query(text, params)` runs one parameterized SQL statement and returns its
 *   rows (empty for non-RETURNING DML).
 * - `transaction(fn)` runs `fn` inside a single `BEGIN`/`COMMIT` SQL transaction
 *   and ROLLBACKs on throw. `fn` receives a `tx` exposing the same `query` and
 *   a `transaction` for nesting.
 *
 * Production: build one from a drizzle `ctx.db` via {@link wrapLedgerDb}.
 * Tests: the PGlite harness implements this directly.
 */
export interface LedgerDb {
  query<T extends DbRow = DbRow>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  transaction<T>(fn: (tx: LedgerDb) => Promise<T>): Promise<T>;
}

// --- Input / result types ---------------------------------------------------

export type Direction = 'debit' | 'credit';
export type SourceType = 'invoice' | 'payment' | 'refund' | 'adjustment';

export interface PostEntry {
  /** Account code, e.g. 'accounts_receivable'; resolved to an id via ledger_accounts. */
  accountCode: string;
  direction: Direction;
  /** Magnitude in minor units of the transaction currency; MUST be >= 0. */
  amountMinor: bigint;
}

export interface PostInput {
  tenantId: string;
  sourceType: SourceType;
  sourceId: string;
  /**
   * Idempotency period start, ISO `YYYY-MM-DD`. For recurring sources pass the
   * billing period start. For one-shot sources pass a non-null discriminator
   * (e.g. the source's createdAt date) to get idempotency — see the file header
   * on the nullable-periodStart subtlety.
   */
  periodStart?: string | null;
  description: string;
  /** Single currency per transaction (every entry leg shares it). */
  currency: string;
  entries: PostEntry[];
}

export interface PostResult {
  transactionId: string;
  /** true iff an existing transaction for the same idempotency key was found (no-op re-post). */
  replayed: boolean;
}

export interface AccountBalanceInput {
  tenantId: string;
  accountCode: string;
  currency: string;
}

// --- Error classes ----------------------------------------------------------

/**
 * Thrown when `sum(debits) !== sum(credits)` for a {@link PostInput}. This is
 * THE invariant; a posted transaction is always balanced.
 */
export class UnbalancedTransactionError extends Error {
  constructor(
    public readonly debitSum: bigint,
    public readonly creditSum: bigint,
    public readonly reason: string,
  ) {
    super(
      `Unbalanced ledger transaction: ${reason} (debits=${debitSum.toString()}, credits=${creditSum.toString()}). ` +
        `Every post must satisfy sum(debits) === sum(credits).`,
    );
    this.name = 'UnbalancedTransactionError';
  }
}

/** Thrown when an entry references an account code not present in ledger_accounts. */
export class UnknownAccountError extends Error {
  constructor(public readonly code: string, public readonly tenantId: string, public readonly currency: string) {
    super(
      `Unknown ledger account code "${code}" for tenant ${tenantId} / currency ${currency}. ` +
        `Ensure C4 seeded the standard accounts for this tenant+currency.`,
    );
    this.name = 'UnknownAccountError';
  }
}

/**
 * Thrown when an entry's `amountMinor < 0n`. Defensive: the DB
 * `CHECK (amount_minor >= 0)` is NOT enforced under `drizzle-kit push:pg`, so
 * `post` validates in code. The sign of a movement comes from `direction`, not
 * the amount.
 */
export class InvalidAmountError extends Error {
  constructor(public readonly amountMinor: bigint, public readonly accountCode: string) {
    super(
      `Invalid amount_minor ${amountMinor.toString()} for account "${accountCode}": must be >= 0. ` +
        `Sign comes from direction (debit/credit), not the amount.`,
    );
    this.name = 'InvalidAmountError';
  }
}

// --- post() -----------------------------------------------------------------

/**
 * Post a balanced, idempotent ledger transaction. See the file header for the
 * full algorithm and the nullable-periodStart / sign-convention guarantees.
 *
 * Atomicity: runs entirely inside one SQL transaction; any throw rolls back so
 * no partial transaction/entries are ever persisted.
 */
export async function post(db: LedgerDb, input: PostInput): Promise<PostResult> {
  return db.transaction(async (tx) => {
    // 1. Validate.
    validateInput(input);

    // 2. Resolve account codes -> account ids (single currency per tx).
    const resolved = await resolveAccounts(tx, input);

    // 3. Idempotent insert of the transaction (or detect the replay).
    const insertRows = await tx.query<{ id: string }>(
      `INSERT INTO ledger_transactions (tenant_id, description, source_type, source_id, period_start)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, source_type, source_id, period_start) DO NOTHING
       RETURNING id`,
      [input.tenantId, input.description, input.sourceType, input.sourceId, input.periodStart ?? null],
    );

    if (insertRows.rows.length > 0) {
      // New transaction: insert all entry legs.
      const transactionId = insertRows.rows[0].id;
      await insertEntries(tx, {
        tenantId: input.tenantId,
        transactionId,
        currency: input.currency,
        resolved,
      });
      return { transactionId, replayed: false };
    }

    // Existing transaction for this idempotency key: do NOT insert entries
    // (they already exist). Look up the existing id. `period_start IS NOT
    // DISTINCT FROM $5` correctly matches NULL periods too (should the caller
    // have passed null), though null-period posts are not idempotent by design.
    const existing = await tx.query<{ id: string }>(
      `SELECT id FROM ledger_transactions
       WHERE tenant_id = $1 AND source_type = $2 AND source_id = $3
         AND period_start IS NOT DISTINCT FROM $4
       LIMIT 1`,
      [input.tenantId, input.sourceType, input.sourceId, input.periodStart ?? null],
    );
    if (existing.rows.length === 0) {
      // Should be impossible: ON CONFLICT DO NOTHING returned no row, so a row
      // for this key must exist. Guard against a race/bug by surfacing it.
      throw new Error(
        `Ledger idempotency invariant violated: ON CONFLICT returned no row but no existing ` +
          `transaction found for tenant=${input.tenantId} source=${input.sourceType}:${input.sourceId} period=${input.periodStart ?? 'null'}`,
      );
    }
    return { transactionId: existing.rows[0].id, replayed: true };
  });
}

/** Validate the {@link PostInput} before touching the DB. Throws on bad input. */
function validateInput(input: PostInput): void {
  if (!input.currency || input.currency.length === 0) {
    throw new Error('Ledger post requires a non-empty currency (a single currency per transaction).');
  }
  if (input.entries.length < 2) {
    // A single leg (or none) can never balance.
    throw new UnbalancedTransactionError(0n, 0n, `only ${input.entries.length} entry provided; need at least one debit and one credit`);
  }

  let debitSum = 0n;
  let creditSum = 0n;
  let hasDebit = false;
  let hasCredit = false;
  for (const e of input.entries) {
    if (e.amountMinor < 0n) {
      throw new InvalidAmountError(e.amountMinor, e.accountCode);
    }
    if (e.direction === 'debit') {
      debitSum += e.amountMinor;
      hasDebit = true;
    } else {
      creditSum += e.amountMinor;
      hasCredit = true;
    }
  }

  // Must have at least one leg on each side (all-debit or all-credit can never balance).
  if (!hasDebit || !hasCredit) {
    throw new UnbalancedTransactionError(debitSum, creditSum, 'transaction must have at least one debit and one credit');
  }
  // THE invariant: debits == credits.
  if (debitSum !== creditSum) {
    throw new UnbalancedTransactionError(debitSum, creditSum, 'debits do not equal credits');
  }
}

interface ResolvedEntry {
  accountId: string;
  direction: Direction;
  amountMinor: bigint;
}

/** Resolve every entry's accountCode to an accountId, throwing on unknown codes. */
async function resolveAccounts(tx: LedgerDb, input: PostInput): Promise<ResolvedEntry[]> {
  // Gather unique codes to resolve in as few queries as possible.
  const uniqueCodes = Array.from(new Set(input.entries.map((e) => e.accountCode)));
  const idByCode = new Map<string, string>();

  for (const code of uniqueCodes) {
    const rows = await tx.query<{ id: string }>(
      `SELECT id FROM ledger_accounts WHERE tenant_id = $1 AND code = $2 AND currency = $3 LIMIT 1`,
      [input.tenantId, code, input.currency],
    );
    if (rows.rows.length === 0) {
      throw new UnknownAccountError(code, input.tenantId, input.currency);
    }
    idByCode.set(code, rows.rows[0].id);
  }

  return input.entries.map((e) => ({
    accountId: idByCode.get(e.accountCode)!,
    direction: e.direction,
    amountMinor: e.amountMinor,
  }));
}

/** Insert all entry legs for a transaction. */
async function insertEntries(
  tx: LedgerDb,
  args: {
    tenantId: string;
    transactionId: string;
    currency: string;
    resolved: ResolvedEntry[];
  },
): Promise<void> {
  // Batch-insert in one statement (parameterized). One row per leg.
  // Columns: tenant_id, transaction_id, account_id, direction, amount_minor, currency
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let i = 1;
  for (const e of args.resolved) {
    placeholders.push(`($${i}, $${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5})`);
    values.push(args.tenantId, args.transactionId, e.accountId, e.direction, e.amountMinor.toString(), args.currency);
    i += 6;
  }
  await tx.query(
    `INSERT INTO ledger_entries (tenant_id, transaction_id, account_id, direction, amount_minor, currency)
     VALUES ${placeholders.join(', ')}`,
    values,
  );
}

// --- accountBalance() -------------------------------------------------------

/**
 * Return the debit-minus-credit balance of an account in minor units.
 *
 * Sign convention: `sum(debit amount_minor) - sum(credit amount_minor)`.
 * Debiting increases the balance; crediting decreases it. Returns `0n` for an
 * account with no entries.
 *
 * `amount_minor` is a `bigint` column but arrives over the JSON wire as a string
 * (both `postgres-js` and PGlite), so the result is coerced via `BigInt(...)`.
 */
export async function accountBalance(
  db: LedgerDb,
  input: AccountBalanceInput,
): Promise<bigint> {
  // Resolve the account id (also serves as existence validation).
  const acct = await db.query<{ id: string }>(
    `SELECT id FROM ledger_accounts WHERE tenant_id = $1 AND code = $2 AND currency = $3 LIMIT 1`,
    [input.tenantId, input.accountCode, input.currency],
  );
  if (acct.rows.length === 0) {
    throw new UnknownAccountError(input.accountCode, input.tenantId, input.currency);
  }
  const accountId = acct.rows[0].id;

  const result = await db.query<{ debit_total: string; credit_total: string }>(
    `SELECT
       COALESCE(sum(amount_minor) FILTER (WHERE direction = 'debit'), 0)::text AS debit_total,
       COALESCE(sum(amount_minor) FILTER (WHERE direction = 'credit'), 0)::text AS credit_total
     FROM ledger_entries
     WHERE tenant_id = $1 AND account_id = $2`,
    [input.tenantId, accountId],
  );
  const row = result.rows[0];
  return BigInt(row.debit_total) - BigInt(row.credit_total);
}

// --- Production wiring (C4) ------------------------------------------------
//
// `post` and `accountBalance` are driven by the {@link LedgerDb} port so the
// posting logic is driver-agnostic and testable against PGlite without docker.
// In production, C4 wraps the app's drizzle `ctx.db` (postgres-js) to satisfy
// the port: `query(text, params)` maps to the underlying driver's parameterized
// execute, and `transaction(fn)` maps to `ctx.db.transaction((tx) => fn(wrap(tx)))`.
//
// The adapter lives in C4 (not here) because it depends on the specific drizzle
// driver the host app uses (postgres-js today). It is deliberately out of scope
// for C3.
