// Export all schemas
export * from './users';
export * from './tenants';
export * from './clients';
export * from './roles';
export * from './plans';
export * from './subscriptions';
export * from './invoices';
export * from './invoice-items';
export * from './invoice-counters';
export * from './payments';
export * from './payment-gateways';
export * from './scheduled-jobs';
export * from './dunning-attempts';
export * from './subscription-state-changes';
export * from './provisioning';
export * from './support-tickets';
export * from './domains';
export * from './ssl-certificates';
export * from './audit-logs';
export * from './catalog';
export * from './subscription-components';
export * from './componentProviders';
export * from './plugins';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './catalog';
import * as clientSchema from './clients';
import * as invoiceSchema from './invoices';
import * as paymentSchema from './payments';
import * as planSchema from './plans';
import * as provisioningSchema from './provisioning';
import * as roleSchema from './roles';
import * as subscriptionSchema from './subscriptions';
import * as supportSchema from './support-tickets';
import * as tenantSchema from './tenants';
import * as userSchema from './users';

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/panel1';

const client = postgres(connectionString, { max: 1 });
export const db = drizzle(client, {
  schema: {
    ...schema,
    ...clientSchema,
    ...invoiceSchema,
    ...paymentSchema,
    ...planSchema,
    ...provisioningSchema,
    ...roleSchema,
    ...subscriptionSchema,
    ...supportSchema,
    ...tenantSchema,
    ...userSchema,
  },
  logger: false,
  mode: 'default',
});