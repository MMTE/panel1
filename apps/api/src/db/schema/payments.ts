import { pgTable, uuid, decimal, text, timestamp, jsonb, pgEnum, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { invoices } from './invoices';
import { tenants } from './tenants';

export const paymentStatusEnum = pgEnum('payment_status', ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED']);
export const refundStatusEnum = pgEnum('refund_status', ['pending', 'succeeded', 'failed', 'canceled', 'pending_manual']);

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id').references(() => invoices.id),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  currency: text('currency').default('USD'),
  status: paymentStatusEnum('status').default('PENDING'),
  gateway: text('gateway').notNull(),
  gatewayId: text('gateway_id'),
  gatewayPaymentId: text('gateway_payment_id'), // Store the actual payment intent/charge ID from gateway
  gatewayResponse: jsonb('gateway_response'),
  gatewayData: jsonb('gateway_data'), // Store additional gateway-specific data
  attemptCount: integer('attempt_count').default(0),
  errorMessage: text('error_message'), // Store error details for failed payments
  
  // Refund fields
  refundAmount: decimal('refund_amount', { precision: 10, scale: 2 }),
  refundStatus: refundStatusEnum('refund_status'),
  refundId: text('refund_id'), // Gateway refund ID
  refundReason: text('refund_reason'),
  refundedAt: timestamp('refunded_at', { withTimezone: true }),
  
  tenantId: uuid('tenant_id').references(() => tenants.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const paymentsRelations = relations(payments, ({ one }) => ({
  invoice: one(invoices, {
    fields: [payments.invoiceId],
    references: [invoices.id],
  }),
  tenant: one(tenants, {
    fields: [payments.tenantId],
    references: [tenants.id],
  }),
}));

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;