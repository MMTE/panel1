import { pgTable, uuid, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { tenants } from './tenants';
import { subscriptions } from './subscriptions';

export const clientStatusEnum = pgEnum('client_status', ['ACTIVE', 'INACTIVE', 'SUSPENDED']);

export const clients = pgTable('clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  companyName: text('company_name'),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  zipCode: text('zip_code'),
  country: text('country'),
  phone: text('phone'),
  status: clientStatusEnum('status').default('ACTIVE'),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const clientsRelations = relations(clients, ({ one, many }) => ({
  user: one(users, {
    fields: [clients.userId],
    references: [users.id],
  }),
  tenant: one(tenants, {
    fields: [clients.tenantId],
    references: [tenants.id],
  }),
  subscriptions: many(subscriptions),
}));

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;