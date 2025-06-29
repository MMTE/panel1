import { pgTable, uuid, varchar, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { subscriptions } from './subscriptions';
import { users } from './users';
import { tenants } from './tenants';

export const subscriptionStateChanges = pgTable('subscription_state_changes', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionId: uuid('subscription_id').references(() => subscriptions.id).notNull(),
  fromStatus: varchar('from_status', { length: 50 }),
  toStatus: varchar('to_status', { length: 50 }),
  reason: varchar('reason', { length: 100 }),
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  userId: uuid('user_id').references(() => users.id),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const subscriptionStateChangesRelations = relations(subscriptionStateChanges, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [subscriptionStateChanges.subscriptionId],
    references: [subscriptions.id],
  }),
  user: one(users, {
    fields: [subscriptionStateChanges.userId],
    references: [users.id],
  }),
  tenant: one(tenants, {
    fields: [subscriptionStateChanges.tenantId],
    references: [tenants.id],
  }),
}));

export type SubscriptionStateChange = typeof subscriptionStateChanges.$inferSelect;
export type NewSubscriptionStateChange = typeof subscriptionStateChanges.$inferInsert; 