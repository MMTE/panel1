import { pgTable, uuid, integer, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants } from './tenants';

export const invoiceCounters = pgTable('invoice_counters', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  year: integer('year').notNull(),
  lastNumber: integer('last_number').default(0).notNull(),
  prefix: text('prefix').default('INV').notNull(),
  suffix: text('suffix'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  // Ensure unique counter per tenant per year
  uniqueTenantYear: unique().on(table.tenantId, table.year),
}));

export const invoiceCountersRelations = relations(invoiceCounters, ({ one }) => ({
  tenant: one(tenants, {
    fields: [invoiceCounters.tenantId],
    references: [tenants.id],
  }),
}));

export type InvoiceCounter = typeof invoiceCounters.$inferSelect;
export type NewInvoiceCounter = typeof invoiceCounters.$inferInsert; 