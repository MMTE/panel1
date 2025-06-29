import { pgTable, uuid, text, boolean, integer, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants } from './tenants';

export const gatewayStatusEnum = pgEnum('gateway_status', ['ACTIVE', 'INACTIVE', 'PENDING_SETUP', 'ERROR']);

export const paymentGatewayConfigs = pgTable('payment_gateway_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  gatewayName: text('gateway_name').notNull(), // stripe, paypal, razorpay, etc.
  displayName: text('display_name').notNull(),
  isActive: boolean('is_active').default(true),
  priority: integer('priority').default(1), // Higher = preferred
  config: jsonb('config'), // Encrypted gateway credentials
  webhookUrl: text('webhook_url'),
  webhookSecret: text('webhook_secret'),
  supportedCurrencies: jsonb('supported_currencies').$type<string[]>().default(['USD']),
  supportedCountries: jsonb('supported_countries').$type<string[]>().default(['US']),
  capabilities: jsonb('capabilities').$type<{
    supportsRecurring: boolean;
    supportsRefunds: boolean;
    supportsPartialRefunds: boolean;
    supportsHolds: boolean;
    supports3DSecure: boolean;
    supportsWallets: string[];
    supportedPaymentMethods: string[];
  }>(),
  status: gatewayStatusEnum('status').default('PENDING_SETUP'),
  lastHealthCheck: timestamp('last_health_check', { withTimezone: true }),
  healthCheckStatus: text('health_check_status'), // 'healthy', 'error', 'warning'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const paymentAttempts = pgTable('payment_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: uuid('payment_id').references(() => payments.id).notNull(),
  gatewayName: text('gateway_name').notNull(),
  attemptNumber: integer('attempt_number').default(1),
  status: text('status').notNull(), // 'pending', 'success', 'failed', 'cancelled'
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  gatewayResponse: jsonb('gateway_response'),
  processingTimeMs: integer('processing_time_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Relations
export const paymentGatewayConfigsRelations = relations(paymentGatewayConfigs, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [paymentGatewayConfigs.tenantId],
    references: [tenants.id],
  }),
  attempts: many(paymentAttempts),
}));

export const paymentAttemptsRelations = relations(paymentAttempts, ({ one }) => ({
  payment: one(payments, {
    fields: [paymentAttempts.paymentId],
    references: [payments.id],
  }),
}));

// Types
export type PaymentGatewayConfig = typeof paymentGatewayConfigs.$inferSelect;
export type NewPaymentGatewayConfig = typeof paymentGatewayConfigs.$inferInsert;
export type PaymentAttempt = typeof paymentAttempts.$inferSelect;
export type NewPaymentAttempt = typeof paymentAttempts.$inferInsert;

// Import payments table (we'll need to add this import in the existing payments.ts)
import { payments } from './payments'; 