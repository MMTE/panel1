/**
 * Ledger posting rules — invoice / payment / refund (Phase C / Task C4).
 *
 * These three rules are the business layer over C3's {@link post} invariant:
 * they translate domain events (an invoice was issued, a payment succeeded, a
 * refund was issued) into balanced journal entries. Every rule funnels money
 * through {@link post} (raw-SQL {@link LedgerDb} port) — money values are
 * `bigint` minor units from {@link toMinor}, NEVER floats.
 *
 * ## The bigint-mode:number trap (load-bearing — read this)
 * `ledger_entries.amount_minor` and `refund_records.amount_minor` are declared
 * `bigint(..., { mode: 'number' })` in the schema. Selecting those columns
 * through drizzle would coerce the value to a JS `number`, **silently
 * corrupting amounts > 2^53**. C3 sidesteps this by reading `amount_minor`
 * via raw SQL with an explicit `::text` cast and `BigInt(...)`. **These posting
 * rules never select `amount_minor` through drizzle.** They either (a) write
 * via `post()` (which parameterizes `amountMinor.toString()` and lets Postgres
 * parse it back to bigint), or (b) read aggregates via raw `SUM(...)::text` +
 * `BigInt(...)`. Sums that would exceed 2^53 therefore survive intact.
 *
 * ## periodStart / idempotency
 * One-shot sources (invoice, payment, refund) pass a non-null `periodStart`
 * (the source's `createdAt` date) so re-posting the same source is a no-op —
 * see the {@link post} file header on the nullable-periodStart subtlety. This
 * is what makes webhook / event redelivery safe end-to-end.
 */
import { toMinor } from '@panel1/core';
import { post, accountBalance, type LedgerDb } from './service.js';
import {
  ACCOUNTS_RECEIVABLE,
  STRIPE_CLEARING,
  SALES_REVENUE,
  TAX_PAYABLE,
  REFUNDS,
} from './accounts.js';

// --- Shared domain input shapes (decimal strings → toMinor → bigint) --------

/**
 * A monetary invoice leg expressed as a decimal string (e.g. `'9.99'`). Using
 * strings (not numbers) at the boundary avoids binary-float drift before
 * {@link toMinor} ever sees it.
 */
export interface InvoiceInput {
  id: string;
  tenantId: string;
  currency: string;
  subtotal: string;
  tax: string;
  total: string;
  /** ISO date (`YYYY-MM-DD`) used as the idempotency periodStart. */
  createdAt: string;
}

export interface PaymentInput {
  id: string;
  tenantId: string;
  currency: string;
  /** Decimal-string amount captured by the gateway. */
  amount: string;
  /** ISO date used as the idempotency periodStart. */
  createdAt: string;
}

export interface RefundInput {
  /** The original payment being refunded (carries tenant/currency). */
  payment: PaymentInput;
  /** Refund magnitude in minor units — already bigint, no float path. */
  refundAmountMinor: bigint;
  /** Gateway refund reference (Stripe `re_…`); null is allowed. */
  gatewayRef: string | null;
  /** Gateway-reported status; only `succeeded` posts a ledger entry. */
  status: 'pending' | 'succeeded' | 'failed';
  /** ISO date used as the idempotency periodStart for the refund post. */
  createdAt: string;
}

// --- Errors -----------------------------------------------------------------

/**
 * Thrown by {@link postInvoiceIssued} when `subtotal + tax !== total`. This is
 * an upstream-drift guard: the three-legged invoice entry only balances if the
 * invoice's components sum to its total, so a mismatch means the source-of-truth
 * (the invoice row) is internally inconsistent and must NOT be posted.
 */
export class InvoiceTotalMismatchError extends Error {
  constructor(
    public readonly subtotalMinor: bigint,
    public readonly taxMinor: bigint,
    public readonly totalMinor: bigint,
  ) {
    super(
      `Invoice total mismatch: subtotal(${subtotalMinor.toString()}) + tax(${taxMinor.toString()}) ` +
        `!== total(${totalMinor.toString()}) in minor units. Refusing to post an unbalanced invoice entry.`,
    );
    this.name = 'InvoiceTotalMismatchError';
  }
}

// --- Rule 1: invoice issued -------------------------------------------------

/**
 * Post the journal entry for an issued invoice:
 *
 *   DR accounts_receivable   toMinor(total)
 *   CR sales_revenue          toMinor(subtotal)
 *   CR tax_payable            toMinor(tax)
 *
 * Balanced iff `subtotal + tax === total`; otherwise throws
 * {@link InvoiceTotalMismatchError} BEFORE touching the ledger (so no partial
 * state). Idempotent on `(tenantId, 'invoice', invoice.id, createdAt)` — a
 * redelivered invoice-issued event replays as a no-op.
 *
 * Returns the underlying {@link post} result (`transactionId`, `replayed`).
 */
export async function postInvoiceIssued(
  db: LedgerDb,
  args: { invoice: InvoiceInput },
): Promise<{ transactionId: string; replayed: boolean }> {
  const { invoice } = args;
  const subtotalMinor = toMinor(invoice.subtotal, invoice.currency);
  const taxMinor = toMinor(invoice.tax, invoice.currency);
  const totalMinor = toMinor(invoice.total, invoice.currency);

  if (subtotalMinor + taxMinor !== totalMinor) {
    throw new InvoiceTotalMismatchError(subtotalMinor, taxMinor, totalMinor);
  }

  return post(db, {
    tenantId: invoice.tenantId,
    sourceType: 'invoice',
    sourceId: invoice.id,
    periodStart: invoice.createdAt,
    description: `Invoice ${invoice.id} issued`,
    currency: invoice.currency,
    entries: [
      { accountCode: ACCOUNTS_RECEIVABLE, direction: 'debit', amountMinor: totalMinor },
      { accountCode: SALES_REVENUE, direction: 'credit', amountMinor: subtotalMinor },
      { accountCode: TAX_PAYABLE, direction: 'credit', amountMinor: taxMinor },
    ],
  });
}

// --- Rule 2: payment succeeded ----------------------------------------------

/**
 * Post the journal entry for a succeeded payment:
 *
 *   DR stripe_clearing        toMinor(payment.amount)
 *   CR accounts_receivable   toMinor(payment.amount)
 *
 * Idempotent on `(tenantId, 'payment', payment.id, createdAt)`.
 *
 * Returns `{ covered, transactionId, replayed }` where **`covered`** drives the
 * invoice state machine (replaces the old unconditional `markPaid`):
 * `covered === true` iff the cumulative succeeded payments for this invoice have
 * settled (or exceeded) the invoice total. The caller flips the invoice to
 * `PAID` iff `covered && !replayed` (or just `covered`, depending on policy).
 *
 * `covered` is computed by {@link isInvoiceCovered} — see its docstring for the
 * AR-balance semantics and multi-invoice caveat.
 */
export async function postPaymentSucceeded(
  db: LedgerDb,
  args: { payment: PaymentInput; invoice: InvoiceInput },
): Promise<{ covered: boolean; transactionId: string; replayed: boolean }> {
  const { payment, invoice } = args;
  const amountMinor = toMinor(payment.amount, payment.currency);

  const result = await post(db, {
    tenantId: payment.tenantId,
    sourceType: 'payment',
    sourceId: payment.id,
    periodStart: payment.createdAt,
    description: `Payment ${payment.id} received`,
    currency: payment.currency,
    entries: [
      { accountCode: STRIPE_CLEARING, direction: 'debit', amountMinor },
      { accountCode: ACCOUNTS_RECEIVABLE, direction: 'credit', amountMinor },
    ],
  });

  const covered = await isInvoiceCovered(db, { invoice });
  return { ...result, covered };
}

/**
 * Whether an invoice is fully paid: `cumulative succeeded payments >= invoice.total`.
 *
 * Implemented via the shared `accounts_receivable` balance for this
 * tenant+currency: payments credit AR (reducing what customers owe); an invoice
 * debit increases it. When the invoice's own debit has been fully offset by
 * payment credits, the AR balance attributable to this invoice is `<= 0`.
 *
 * **Multi-invoice caveat:** `accounts_receivable` is shared across all of a
 * tenant's invoices, so this AR-balance signal is exact only in single-invoice
 * flows (which is the M1 reconciliation target). For concurrent multi-invoice
 * coverage the caller (C5) MUST join against its payments table keyed by
 * `invoice_id` — that mapping is intentionally out of scope for the ledger
 * schema (which has no `invoice_id` column on ledger_entries). The function is
 * deterministic and side-effect-free either way; the caller chooses the scope.
 */
export async function isInvoiceCovered(
  db: LedgerDb,
  args: { invoice: InvoiceInput },
): Promise<boolean> {
  const { invoice } = args;
  const totalMinor = toMinor(invoice.total, invoice.currency);
  // AR balance == debits(invoices) - credits(payments/refunds). For this invoice
  // to be covered, the AR balance must be <= 0 (payments have offset the debit).
  // Refunds credit AR too, but a refund only happens AFTER a payment, so it
  // cannot make an unpaid invoice look paid on its own — the payment credit must
  // already have zeroed the debit. We therefore test `arBalance <= 0n`.
  const arBalance = await accountBalance(db, {
    tenantId: invoice.tenantId,
    accountCode: ACCOUNTS_RECEIVABLE,
    currency: invoice.currency,
  });
  return arBalance <= 0n;
}

// --- Rule 3: refund ---------------------------------------------------------

/** The shape returned by {@link postRefund}: the append-only record id + ledger result. */
export interface PostRefundResult {
  /** The `refund_records.id` for the appended row (the source-of-truth refund record). */
  refundRecordId: string;
  /**
   * The ledger post result. `transactionId` is `''` and `replayed` is `false`
   * when no ledger entry was posted (i.e. `status !== 'succeeded'`); otherwise
   * the refund-entry transaction id and replay flag.
   */
  transactionId: string;
  replayed: boolean;
  /** `true` iff a ledger entry was posted (status was `succeeded`). */
  posted: boolean;
}

/**
 * Record a refund attempt and — iff it `succeeded` — post the refund entry:
 *
 *   DR refunds               refundAmountMinor
 *   CR accounts_receivable  refundAmountMinor
 *
 * Two distinct writes, in this order:
 *
 *   1. **Append** a `refund_records` row (the append-only record that replaces
 *      the overwritable `payments.refunded_amount` aggregate). This ALWAYS
 *      happens regardless of status, so a `failed`/`pending` attempt is
 *      preserved for audit. The row is inserted via raw parameterized SQL with
 *      `amount_minor::text` to avoid the bigint-mode:number trap.
 *   2. **Post** the balanced refund entry ONLY when `status === 'succeeded'`.
 *      The post's `sourceId` is the freshly-inserted `refund_records.id`, so a
 *      redelivered refund event for the same record id replays as a no-op.
 *
 * The two writes run inside a single `transaction` so a post failure rolls
 * back the appended row too (atomicity: no refund record without its ledger
 * entry, and vice-versa for succeeded refunds).
 *
 * `amount_minor` is sent to Postgres as a string (the bigint's `.toString()`)
 * and the column parses it — same pattern as {@link post}. **Never** route this
 * through a drizzle insert that would round-trip the value through JS `number`.
 */
export async function postRefund(db: LedgerDb, args: RefundInput): Promise<PostRefundResult> {
  const { payment, refundAmountMinor, gatewayRef, status, createdAt } = args;

  if (refundAmountMinor <= 0n) {
    throw new Error(
      `Refund amount must be positive: got ${refundAmountMinor.toString()} (refund_records has a CHECK (amount_minor > 0)).`,
    );
  }

  return db.transaction(async (tx) => {
    // 1. Append the refund record (always — preserves failed/pending attempts).
    //    amount_minor is parameterized as a string; Postgres casts text->bigint.
    const insertRows = await tx.query<{ id: string }>(
      `INSERT INTO refund_records (tenant_id, payment_id, gateway_ref, amount_minor, currency, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id::text AS id`,
      [
        payment.tenantId,
        payment.id,
        gatewayRef,
        refundAmountMinor.toString(),
        payment.currency,
        status,
      ],
    );
    const refundRecordId = insertRows.rows[0].id;

    // 2. Only succeeded refunds move money.
    if (status !== 'succeeded') {
      return { refundRecordId, transactionId: '', replayed: false, posted: false };
    }

    const result = await post(tx, {
      tenantId: payment.tenantId,
      sourceType: 'refund',
      // sourceId = the refund record id -> a redelivered refund event replays.
      sourceId: refundRecordId,
      periodStart: createdAt,
      description: `Refund ${refundRecordId} for payment ${payment.id}`,
      currency: payment.currency,
      entries: [
        { accountCode: REFUNDS, direction: 'debit', amountMinor: refundAmountMinor },
        { accountCode: ACCOUNTS_RECEIVABLE, direction: 'credit', amountMinor: refundAmountMinor },
      ],
    });

    return {
      refundRecordId,
      transactionId: result.transactionId,
      replayed: result.replayed,
      posted: true,
    };
  });
}

/**
 * Sum of `refund_records.amount_minor` for a payment, counting ONLY `succeeded`
 * rows. The canonical "how much has been refunded against this payment?" figure
 * — derived from the append-only records, NOT from a single gateway call's
 * argument, so a `failed` refund attempt never inflates the total.
 *
 * Raw SQL with `SUM(...)::text` + `BigInt(...)` so totals exceeding 2^53 survive
 * (the bigint-mode:number trap). Returns `0n` when there are no succeeded
 * refund records for the payment.
 */
export async function totalRefunded(db: LedgerDb, args: { paymentId: string }): Promise<bigint> {
  const result = await db.query<{ total: string }>(
    `SELECT COALESCE(SUM(amount_minor), 0)::text AS total
     FROM refund_records
     WHERE payment_id = $1 AND status = 'succeeded'`,
    [args.paymentId],
  );
  return BigInt(result.rows[0].total);
}
