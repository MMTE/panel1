import { pgTable, uuid, text, timestamp, jsonb, pgEnum, boolean, varchar } from 'drizzle-orm/pg-core';
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

// `paymentAttempts` table, `paymentAttemptsRelations`, and `PaymentAttempt`/
// `NewPaymentAttempt` types live in ./payments (canonical home — an attempt
// belongs to a payment, and the payments-side `many(paymentAttempts)` relation
// is defined there). They were previously duplicated here, which caused
// `export *` conflicts in the schema barrel (TS2308).

// Relations
export const paymentGatewayConfigsRelations = relations(paymentGatewayConfigs, ({ one }) => ({
  tenant: one(tenants, {
    fields: [paymentGatewayConfigs.tenantId],
    references: [tenants.id],
  }),
}));

// Types
export type PaymentGatewayConfig = typeof paymentGatewayConfigs.$inferSelect;
export type NewPaymentGatewayConfig = typeof paymentGatewayConfigs.$inferInsert;