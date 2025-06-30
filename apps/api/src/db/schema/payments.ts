import { pgTable, uuid, decimal, text, timestamp, jsonb, pgEnum, integer, varchar } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { invoices } from './invoices';
import { tenants } from './tenants';
import { subscriptions } from './subscriptions';
import { clients } from './clients';

export const paymentStatusEnum = pgEnum('payment_status', [
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
  'CANCELLED',
  'AUTHORIZED',
  'CAPTURED',
  'VOIDED'
]);

export const refundStatusEnum = pgEnum('refund_status', [
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'PENDING_MANUAL'
]);

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  clientId: uuid('client_id').references(() => clients.id),
  invoiceId: uuid('invoice_id').references(() => invoices.id),
  subscriptionId: uuid('subscription_id').references(() => subscriptions.id),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  status: paymentStatusEnum('status').notNull().default('PENDING'),
  gateway: varchar('gateway', { length: 50 }).notNull(),
  gatewayId: varchar('gateway_id', { length: 255 }),
  gatewayPaymentId: varchar('gateway_payment_id', { length: 255 }),
  gatewayResponse: jsonb('gateway_response').$type<Record<string, any>>(),
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  description: text('description'),
  refundedAmount: decimal('refunded_amount', { precision: 10, scale: 2 }),
  refundStatus: refundStatusEnum('refund_status'),
  refundedAt: timestamp('refunded_at'),
  failureReason: text('failure_reason'),
  failureCode: varchar('failure_code', { length: 50 }),
  lastError: text('last_error'),
  retryCount: integer('retry_count').default(0),
  nextRetryAt: timestamp('next_retry_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const paymentAttempts = pgTable('payment_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: uuid('payment_id').references(() => payments.id),
  gatewayName: varchar('gateway_name', { length: 50 }).notNull(),
  attemptNumber: integer('attempt_number').notNull(),
  status: varchar('status', { length: 50 }).notNull(),
  processingTimeMs: integer('processing_time_ms'),
  errorMessage: text('error_message'),
  gatewayResponse: jsonb('gateway_response').$type<Record<string, any>>(),
  createdAt: timestamp('created_at').notNull().defaultNow()
});

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [payments.tenantId],
    references: [tenants.id]
  }),
  client: one(clients, {
    fields: [payments.clientId],
    references: [clients.id]
  }),
  invoice: one(invoices, {
    fields: [payments.invoiceId],
    references: [invoices.id]
  }),
  subscription: one(subscriptions, {
    fields: [payments.subscriptionId],
    references: [subscriptions.id]
  }),
  attempts: many(paymentAttempts)
}));

export const paymentAttemptsRelations = relations(paymentAttempts, ({ one }) => ({
  payment: one(payments, {
    fields: [paymentAttempts.paymentId],
    references: [payments.id]
  })
}));

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;