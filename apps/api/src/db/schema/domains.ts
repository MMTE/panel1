import { pgTable, uuid, timestamp, boolean, pgEnum, text, integer, decimal, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { subscriptions } from './subscriptions';
import { tenants } from './tenants';
import { clients } from './clients';

// Domain status enumeration
export const domainStatusEnum = pgEnum('domain_status', [
  'active', 'expired', 'pending_transfer', 'pending_renewal', 'suspended', 'cancelled'
]);

// Domain operation types
export const domainOperationEnum = pgEnum('domain_operation', [
  'register', 'renew', 'transfer', 'update_nameservers', 'update_contacts', 'enable_privacy', 'disable_privacy'
]);

// DNS record types
export const dnsRecordTypeEnum = pgEnum('dns_record_type', [
  'A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'PTR', 'SRV', 'CAA'
]);

// Domain registrations table
export const domains = pgTable('domains', {
  id: uuid('id').primaryKey().defaultRandom(),
  domainName: text('domain_name').notNull().unique(),
  
  // Ownership
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
  subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'set null' }),
  
  // Registration details
  registrar: text('registrar').notNull(), // Which registrar API was used
  registrarDomainId: text('registrar_domain_id'), // ID at the registrar
  
  // Dates
  registeredAt: timestamp('registered_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  autoRenew: boolean('auto_renew').default(true),
  renewalPeriod: integer('renewal_period').default(1), // Years
  
  // Status
  status: domainStatusEnum('status').default('active'),
  
  // Nameservers
  nameservers: jsonb('nameservers').$type<string[]>().default([]),
  
  // Domain contacts (WHOIS)
  registrantContact: jsonb('registrant_contact').$type<{
    firstName: string;
    lastName: string;
    organization?: string;
    email: string;
    phone: string;
    address: {
      line1: string;
      line2?: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    };
  }>(),
  
  adminContact: jsonb('admin_contact').$type<{
    firstName: string;
    lastName: string;
    organization?: string;
    email: string;
    phone: string;
    address: {
      line1: string;
      line2?: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    };
  }>(),
  
  techContact: jsonb('tech_contact').$type<{
    firstName: string;
    lastName: string;
    organization?: string;
    email: string;
    phone: string;
    address: {
      line1: string;
      line2?: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    };
  }>(),
  
  billingContact: jsonb('billing_contact').$type<{
    firstName: string;
    lastName: string;
    organization?: string;
    email: string;
    phone: string;
    address: {
      line1: string;
      line2?: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    };
  }>(),
  
  // Privacy protection
  privacyEnabled: boolean('privacy_enabled').default(false),
  
  // Authentication/Transfer
  authCode: text('auth_code'), // EPP code for transfers
  transferLock: boolean('transfer_lock').default(true),
  
  // Cost tracking
  registrationCost: decimal('registration_cost', { precision: 10, scale: 2 }),
  renewalCost: decimal('renewal_cost', { precision: 10, scale: 2 }),
  
  // Configuration
  config: jsonb('config').$type<Record<string, any>>(),
  
  // Metadata
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  
  tenantId: uuid('tenant_id').references(() => tenants.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// DNS zones table
export const dnsZones = pgTable('dns_zones', {
  id: uuid('id').primaryKey().defaultRandom(),
  domainId: uuid('domain_id').references(() => domains.id, { onDelete: 'cascade' }),
  
  // Zone details
  zoneName: text('zone_name').notNull(), // Usually same as domain name
  soaRecord: jsonb('soa_record').$type<{
    primaryNameserver: string;
    email: string;
    serial: number;
    refresh: number;
    retry: number;
    expire: number;
    ttl: number;
  }>(),
  
  // Status
  isActive: boolean('is_active').default(true),
  
  tenantId: uuid('tenant_id').references(() => tenants.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// DNS records table
export const dnsRecords = pgTable('dns_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  zoneId: uuid('zone_id').references(() => dnsZones.id, { onDelete: 'cascade' }),
  
  // Record details
  name: text('name').notNull(), // Record name (e.g., 'www', '@', 'mail')
  type: dnsRecordTypeEnum('type').notNull(),
  value: text('value').notNull(), // Record value
  ttl: integer('ttl').default(3600), // Time to live in seconds
  priority: integer('priority'), // For MX, SRV records
  
  // Status
  isActive: boolean('is_active').default(true),
  
  tenantId: uuid('tenant_id').references(() => tenants.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Domain operations log
export const domainOperations = pgTable('domain_operations', {
  id: uuid('id').primaryKey().defaultRandom(),
  domainId: uuid('domain_id').references(() => domains.id, { onDelete: 'cascade' }),
  
  // Operation details
  operation: domainOperationEnum('operation').notNull(),
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

// Relations
export const domainsRelations = relations(domains, ({ one, many }) => ({
  client: one(clients, {
    fields: [domains.clientId],
    references: [clients.id],
  }),
  subscription: one(subscriptions, {
    fields: [domains.subscriptionId],
    references: [subscriptions.id],
  }),
  tenant: one(tenants, {
    fields: [domains.tenantId],
    references: [tenants.id],
  }),
  dnsZones: many(dnsZones),
  operations: many(domainOperations),
}));

export const dnsZonesRelations = relations(dnsZones, ({ one, many }) => ({
  domain: one(domains, {
    fields: [dnsZones.domainId],
    references: [domains.id],
  }),
  tenant: one(tenants, {
    fields: [dnsZones.tenantId],
    references: [tenants.id],
  }),
  records: many(dnsRecords),
}));

export const dnsRecordsRelations = relations(dnsRecords, ({ one }) => ({
  zone: one(dnsZones, {
    fields: [dnsRecords.zoneId],
    references: [dnsZones.id],
  }),
  tenant: one(tenants, {
    fields: [dnsRecords.tenantId],
    references: [tenants.id],
  }),
}));

export const domainOperationsRelations = relations(domainOperations, ({ one }) => ({
  domain: one(domains, {
    fields: [domainOperations.domainId],
    references: [domains.id],
  }),
  tenant: one(tenants, {
    fields: [domainOperations.tenantId],
    references: [tenants.id],
  }),
}));

// Type exports
export type Domain = typeof domains.$inferSelect;
export type NewDomain = typeof domains.$inferInsert;
export type DnsZone = typeof dnsZones.$inferSelect;
export type NewDnsZone = typeof dnsZones.$inferInsert;
export type DnsRecord = typeof dnsRecords.$inferSelect;
export type NewDnsRecord = typeof dnsRecords.$inferInsert;
export type DomainOperation = typeof domainOperations.$inferSelect;
export type NewDomainOperation = typeof domainOperations.$inferInsert; 