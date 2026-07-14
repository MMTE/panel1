import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, pgEnum, index } from 'drizzle-orm/pg-core';

export const providerTypeEnum = pgEnum('provider_type', [
  'cpanel', 'plesk', 'docker', 'kubernetes', 'custom', 'whm', 'directadmin',
]);

export const provisioningStatusEnum = pgEnum('provisioning_status', [
  'pending', 'in_progress', 'completed', 'failed', 'cancelled', 'rollback',
]);

export const operationTypeEnum = pgEnum('operation_type', [
  'provision', 'suspend', 'unsuspend', 'terminate', 'modify', 'reinstall', 'backup', 'restore',
]);

export const provisioningProviders = pgTable('provisioning_providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: providerTypeEnum('type').notNull(),
  hostname: text('hostname').notNull(),
  port: integer('port').default(2087),
  username: text('username'),
  apiKey: text('api_key'),
  apiSecret: text('api_secret'),
  useSSL: boolean('use_ssl').default(true),
  verifySSL: boolean('verify_ssl').default(true),
  config: jsonb('config').$type<Record<string, any>>(),
  limits: jsonb('limits').$type<{
    maxAccounts?: number;
    diskQuota?: number;
    bandwidthQuota?: number;
    [key: string]: any;
  }>(),
  isActive: boolean('is_active').default(true),
  lastHealthCheck: timestamp('last_health_check', { withTimezone: true }),
  healthStatus: text('health_status'),
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  tenantId: uuid('tenant_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  tenantIdx: index('prov_providers_tenant_idx').on(table.tenantId),
  typeIdx: index('prov_providers_type_idx').on(table.type),
  activeIdx: index('prov_providers_active_idx').on(table.isActive),
}));

export const serviceInstances = pgTable('service_instances', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionId: uuid('subscription_id'),
  providerId: uuid('provider_id'),
  serviceName: text('service_name').notNull(),
  serviceType: text('service_type').notNull(),
  remoteId: text('remote_id'),
  remoteData: jsonb('remote_data').$type<Record<string, any>>(),
  controlPanelUrl: text('control_panel_url'),
  username: text('username'),
  password: text('password'),
  diskQuota: integer('disk_quota'),
  bandwidthQuota: integer('bandwidth_quota'),
  emailAccounts: integer('email_accounts'),
  databases: integer('databases'),
  subdomains: integer('subdomains'),
  status: text('status').default('pending'),
  lastSync: timestamp('last_sync', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  tenantId: uuid('tenant_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  tenantIdx: index('svc_instances_tenant_idx').on(table.tenantId),
  subscriptionIdx: index('svc_instances_subscription_idx').on(table.subscriptionId),
  providerIdx: index('svc_instances_provider_idx').on(table.providerId),
  statusIdx: index('svc_instances_status_idx').on(table.status),
}));

export const provisioningTasks = pgTable('provisioning_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  serviceInstanceId: uuid('service_instance_id'),
  providerId: uuid('provider_id'),
  operation: operationTypeEnum('operation').notNull(),
  status: provisioningStatusEnum('status').default('pending'),
  requestData: jsonb('request_data').$type<Record<string, any>>(),
  responseData: jsonb('response_data').$type<Record<string, any>>(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  attemptNumber: integer('attempt_number').default(1),
  maxAttempts: integer('max_attempts').default(3),
  errorMessage: text('error_message'),
  errorDetails: jsonb('error_details').$type<Record<string, any>>(),
  jobId: text('job_id'),
  tenantId: uuid('tenant_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  tenantIdx: index('prov_tasks_tenant_idx').on(table.tenantId),
  serviceInstanceIdx: index('prov_tasks_service_idx').on(table.serviceInstanceId),
  statusIdx: index('prov_tasks_status_idx').on(table.status),
}));

export const provisioningSchema = {
  provisioningProviders,
  serviceInstances,
  provisioningTasks,
};

export type ProvisioningProvider = typeof provisioningProviders.$inferSelect;
export type NewProvisioningProvider = typeof provisioningProviders.$inferInsert;
export type ServiceInstance = typeof serviceInstances.$inferSelect;
export type NewServiceInstance = typeof serviceInstances.$inferInsert;
export type ProvisioningTask = typeof provisioningTasks.$inferSelect;
export type NewProvisioningTask = typeof provisioningTasks.$inferInsert;
