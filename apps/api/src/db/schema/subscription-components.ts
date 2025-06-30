import { pgTable, uuid, text, decimal, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { subscriptions } from './subscriptions';

export const subscriptionComponents = pgTable('subscription_components', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'cascade' }).notNull(),
  componentId: uuid('component_id').notNull(), // References the component definition from catalog
  name: text('name').notNull(),
  description: text('description'),
  quantity: integer('quantity').default(1),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  provisioningStatus: text('provisioning_status').default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const subscriptionComponentsRelations = relations(subscriptionComponents, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [subscriptionComponents.subscriptionId],
    references: [subscriptions.id],
  }),
}));

export type SubscriptionComponent = typeof subscriptionComponents.$inferSelect;
export type NewSubscriptionComponent = typeof subscriptionComponents.$inferInsert; 