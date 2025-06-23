import { pgTable, uuid, text, decimal, boolean, timestamp, jsonb, integer, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants } from './tenants.js';
import { subscriptions } from './subscriptions.js';

export const billingIntervalEnum = pgEnum('billing_interval', ['MONTHLY', 'YEARLY', 'WEEKLY', 'DAILY']);

export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  currency: text('currency').default('USD'),
  interval: billingIntervalEnum('interval').notNull(),
  isActive: boolean('is_active').default(true),
  features: jsonb('features'),
  trialPeriodDays: integer('trial_period_days').default(0),
  setupFee: decimal('setup_fee', { precision: 10, scale: 2 }).default('0'),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const plansRelations = relations(plans, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [plans.tenantId],
    references: [tenants.id],
  }),
  subscriptions: many(subscriptions),
}));

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;