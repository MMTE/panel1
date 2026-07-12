/**
 * Double-entry ledger schema (D2 decision — money core).
 *
 * Canonical typed home for the ledger tables. Collected by the module loader
 * (via {@link ledgerSchema}) AND pushed by drizzle-kit (see apps/api/drizzle.config.ts
 * schema array) so `push:pg` creates these tables directly — no duplication of
 * the definitions into apps/api/src/db/schema/*.
 *
 * Money is stored as integer minor units (`amountMinor` bigint), NEVER decimal.
 * Posting logic / the balanced-debits==credits invariant lives in C3, not here.
 */
import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  char,
  date,
  timestamp,
  bigint,
  index,
  unique,
  primaryKey,
  check,
} from 'drizzle-orm/pg-core';

// --- Enums -----------------------------------------------------------------

export const ledgerAccountTypeEnum = pgEnum('ledger_account_type', [
  'asset',
  'liability',
  'revenue',
  'equity',
]);

export const ledgerSourceTypeEnum = pgEnum('ledger_source_type', [
  'invoice',
  'payment',
  'refund',
  'adjustment',
]);

export const ledgerTransactionStatusEnum = pgEnum('ledger_transaction_status', [
  'pending',
  'posted',
  'voided',
]);

export const ledgerEntryDirectionEnum = pgEnum('ledger_entry_direction', [
  'debit',
  'credit',
]);

export const refundRecordStatusEnum = pgEnum('refund_record_status', [
  'pending',
  'succeeded',
  'failed',
]);

// --- Tables ----------------------------------------------------------------

/**
 * Chart-of-accounts rows (e.g. 'accounts_receivable', 'stripe_clearing',
 * 'sales_revenue', 'tax_payable', 'refunds'). Seeded per tenant+currency by C4.
 */
export const ledgerAccounts = pgTable(
  'ledger_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    code: text('code').notNull(),
    type: ledgerAccountTypeEnum('type').notNull(),
    currency: char('currency', { length: 3 }).notNull(),
  },
  (table) => ({
    tenantCodeCurrencyUnique: unique('ledger_accounts_tenant_code_currency_uniq').on(
      table.tenantId,
      table.code,
      table.currency,
    ),
  }),
);

/**
 * A single logical ledger movement (one invoice / payment / refund / adjustment
 * per idempotency period). The UNIQUE(tenantId, sourceType, sourceId, periodStart)
 * constraint is the idempotency key: at most one ledger transaction per source
 * per period (periodStart is NULL for one-shot sources, which is fine — NULLs are
 * considered distinct by Postgres in a unique index).
 */
export const ledgerTransactions = pgTable(
  'ledger_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    description: text('description').notNull(),
    sourceType: ledgerSourceTypeEnum('source_type').notNull(),
    sourceId: uuid('source_id').notNull(),
    /** Idempotency period for recurring sources (e.g. subscription renewal month). NULL for one-shot. */
    periodStart: date('period_start'),
    postedAt: timestamp('posted_at', { withTimezone: true }).defaultNow().notNull(),
    status: ledgerTransactionStatusEnum('status').default('posted').notNull(),
  },
  (table) => ({
    idempotencyUnique: unique('ledger_transactions_idempotency_uniq').on(
      table.tenantId,
      table.sourceType,
      table.sourceId,
      table.periodStart,
    ),
    tenantIdx: index('ledger_transactions_tenant_idx').on(table.tenantId),
  }),
);

/**
 * Individual debit/credit legs. A balanced transaction has sum(debits) == sum(credits).
 * `amountMinor` is integer minor units of `currency` and must be >= 0 (sign comes
 * from `direction`, not the amount). The balanced invariant is enforced in C3.
 */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => ledgerTransactions.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => ledgerAccounts.id),
    direction: ledgerEntryDirectionEnum('direction').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    amountNonNegativeCheck: check(
      'ledger_entries_amount_minor_nonneg_check',
      sql`${table.amountMinor} >= 0`,
    ),
    tenantAccountIdx: index('ledger_entries_tenant_account_idx').on(
      table.tenantId,
      table.accountId,
    ),
    transactionIdx: index('ledger_entries_transaction_idx').on(table.transactionId),
  }),
);

/**
 * Append-only refund records — replaces the overwritable `payments.refunded_amount`
 * aggregate. Each row is one gateway refund attempt (Stripe `re_…`).
 */
export const refundRecords = pgTable(
  'refund_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    paymentId: uuid('payment_id').notNull(),
    gatewayRef: text('gateway_ref'),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    status: refundRecordStatusEnum('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    amountPositiveCheck: check(
      'refund_records_amount_minor_positive_check',
      sql`${table.amountMinor} > 0`,
    ),
    tenantPaymentIdx: index('refund_records_tenant_payment_idx').on(
      table.tenantId,
      table.paymentId,
    ),
  }),
);

/**
 * Webhook dedup (R2d). One row per successfully-processed gateway event so a
 * redelivered Stripe `evt_…` is processed exactly once. The composite PK is the
 * dedup key.
 */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    tenantId: uuid('tenant_id').notNull(),
    gatewayName: text('gateway_name').notNull(),
    eventId: text('event_id').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey(table.tenantId, table.gatewayName, table.eventId),
  }),
);

// --- Aggregated schema (collected by the loader) ---------------------------

export const ledgerSchema = {
  ledgerAccounts,
  ledgerTransactions,
  ledgerEntries,
  refundRecords,
  webhookEvents,
};

// --- Inferred types --------------------------------------------------------

export type LedgerAccount = typeof ledgerAccounts.$inferSelect;
export type NewLedgerAccount = typeof ledgerAccounts.$inferInsert;
export type LedgerTransaction = typeof ledgerTransactions.$inferSelect;
export type NewLedgerTransaction = typeof ledgerTransactions.$inferInsert;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type NewLedgerEntry = typeof ledgerEntries.$inferInsert;
export type RefundRecord = typeof refundRecords.$inferSelect;
export type NewRefundRecord = typeof refundRecords.$inferInsert;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;
