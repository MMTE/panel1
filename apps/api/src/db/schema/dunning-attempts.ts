import { pgTable, uuid, varchar, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { subscriptions } from './subscriptions';
import { tenants } from './tenants';

export const dunningAttempts = pgTable('dunning_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionId: uuid('subscription_id').references(() => subscriptions.id).notNull(),
  campaignType: varchar('campaign_type', { length: 50 }).notNull(), // 'email_reminder', 'grace_period', 'suspension'
  attemptNumber: integer('attempt_number').notNull(),
  status: varchar('status', { length: 50 }).notNull(), // 'pending', 'sent', 'delivered', 'failed', 'completed'
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  errorMessage: text('error_message'),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const dunningAttemptsRelations = relations(dunningAttempts, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [dunningAttempts.subscriptionId],
    references: [subscriptions.id],
  }),
  tenant: one(tenants, {
    fields: [dunningAttempts.tenantId],
    references: [tenants.id],
  }),
}));

export type DunningAttempt = typeof dunningAttempts.$inferSelect;
export type NewDunningAttempt = typeof dunningAttempts.$inferInsert; 