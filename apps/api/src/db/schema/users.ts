import { pgTable, uuid, text, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants } from './tenants.js';
import { clients } from './clients.js';
import { invoices } from './invoices.js';

export const userRoleEnum = pgEnum('user_role', ['ADMIN', 'CLIENT', 'RESELLER']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  authUserId: uuid('auth_user_id'),
  email: text('email').notNull().unique(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  role: userRoleEnum('role').default('CLIENT'),
  isActive: boolean('is_active').default(true),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [users.tenantId],
    references: [tenants.id],
  }),
  clients: many(clients),
  invoices: many(invoices),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;