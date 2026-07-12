/**
 * One-time migration: rename legacy permission `name` values to canonical `{module}.{resource}.{action}`.
 * Run after deploy: `cd apps/api && npx tsx src/scripts/migrate-permissions.ts`
 *
 * `role_permissions` references `permissions.id` — only `name` changes, so role grants stay attached.
 */
import { db } from '../db';
import { permissions } from '../db/schema/roles';
import { eq } from 'drizzle-orm';
import { logger } from '@panel1/core';

const LEGACY_TO_CANONICAL: Record<string, string> = {
  'admin.dashboard.view': 'core.dashboard.view',
  'admin.analytics.view': 'reporting.analytics.view',
  'admin.clients.view': 'clients.clients.view',
  'admin.clients.create': 'clients.clients.create',
  'admin.clients.update': 'clients.clients.edit',
  'admin.clients.delete': 'clients.clients.delete',
  'admin.invoices.view': 'billing.invoices.view',
  'admin.invoices.create': 'billing.invoices.create',
  'admin.invoices.update': 'billing.invoices.edit',
  'admin.invoices.delete': 'billing.invoices.delete',
  'admin.plans.view': 'catalog.plans.view',
  'admin.plans.create': 'catalog.plans.create',
  'admin.plans.update': 'catalog.plans.edit',
  'admin.plans.delete': 'catalog.plans.delete',
  'admin.payment_gateways.view': 'billing.payment_gateways.view',
  'admin.payment_gateways.manage': 'billing.payment_gateways.manage',
  'admin.catalog.view': 'catalog.dashboard.view',
  'admin.catalog.products.manage': 'catalog.products.manage',
  'admin.catalog.components.manage': 'catalog.components.manage',
  'admin.support.view': 'support.dashboard.view',
  'admin.support.tickets.view': 'support.tickets.view',
  'admin.support.tickets.manage': 'support.tickets.manage',
  'admin.roles.view': 'core.roles.view',
  'admin.roles.create': 'core.roles.create',
  'admin.roles.update': 'core.roles.edit',
  'admin.roles.delete': 'core.roles.delete',
  'admin.roles.manage_permissions': 'core.roles.manage_permissions',
  'admin.roles.manage': 'core.roles.manage',
  'admin.plugins.view': 'core.plugins.view',
  'admin.plugins.manage': 'core.plugins.manage',
  'admin.audit_logs.view': 'audit.logs.view',
  'client.dashboard.view': 'clients.portal.view',
  'client.invoices.view': 'billing.invoices.view_own',
  'client.support.tickets.create': 'support.tickets.create',
  'client.support.tickets.view': 'support.tickets.view_own',
  'invoice.read': 'billing.invoices.view',
  'invoice.create': 'billing.invoices.create',
  'invoice.update': 'billing.invoices.edit',
  'invoice.delete': 'billing.invoices.delete',
  'invoice.read_own': 'billing.invoices.view_own',
  'invoice.process_payment': 'billing.invoices.process_payment',
  'client.create': 'clients.clients.create',
  'client.read': 'clients.clients.view',
  'client.update': 'clients.clients.edit',
  'client.delete': 'clients.clients.delete',
  'catalog.create': 'catalog.products.create',
  'catalog.update': 'catalog.products.edit',
  'payment.read': 'billing.payment_gateways.view',
  'payment.create': 'billing.payment_gateways.manage',
  'payment.update': 'billing.payment_gateways.manage',
  'payment.delete': 'billing.payment_gateways.manage',
  'payment.execute': 'billing.payment_gateways.manage',
};

async function migrate() {
  let n = 0;
  for (const [legacy, canonical] of Object.entries(LEGACY_TO_CANONICAL)) {
    const updated = await db
      .update(permissions)
      .set({ name: canonical, updatedAt: new Date() })
      .where(eq(permissions.name, legacy))
      .returning({ id: permissions.id });
    if (updated.length) {
      n += 1;
      logger.info(`Renamed permission ${legacy} -> ${canonical}`);
    }
  }

  logger.info(`migrate-permissions: updated ${n} row(s)`);
}

migrate()
  .then(() => process.exit(0))
  .catch((e) => {
    logger.error(e);
    process.exit(1);
  });
