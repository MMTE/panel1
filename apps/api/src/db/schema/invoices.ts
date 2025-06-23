import { pgTable, uuid, text, decimal, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { clients } from './clients';
import { users } from './users';
import { subscriptions } from './subscriptions';
import { tenants } from './tenants';
import { invoiceItems } from './invoice-items';
import { payments } from './payments';

export const invoiceStatusEnum = pgEnum('invoice_status', ['DRAFT', 'PENDING', 'PAID', 'OVERDUE', 'CANCELLED']);

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id').references(() => clients.id),
  userId: uuid('user_id').references(() => users.id),
  subscriptionId: uuid('subscription_id').references(() => subscriptions.id),
  invoiceNumber: text('invoice_number').notNull().unique(),
  status: invoiceStatusEnum('status').default('PENDING'),
  subtotal: decimal('subtotal', { precision: 10, scale: 2 }).notNull(),
  tax: decimal('tax', { precision: 10, scale: 2 }).default('0'),
  total: decimal('total', { precision: 10, scale: 2 }).notNull(),
  currency: text('currency').default('USD'),
  dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  invoiceType: text('invoice_type').default('regular'),
  parentInvoiceId: uuid('parent_invoice_id'),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  client: one(clients, {
    fields: [invoices.clientId],
    references: [clients.id],
  }),
  user: one(users, {
    fields: [invoices.userId],
    references: [users.id],
  }),
  subscription: one(subscriptions, {
    fields: [invoices.subscriptionId],
    references: [subscriptions.id],
  }),
  tenant: one(tenants, {
    fields: [invoices.tenantId],
    references: [tenants.id],
  }),
  items: many(invoiceItems),
  payments: many(payments),
}));

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;