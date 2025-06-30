import { pgTable, uuid, text, timestamp, jsonb, pgEnum, boolean, varchar, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants } from './tenants';

export const gatewayStatusEnum = pgEnum('gateway_status', [
  'ACTIVE',
  'INACTIVE',
  'PENDING_SETUP',
  'ERROR',
  'TESTING',
  'MAINTENANCE'
]);

export const paymentGatewayConfigs = pgTable('payment_gateway_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  gatewayName: varchar('gateway_name', { length: 50 }).notNull(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  status: gatewayStatusEnum('status').default('PENDING_SETUP'),
  isActive: boolean('is_active').default(false),
  isDefault: boolean('is_default').default(false),
  
  // Configuration
  config: jsonb('config').$type<Record<string, any>>().notNull(),
  publicConfig: jsonb('public_config').$type<Record<string, any>>(),
  
  // Features and capabilities
  supportedCurrencies: jsonb('supported_currencies').$type<string[]>(),
  supportedPaymentMethods: jsonb('supported_payment_methods').$type<string[]>(),
  features: jsonb('features').$type<string[]>(),
  
  // Integration settings
  webhookUrl: varchar('webhook_url', { length: 255 }),
  webhookSecret: varchar('webhook_secret', { length: 255 }),
  apiEndpoint: varchar('api_endpoint', { length: 255 }),
  
  // Health monitoring
  lastHealthCheck: timestamp('last_health_check', { withTimezone: true }),
  healthCheckStatus: varchar('health_check_status', { length: 50 }),
  errorMessage: text('error_message'),
  
  // Metadata
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  
  // Tenant and timestamps
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
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
export const paymentGatewayConfigsRelations = relations(paymentGatewayConfigs, ({ one }) => ({
  tenant: one(tenants, {
    fields: [paymentGatewayConfigs.tenantId],
    references: [tenants.id],
  }),
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