import { pgTable, uuid, varchar, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core';

/** Durable outbox rows for @panel1/core EventBus (Kill Bill–style tracking). */
export const eventOutbox = pgTable('event_outbox', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventName: varchar('event_name', { length: 255 }).notNull(),
  payload: jsonb('payload').notNull().$type<unknown>(),
  /** pending → dispatched | dead */
  status: varchar('status', { length: 32 }).notNull().default('pending'),
  attemptCount: integer('attempt_count').notNull().default(0),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  statusIdx: index('event_outbox_status_idx').on(table.status),
}));

export type EventOutboxRow = typeof eventOutbox.$inferSelect;
export type NewEventOutboxRow = typeof eventOutbox.$inferInsert;
