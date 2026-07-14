import { pgTable, uuid, decimal, text, timestamp, jsonb, pgEnum, integer, varchar, boolean, index } from 'drizzle-orm/pg-core';

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
  'VOIDED',
]);

export const refundStatusEnum = pgEnum('refund_status', [
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'PENDING_MANUAL',
]);

export const gatewayStatusEnum = pgEnum('gateway_status', [
  'ACTIVE',
  'INACTIVE',
  'PENDING_SETUP',
  'ERROR',
  'TESTING',
  'MAINTENANCE',
]);

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  clientId: uuid('client_id'),
  invoiceId: uuid('invoice_id'),
  subscriptionId: uuid('subscription_id'),
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
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  tenantIdx: index('payments_tenant_idx').on(table.tenantId),
  clientIdx: index('payments_client_idx').on(table.clientId),
  invoiceIdx: index('payments_invoice_idx').on(table.invoiceId),
  statusIdx: index('payments_status_idx').on(table.status),
  gatewayIdx: index('payments_gateway_idx').on(table.gateway),
  createdAtIdx: index('payments_created_at_idx').on(table.createdAt),
}));

export const paymentAttempts = pgTable('payment_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: uuid('payment_id').notNull(),
  gatewayName: varchar('gateway_name', { length: 50 }).notNull(),
  attemptNumber: integer('attempt_number').default(1),
  status: text('status').notNull(),
  processingTimeMs: integer('processing_time_ms'),
  errorMessage: text('error_message'),
  gatewayResponse: jsonb('gateway_response').$type<Record<string, any>>(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  paymentIdx: index('payment_attempts_payment_idx').on(table.paymentId),
}));

export const paymentGatewayConfigs = pgTable('payment_gateway_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  gatewayName: varchar('gateway_name', { length: 50 }).notNull(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  status: gatewayStatusEnum('status').default('PENDING_SETUP'),
  isActive: boolean('is_active').default(false),
  isDefault: boolean('is_default').default(false),
  config: jsonb('config').$type<Record<string, any>>().notNull(),
  publicConfig: jsonb('public_config').$type<Record<string, any>>(),
  supportedCurrencies: jsonb('supported_currencies').$type<string[]>(),
  supportedPaymentMethods: jsonb('supported_payment_methods').$type<string[]>(),
  features: jsonb('features').$type<string[]>(),
  webhookUrl: varchar('webhook_url', { length: 255 }),
  webhookSecret: varchar('webhook_secret', { length: 255 }),
  apiEndpoint: varchar('api_endpoint', { length: 255 }),
  lastHealthCheck: timestamp('last_health_check', { withTimezone: true }),
  healthCheckStatus: varchar('health_check_status', { length: 50 }),
  errorMessage: text('error_message'),
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  tenantId: uuid('tenant_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  tenantIdx: index('payment_gateway_configs_tenant_idx').on(table.tenantId),
  gatewayNameIdx: index('payment_gateway_configs_gateway_name_idx').on(table.gatewayName),
  statusIdx: index('payment_gateway_configs_status_idx').on(table.status),
}));

export const paymentsSchema = {
  payments,
  paymentAttempts,
  paymentGatewayConfigs,
};

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type PaymentAttempt = typeof paymentAttempts.$inferSelect;
export type NewPaymentAttempt = typeof paymentAttempts.$inferInsert;
export type PaymentGatewayConfig = typeof paymentGatewayConfigs.$inferSelect;
export type NewPaymentGatewayConfig = typeof paymentGatewayConfigs.$inferInsert;
