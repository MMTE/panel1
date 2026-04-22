import { pgTable, uuid, text, integer, decimal, timestamp, pgEnum, jsonb, index, unique } from 'drizzle-orm/pg-core';

export const invoiceStatusEnum = pgEnum('invoice_status', ['DRAFT', 'PENDING', 'PAID', 'OVERDUE', 'CANCELLED']);

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  clientId: uuid('client_id'),
  userId: uuid('user_id'),
  subscriptionId: uuid('subscription_id'),
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
  tenantId: uuid('tenant_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  tenantIdx: index('invoices_tenant_idx').on(table.tenantId),
  clientIdx: index('invoices_client_idx').on(table.clientId),
  statusIdx: index('invoices_status_idx').on(table.status),
  dueDateIdx: index('invoices_due_date_idx').on(table.dueDate),
  subscriptionIdx: index('invoices_subscription_idx').on(table.subscriptionId),
  numberIdx: index('invoices_number_idx').on(table.invoiceNumber),
}));

export const invoiceItems = pgTable('invoice_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  invoiceId: uuid('invoice_id').notNull(),
  description: text('description').notNull(),
  quantity: integer('quantity').default(1),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
  total: decimal('total', { precision: 10, scale: 2 }).notNull(),
}, (table) => ({
  invoiceIdx: index('invoice_items_invoice_idx').on(table.invoiceId),
}));

export const invoiceCounters = pgTable('invoice_counters', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  year: integer('year').notNull(),
  lastNumber: integer('last_number').notNull().default(0),
  prefix: text('prefix').notNull().default('INV'),
  suffix: text('suffix'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueTenantYear: unique().on(table.tenantId, table.year),
}));

export const dunningAttempts = pgTable('dunning_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionId: uuid('subscription_id').notNull(),
  invoiceId: uuid('invoice_id'),
  campaignType: text('campaign_type').notNull(),
  attemptNumber: integer('attempt_number').notNull(),
  status: text('status').notNull(),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  executedAt: timestamp('executed_at', { withTimezone: true }),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  errorMessage: text('error_message'),
  tenantId: uuid('tenant_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  tenantIdx: index('dunning_attempts_tenant_idx').on(table.tenantId),
  subscriptionIdx: index('dunning_attempts_subscription_idx').on(table.subscriptionId),
  invoiceIdx: index('dunning_attempts_invoice_idx').on(table.invoiceId),
  statusIdx: index('dunning_attempts_status_idx').on(table.status),
}));

export const billingSchema = {
  invoices,
  invoiceItems,
  invoiceCounters,
  dunningAttempts,
};

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type NewInvoiceItem = typeof invoiceItems.$inferInsert;
export type InvoiceCounter = typeof invoiceCounters.$inferSelect;
export type DunningAttempt = typeof dunningAttempts.$inferSelect;
