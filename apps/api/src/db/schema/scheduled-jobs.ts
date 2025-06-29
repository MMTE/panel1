import { pgTable, uuid, varchar, text, timestamp, integer, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants } from './tenants';

export const jobStatusEnum = pgEnum('job_status', ['pending', 'running', 'completed', 'failed', 'cancelled']);

export const scheduledJobs = pgTable('scheduled_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobType: varchar('job_type', { length: 100 }).notNull(),
  queueName: varchar('queue_name', { length: 100 }).notNull(),
  payload: jsonb('payload').notNull().$type<Record<string, any>>(),
  status: varchar('status', { length: 50 }).default('pending'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }).defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
  errorMessage: text('error_message'),
  attemptNumber: integer('attempt_number').default(1),
  maxAttempts: integer('max_attempts').default(3),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const scheduledJobsRelations = relations(scheduledJobs, ({ one }) => ({
  tenant: one(tenants, {
    fields: [scheduledJobs.tenantId],
    references: [tenants.id],
  }),
}));

export type ScheduledJob = typeof scheduledJobs.$inferSelect;
export type NewScheduledJob = typeof scheduledJobs.$inferInsert; 