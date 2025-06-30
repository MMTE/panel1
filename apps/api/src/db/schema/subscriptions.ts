import { pgTable, uuid, timestamp, boolean, pgEnum, text, integer, decimal, jsonb, varchar } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { clients } from './clients';
import { plans } from './plans';
import { tenants } from './tenants';
import { invoices } from './invoices';

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'ACTIVE', 'INACTIVE', 'CANCELLED', 'PAST_DUE', 'UNPAID', 
  'TRIALING', 'PAUSED', 'PENDING_CANCELLATION'
]);

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id').references(() => plans.id),
  planName: varchar('plan_name', { length: 255 }),
  currency: varchar('currency', { length: 3 }).default('USD'),
  status: subscriptionStatusEnum('status').default('ACTIVE'),
  
  // Billing cycle information
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
  nextBillingDate: timestamp('next_billing_date', { withTimezone: true }),
  billingCycleAnchor: timestamp('billing_cycle_anchor', { withTimezone: true }),
  
  // Cancellation handling
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
  cancellationReason: text('cancellation_reason'),
  
  // Trial information
  trialStart: timestamp('trial_start', { withTimezone: true }),
  trialEnd: timestamp('trial_end', { withTimezone: true }),
  
  // Payment failure handling
  pastDueDate: timestamp('past_due_date', { withTimezone: true }),
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  failedPaymentAttempts: integer('failed_payment_attempts').default(0),
  lastPaymentAttempt: timestamp('last_payment_attempt', { withTimezone: true }),
  
  // Pricing and quantity
  quantity: integer('quantity').default(1),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }),
  
  // Payment method information
  paymentMethodId: text('payment_method_id'), // Stored payment method ID from gateway
  defaultPaymentMethod: jsonb('default_payment_method'), // Store payment method details
  
  // Metadata
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  
  tenantId: uuid('tenant_id').references(() => tenants.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  client: one(clients, {
    fields: [subscriptions.clientId],
    references: [clients.id],
  }),
  plan: one(plans, {
    fields: [subscriptions.planId],
    references: [plans.id],
  }),
  tenant: one(tenants, {
    fields: [subscriptions.tenantId],
    references: [tenants.id],
  }),
  invoices: many(invoices),
}));

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;