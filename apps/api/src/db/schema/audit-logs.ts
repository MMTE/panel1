import { pgTable, uuid, varchar, text, timestamp, jsonb, inet, index } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  
  // Event details
  actionType: varchar('action_type', { length: 100 }).notNull(),
  resourceType: varchar('resource_type', { length: 100 }).notNull(),
  resourceId: varchar('resource_id', { length: 255 }),
  
  // User and tenant context
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  
  // Request context
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  sessionId: varchar('session_id', { length: 255 }),
  
  // Data changes
  oldValues: jsonb('old_values'),
  newValues: jsonb('new_values'),
  
  // Additional metadata
  metadata: jsonb('metadata'),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  // Indexes for efficient querying
  actionTypeIdx: index('audit_logs_action_type_idx').on(table.actionType),
  resourceTypeIdx: index('audit_logs_resource_type_idx').on(table.resourceType),
  resourceIdIdx: index('audit_logs_resource_id_idx').on(table.resourceId),
  userIdIdx: index('audit_logs_user_id_idx').on(table.userId),
  tenantIdIdx: index('audit_logs_tenant_id_idx').on(table.tenantId),
  createdAtIdx: index('audit_logs_created_at_idx').on(table.createdAt),
  
  // Composite indexes for common queries
  resourceIdx: index('audit_logs_resource_idx').on(table.resourceType, table.resourceId),
  userResourceIdx: index('audit_logs_user_resource_idx').on(table.userId, table.resourceType),
  tenantTimeIdx: index('audit_logs_tenant_time_idx').on(table.tenantId, table.createdAt),
}));

// Audit log retention policies
export const auditLogRetentionPolicies = pgTable('audit_log_retention_policies', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  
  // Retention settings
  resourceType: varchar('resource_type', { length: 100 }).notNull(),
  retentionDays: varchar('retention_days', { length: 10 }).notNull().default('2555'), // 7 years default
  archiveAfterDays: varchar('archive_after_days', { length: 10 }).default('365'), // Archive after 1 year
  
  // Compliance settings
  immutable: varchar('immutable', { length: 5 }).notNull().default('true'), // Cannot be deleted
  encryptionRequired: varchar('encryption_required', { length: 5 }).notNull().default('false'),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  tenantResourceIdx: index('audit_retention_tenant_resource_idx').on(table.tenantId, table.resourceType),
}));

// Audit log exports for compliance
export const auditLogExports = pgTable('audit_log_exports', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
  
  // Export parameters
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  resourceTypes: jsonb('resource_types'), // Array of resource types to include
  format: varchar('format', { length: 10 }).notNull().default('json'), // json, csv, pdf
  
  // Export status
  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending, processing, completed, failed
  fileUrl: text('file_url'), // S3 URL or local path
  fileSize: varchar('file_size', { length: 20 }), // File size in bytes
  recordCount: varchar('record_count', { length: 20 }), // Number of records exported
  
  // Security
  encryptionKey: text('encryption_key'), // For encrypted exports
  downloadCount: varchar('download_count', { length: 10 }).notNull().default('0'),
  expiresAt: timestamp('expires_at'), // When download link expires
  
  // Error handling
  errorMessage: text('error_message'),
  
  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
}, (table) => ({
  tenantStatusIdx: index('audit_exports_tenant_status_idx').on(table.tenantId, table.status),
  requestedByIdx: index('audit_exports_requested_by_idx').on(table.requestedBy),
  createdAtIdx: index('audit_exports_created_at_idx').on(table.createdAt),
}));

// Types for TypeScript
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type AuditLogRetentionPolicy = typeof auditLogRetentionPolicies.$inferSelect;
export type NewAuditLogRetentionPolicy = typeof auditLogRetentionPolicies.$inferInsert;
export type AuditLogExport = typeof auditLogExports.$inferSelect;
export type NewAuditLogExport = typeof auditLogExports.$inferInsert; 