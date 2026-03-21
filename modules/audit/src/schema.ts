import { pgTable, uuid, varchar, text, timestamp, jsonb, inet, index } from 'drizzle-orm/pg-core';

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  actionType: varchar('action_type', { length: 100 }).notNull(),
  resourceType: varchar('resource_type', { length: 100 }).notNull(),
  resourceId: varchar('resource_id', { length: 255 }),
  userId: uuid('user_id'),
  tenantId: uuid('tenant_id').notNull(),
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  sessionId: varchar('session_id', { length: 255 }),
  oldValues: jsonb('old_values'),
  newValues: jsonb('new_values'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  actionTypeIdx: index('audit_logs_action_type_idx').on(table.actionType),
  resourceTypeIdx: index('audit_logs_resource_type_idx').on(table.resourceType),
  resourceIdIdx: index('audit_logs_resource_id_idx').on(table.resourceId),
  userIdIdx: index('audit_logs_user_id_idx').on(table.userId),
  tenantIdIdx: index('audit_logs_tenant_id_idx').on(table.tenantId),
  createdAtIdx: index('audit_logs_created_at_idx').on(table.createdAt),
  resourceIdx: index('audit_logs_resource_idx').on(table.resourceType, table.resourceId),
  userResourceIdx: index('audit_logs_user_resource_idx').on(table.userId, table.resourceType),
  tenantTimeIdx: index('audit_logs_tenant_time_idx').on(table.tenantId, table.createdAt),
}));

export const auditLogRetentionPolicies = pgTable('audit_log_retention_policies', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  resourceType: varchar('resource_type', { length: 100 }).notNull(),
  retentionDays: varchar('retention_days', { length: 10 }).notNull().default('2555'),
  archiveAfterDays: varchar('archive_after_days', { length: 10 }).default('365'),
  immutable: varchar('immutable', { length: 5 }).notNull().default('true'),
  encryptionRequired: varchar('encryption_required', { length: 5 }).notNull().default('false'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  tenantResourceIdx: index('audit_retention_tenant_resource_idx').on(table.tenantId, table.resourceType),
}));

export const auditLogExports = pgTable('audit_log_exports', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  requestedBy: uuid('requested_by'),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  resourceTypes: jsonb('resource_types'),
  format: varchar('format', { length: 10 }).notNull().default('json'),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  fileUrl: text('file_url'),
  fileSize: varchar('file_size', { length: 20 }),
  recordCount: varchar('record_count', { length: 20 }),
  encryptionKey: text('encryption_key'),
  downloadCount: varchar('download_count', { length: 10 }).notNull().default('0'),
  expiresAt: timestamp('expires_at'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
}, (table) => ({
  tenantStatusIdx: index('audit_exports_tenant_status_idx').on(table.tenantId, table.status),
  requestedByIdx: index('audit_exports_requested_by_idx').on(table.requestedBy),
  createdAtIdx: index('audit_exports_created_at_idx').on(table.createdAt),
}));

export const auditSchema = {
  auditLogs,
  auditLogRetentionPolicies,
  auditLogExports,
};
