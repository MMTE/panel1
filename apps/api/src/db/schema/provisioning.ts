import { pgTable, uuid, timestamp, boolean, pgEnum, text, integer, decimal, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { subscriptions } from './subscriptions';
import { tenants } from './tenants';

// Provisioning provider types
export const providerTypeEnum = pgEnum('provider_type', [
  'cpanel', 'plesk', 'docker', 'kubernetes', 'custom', 'whm', 'directadmin'
]);

// Provisioning task status
export const provisioningStatusEnum = pgEnum('provisioning_status', [
  'pending', 'in_progress', 'completed', 'failed', 'cancelled', 'rollback'
]);

// Provisioning operation types
export const operationTypeEnum = pgEnum('operation_type', [
  'provision', 'suspend', 'unsuspend', 'terminate', 'modify', 'reinstall', 'backup', 'restore'
]);

// Provisioning providers table
export const provisioningProviders = pgTable('provisioning_providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(), // e.g., "Primary cPanel Server"
  type: providerTypeEnum('type').notNull(),
  hostname: text('hostname').notNull(), // Server hostname/IP
  port: integer('port').default(2087), // Default WHM port
  
  // Authentication
  username: text('username'),
  apiKey: text('api_key'), // Encrypted API key
  apiSecret: text('api_secret'), // Encrypted API secret
  
  // SSL/Security
  useSSL: boolean('use_ssl').default(true),
  verifySSL: boolean('verify_ssl').default(true),
  
  // Configuration
  config: jsonb('config').$type<Record<string, any>>(), // Provider-specific config
  limits: jsonb('limits').$type<{
    maxAccounts?: number;
    diskQuota?: number;
    bandwidthQuota?: number;
    [key: string]: any;
  }>(),
  
  // Status
  isActive: boolean('is_active').default(true),
  lastHealthCheck: timestamp('last_health_check', { withTimezone: true }),
  healthStatus: text('health_status'), // 'healthy', 'warning', 'error'
  
  // Metadata
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  
  tenantId: uuid('tenant_id').references(() => tenants.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Service instances - represents provisioned services
export const serviceInstances = pgTable('service_instances', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'cascade' }),
  providerId: uuid('provider_id').references(() => provisioningProviders.id),
  
  // Service details
  serviceName: text('service_name').notNull(), // Domain name or service identifier
  serviceType: text('service_type').notNull(), // 'hosting', 'vps', 'dedicated', etc.
  
  // Remote service details
  remoteId: text('remote_id'), // ID on the remote provider (e.g., cPanel username)
  remoteData: jsonb('remote_data').$type<Record<string, any>>(), // Provider-specific data
  
  // Access details
  controlPanelUrl: text('control_panel_url'),
  username: text('username'),
  password: text('password'), // Encrypted password
  
  // Resource allocation
  diskQuota: integer('disk_quota'), // MB
  bandwidthQuota: integer('bandwidth_quota'), // MB
  emailAccounts: integer('email_accounts'),
  databases: integer('databases'),
  subdomains: integer('subdomains'),
  
  // Status
  status: text('status').default('pending'), // 'active', 'suspended', 'terminated', 'pending'
  lastSync: timestamp('last_sync', { withTimezone: true }),
  
  // Metadata
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  
  tenantId: uuid('tenant_id').references(() => tenants.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Provisioning tasks - tracks all provisioning operations
export const provisioningTasks = pgTable('provisioning_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceInstanceId: uuid('service_instance_id').references(() => serviceInstances.id),
  providerId: uuid('provider_id').references(() => provisioningProviders.id),
  
  // Task details
  operation: operationTypeEnum('operation').notNull(),
  status: provisioningStatusEnum('status').default('pending'),
  
  // Request/Response data
  requestData: jsonb('request_data').$type<Record<string, any>>(),
  responseData: jsonb('response_data').$type<Record<string, any>>(),
  
  // Execution details
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  attemptNumber: integer('attempt_number').default(1),
  maxAttempts: integer('max_attempts').default(3),
  
  // Error handling
  errorMessage: text('error_message'),
  errorDetails: jsonb('error_details').$type<Record<string, any>>(),
  
  // Job reference
  jobId: text('job_id'), // BullMQ job ID
  
  tenantId: uuid('tenant_id').references(() => tenants.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Relations
export const provisioningProvidersRelations = relations(provisioningProviders, ({ many, one }) => ({
  serviceInstances: many(serviceInstances),
  provisioningTasks: many(provisioningTasks),
  tenant: one(tenants, {
    fields: [provisioningProviders.tenantId],
    references: [tenants.id],
  }),
}));

export const serviceInstancesRelations = relations(serviceInstances, ({ one, many }) => ({
  subscription: one(subscriptions, {
    fields: [serviceInstances.subscriptionId],
    references: [subscriptions.id],
  }),
  provider: one(provisioningProviders, {
    fields: [serviceInstances.providerId],
    references: [provisioningProviders.id],
  }),
  provisioningTasks: many(provisioningTasks),
  tenant: one(tenants, {
    fields: [serviceInstances.tenantId],
    references: [tenants.id],
  }),
}));

export const provisioningTasksRelations = relations(provisioningTasks, ({ one }) => ({
  serviceInstance: one(serviceInstances, {
    fields: [provisioningTasks.serviceInstanceId],
    references: [serviceInstances.id],
  }),
  provider: one(provisioningProviders, {
    fields: [provisioningTasks.providerId],
    references: [provisioningProviders.id],
  }),
  tenant: one(tenants, {
    fields: [provisioningTasks.tenantId],
    references: [tenants.id],
  }),
}));

// Type exports
export type ProvisioningProvider = typeof provisioningProviders.$inferSelect;
export type NewProvisioningProvider = typeof provisioningProviders.$inferInsert;
export type ServiceInstance = typeof serviceInstances.$inferSelect;
export type NewServiceInstance = typeof serviceInstances.$inferInsert;
export type ProvisioningTask = typeof provisioningTasks.$inferSelect;
export type NewProvisioningTask = typeof provisioningTasks.$inferInsert; 