/**
 * Standard ledger chart-of-accounts + seeding (Phase C / Task C4 — D2 money core).
 *
 * The posting rules in {@link ./posting.ts} reference these five account codes.
 * Every tenant+currency MUST have them seeded before the first post, otherwise
 * {@link UnknownAccountError} fires from {@link post}. Call
 * {@link ensureStandardAccounts} at tenant provisioning / first ledger use.
 *
 * ## Why raw SQL (not drizzle insert)
 * The seed only touches `ledger_accounts`, which has no `bigint` columns — so
 * the C3-imposed "no drizzle select on amountMinor" trap does not bite here.
 * Still, we go through the {@link LedgerDb} port (raw parameterized SQL) so the
 * seeding is driver-agnostic and PGlite-testable identically to production,
 * matching how `post()` / `accountBalance()` already operate.
 */
import type { LedgerDb } from './service.js';

// --- Standard account codes (the contract posting.ts depends on) ------------

/** What customers owe us. Asset. Debited on invoice, credited on payment/refund. */
export const ACCOUNTS_RECEIVABLE = 'accounts_receivable';
/** Funds collected by Stripe, owed to us / pending payout. Asset. Debited on payment. */
export const STRIPE_CLEARING = 'stripe_clearing';
/** Recognized revenue. Revenue. Credited on invoice (subtotal leg). */
export const SALES_REVENUE = 'sales_revenue';
/** Sales tax / VAT collected on behalf of the tax authority. Liability. Credited on invoice (tax leg). */
export const TAX_PAYABLE = 'tax_payable';
/** Contra-revenue (refunds issued). Revenue. Debited on a succeeded refund. */
export const REFUNDS = 'refunds';

/**
 * The five standard accounts, in deterministic insertion order. The `type`
 * values are the literal enum members of `ledger_account_type`
 * (asset|liability|revenue|equity).
 */
export const STANDARD_ACCOUNTS: ReadonlyArray<{
  code: string;
  type: 'asset' | 'liability' | 'revenue' | 'equity';
}> = [
  { code: ACCOUNTS_RECEIVABLE, type: 'asset' },
  { code: STRIPE_CLEARING, type: 'asset' },
  { code: SALES_REVENUE, type: 'revenue' },
  { code: TAX_PAYABLE, type: 'liability' },
  { code: REFUNDS, type: 'revenue' }, // contra-revenue kept in the revenue enum
];

// --- Seeding ----------------------------------------------------------------

export interface EnsureStandardAccountsInput {
  tenantId: string;
  currency: string;
}

/**
 * Idempotently seed the {@link STANDARD_ACCOUNTS} for a tenant+currency.
 *
 * Uses `INSERT ... ON CONFLICT (tenant_id, code, currency) DO NOTHING` so it is
 * safe to call repeatedly (at provisioning, on first ledger post, etc.). Does
 * NOT return the inserted rows — callers resolve account ids by code at post
 * time (see {@link post}). Empty-op when all five already exist.
 *
 * Runs as a single statement (no transaction needed: each row is independently
 * idempotent and there are no cross-row dependencies).
 */
export async function ensureStandardAccounts(
  db: LedgerDb,
  input: EnsureStandardAccountsInput,
): Promise<void> {
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let i = 1;
  for (const a of STANDARD_ACCOUNTS) {
    placeholders.push(`($${i}, $${i + 1}, $${i + 2}, $${i + 3})`);
    values.push(input.tenantId, a.code, a.type, input.currency);
    i += 4;
  }
  await db.query(
    `INSERT INTO ledger_accounts (tenant_id, code, type, currency)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (tenant_id, code, currency) DO NOTHING`,
    values,
  );
}
