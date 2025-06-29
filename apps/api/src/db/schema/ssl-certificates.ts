import { pgTable, uuid, timestamp, boolean, pgEnum, text, integer, decimal, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { domains } from './domains';
import { serviceInstances } from './provisioning';
import { tenants } from './tenants';
import { clients } from './clients';

// SSL certificate types
export const sslCertificateTypeEnum = pgEnum('ssl_certificate_type', [
  'domain_validated', 'organization_validated', 'extended_validation', 'wildcard', 'multi_domain'
]);

// SSL certificate status
export const sslCertificateStatusEnum = pgEnum('ssl_certificate_status', [
  'pending', 'active', 'expired', 'revoked', 'cancelled', 'validation_failed'
]);

// SSL certificate providers
export const sslProviderEnum = pgEnum('ssl_provider', [
  'letsencrypt', 'sectigo', 'digicert', 'globalsign', 'godaddy', 'namecheap', 'custom'
]);

// SSL certificate operations
export const sslOperationEnum = pgEnum('ssl_operation', [
  'issue', 'renew', 'revoke', 'install', 'validate', 'reissue'
]);

// SSL certificates table
export const sslCertificates = pgTable('ssl_certificates', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Certificate details
  certificateName: text('certificate_name').notNull(),
  type: sslCertificateTypeEnum('type').notNull(),
  provider: sslProviderEnum('provider').notNull(),
  
  // Domain associations
  primaryDomain: text('primary_domain').notNull(),
  domains: jsonb('domains').$type<string[]>().default([]), // All domains covered by cert
  wildcardDomains: jsonb('wildcard_domains').$type<string[]>().default([]),
  
  // Ownership
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
  domainId: uuid('domain_id').references(() => domains.id, { onDelete: 'set null' }),
  serviceInstanceId: uuid('service_instance_id').references(() => serviceInstances.id, { onDelete: 'set null' }),
  
  // Certificate data
  certificate: text('certificate'), // PEM encoded certificate
  privateKey: text('private_key'), // Encrypted private key
  certificateChain: text('certificate_chain'), // Intermediate certificates
  csr: text('csr'), // Certificate signing request
  
  // Provider-specific data
  providerCertificateId: text('provider_certificate_id'), // ID at the provider
  providerOrderId: text('provider_order_id'), // Order ID at the provider
  
  // Validation details
  validationMethod: text('validation_method'), // 'dns', 'http', 'email'
  validationData: jsonb('validation_data').$type<Record<string, any>>(), // Validation records/files
  
  // Dates
  issuedAt: timestamp('issued_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  autoRenew: boolean('auto_renew').default(true),
  renewalBuffer: integer('renewal_buffer').default(30), // Days before expiry to renew
  
  // Status
  status: sslCertificateStatusEnum('status').default('pending'),
  
  // Installation tracking
  installations: jsonb('installations').$type<Array<{
    serviceInstanceId: string;
    installedAt: string;
    status: 'installed' | 'failed' | 'pending';
    errorMessage?: string;
  }>>().default([]),
  
  // Cost tracking
  cost: decimal('cost', { precision: 10, scale: 2 }),
  renewalCost: decimal('renewal_cost', { precision: 10, scale: 2 }),
  
  // Configuration
  config: jsonb('config').$type<Record<string, any>>(),
  
  // Metadata
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  
  tenantId: uuid('tenant_id').references(() => tenants.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// SSL certificate operations log
export const sslCertificateOperations = pgTable('ssl_certificate_operations', {
  id: uuid('id').primaryKey().defaultRandom(),
  certificateId: uuid('certificate_id').references(() => sslCertificates.id, { onDelete: 'cascade' }),
  
  // Operation details
  operation: sslOperationEnum('operation').notNull(),
  status: text('status').default('pending'), // 'pending', 'completed', 'failed'
  
  // Request/Response data
  requestData: jsonb('request_data').$type<Record<string, any>>(),
  responseData: jsonb('response_data').$type<Record<string, any>>(),
  
  // Error handling
  errorMessage: text('error_message'),
  errorDetails: jsonb('error_details').$type<Record<string, any>>(),
  
  // Timing
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  
  tenantId: uuid('tenant_id').references(() => tenants.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// SSL certificate validation records
export const sslValidationRecords = pgTable('ssl_validation_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  certificateId: uuid('certificate_id').references(() => sslCertificates.id, { onDelete: 'cascade' }),
  
  // Validation details
  domain: text('domain').notNull(),
  method: text('method').notNull(), // 'dns', 'http', 'email'
  
  // DNS validation
  recordName: text('record_name'), // DNS record name
  recordValue: text('record_value'), // DNS record value
  recordType: text('record_type'), // Usually 'TXT' or 'CNAME'
  
  // HTTP validation
  httpPath: text('http_path'), // HTTP validation file path
  httpContent: text('http_content'), // HTTP validation file content
  
  // Email validation
  validationEmail: text('validation_email'), // Email used for validation
  
  // Status
  isValidated: boolean('is_validated').default(false),
  validatedAt: timestamp('validated_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  
  // Metadata
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  
  tenantId: uuid('tenant_id').references(() => tenants.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Relations
export const sslCertificatesRelations = relations(sslCertificates, ({ one, many }) => ({
  client: one(clients, {
    fields: [sslCertificates.clientId],
    references: [clients.id],
  }),
  domain: one(domains, {
    fields: [sslCertificates.domainId],
    references: [domains.id],
  }),
  serviceInstance: one(serviceInstances, {
    fields: [sslCertificates.serviceInstanceId],
    references: [serviceInstances.id],
  }),
  tenant: one(tenants, {
    fields: [sslCertificates.tenantId],
    references: [tenants.id],
  }),
  operations: many(sslCertificateOperations),
  validationRecords: many(sslValidationRecords),
}));

export const sslCertificateOperationsRelations = relations(sslCertificateOperations, ({ one }) => ({
  certificate: one(sslCertificates, {
    fields: [sslCertificateOperations.certificateId],
    references: [sslCertificates.id],
  }),
  tenant: one(tenants, {
    fields: [sslCertificateOperations.tenantId],
    references: [tenants.id],
  }),
}));

export const sslValidationRecordsRelations = relations(sslValidationRecords, ({ one }) => ({
  certificate: one(sslCertificates, {
    fields: [sslValidationRecords.certificateId],
    references: [sslCertificates.id],
  }),
  tenant: one(tenants, {
    fields: [sslValidationRecords.tenantId],
    references: [tenants.id],
  }),
}));

// Type exports
export type SslCertificate = typeof sslCertificates.$inferSelect;
export type NewSslCertificate = typeof sslCertificates.$inferInsert;
export type SslCertificateOperation = typeof sslCertificateOperations.$inferSelect;
export type NewSslCertificateOperation = typeof sslCertificateOperations.$inferInsert;
export type SslValidationRecord = typeof sslValidationRecords.$inferSelect;
export type NewSslValidationRecord = typeof sslValidationRecords.$inferInsert; 