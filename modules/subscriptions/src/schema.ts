import { pgTable, uuid, timestamp, boolean, pgEnum, text, integer, decimal, jsonb, varchar, index } from 'drizzle-orm/pg-core';

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'ACTIVE', 'INACTIVE', 'CANCELLED', 'PAST_DUE', 'UNPAID',
  'TRIALING', 'PAUSED', 'PENDING_CANCELLATION',
]);

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id'),
  planId: uuid('plan_id'),
  planName: varchar('plan_name', { length: 255 }),
  currency: varchar('currency', { length: 3 }).default('USD'),
  status: subscriptionStatusEnum('status').default('ACTIVE'),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
  nextBillingDate: timestamp('next_billing_date', { withTimezone: true }),
  billingCycleAnchor: timestamp('billing_cycle_anchor', { withTimezone: true }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
  cancellationReason: text('cancellation_reason'),
  trialStart: timestamp('trial_start', { withTimezone: true }),
  trialEnd: timestamp('trial_end', { withTimezone: true }),
  pastDueDate: timestamp('past_due_date', { withTimezone: true }),
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  failedPaymentAttempts: integer('failed_payment_attempts').default(0),
  lastPaymentAttempt: timestamp('last_payment_attempt', { withTimezone: true }),
  quantity: integer('quantity').default(1),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }),
  paymentMethodId: text('payment_method_id'),
  defaultPaymentMethod: jsonb('default_payment_method'),
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  tenantId: uuid('tenant_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  tenantIdx: index('subscriptions_tenant_idx').on(table.tenantId),
  clientIdx: index('subscriptions_client_idx').on(table.clientId),
  statusIdx: index('subscriptions_status_idx').on(table.status),
  planIdx: index('subscriptions_plan_idx').on(table.planId),
  nextBillingIdx: index('subscriptions_next_billing_idx').on(table.nextBillingDate),
}));

export const subscriptionComponents = pgTable('subscription_components', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionId: uuid('subscription_id').notNull(),
  componentId: uuid('component_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  quantity: integer('quantity').default(1),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  provisioningStatus: text('provisioning_status').default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  subscriptionIdx: index('sub_components_subscription_idx').on(table.subscriptionId),
}));

export const subscriptionStateChanges = pgTable('subscription_state_changes', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionId: uuid('subscription_id').notNull(),
  fromStatus: varchar('from_status', { length: 50 }),
  toStatus: varchar('to_status', { length: 50 }),
  reason: varchar('reason', { length: 100 }),
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  userId: uuid('user_id'),
  tenantId: uuid('tenant_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  subscriptionIdx: index('state_changes_subscription_idx').on(table.subscriptionId),
  tenantIdx: index('state_changes_tenant_idx').on(table.tenantId),
}));

export const subscriptionSchema = {
  subscriptions,
  subscriptionComponents,
  subscriptionStateChanges,
};

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type SubscriptionComponent = typeof subscriptionComponents.$inferSelect;
export type NewSubscriptionComponent = typeof subscriptionComponents.$inferInsert;
export type SubscriptionStateChange = typeof subscriptionStateChanges.$inferSelect;
export type NewSubscriptionStateChange = typeof subscriptionStateChanges.$inferInsert;
