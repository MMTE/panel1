import { defineModule } from '@panel1/core';
import { z } from 'zod';
import { provisioningSchema } from './schema.js';
import { ProvisioningService } from './service.js';
import { provisioningRoutes } from './routes.js';
import type { IProvisioningService } from './types.js';

export default defineModule({
  name: 'provisioning',
  version: '0.1.0',
  deps: ['subscriptions'],

  schema: provisioningSchema,

  config: z.object({
    defaultProvisioningType: z.string().default('cpanel'),
    autoProvisionOnActivation: z.boolean().default(true),
    healthCheckIntervalHours: z.number().default(6),
  }),

  permissions: [
    'provisioning.instances.view',
    'provisioning.instances.manage',
    'provisioning.providers.view',
    'provisioning.providers.manage',
  ],

  emits: [
    'provisioning.started',
    'provisioning.completed',
    'provisioning.failed',
    'provisioning.suspended',
    'provisioning.unsuspended',
    'provisioning.terminated',
  ],

  setup(ctx) {
    const provisioningService = new ProvisioningService(ctx);
    ctx.service('provisioning', provisioningService);
    ctx.routes(provisioningRoutes(ctx));

    // React to subscription lifecycle events
    ctx.on('subscription.activated', async (payload) => {
      const p = payload as { subscriptionId: string; tenantId: string };
      ctx.logger.info('Subscription activated, triggering provisioning', { subscriptionId: p.subscriptionId });
      try {
        const svc = ctx.service<IProvisioningService>('provisioning');
        const db = ctx.db as any;
        const { serviceInstances: si } = await import('./schema.js');
        const { eq, and } = await import('drizzle-orm');

        const instances = await db
          .select()
          .from(si)
          .where(and(eq(si.subscriptionId, p.subscriptionId), eq(si.status, 'pending')));

        for (const instance of instances) {
          try {
            await svc.provisionService(instance.id, p.tenantId);
          } catch (err) {
            ctx.logger.error(`Auto-provision failed for ${instance.id}`, { error: err });
          }
        }
      } catch (err) {
        ctx.logger.error('Provisioning trigger failed on subscription.activated', { error: err });
      }
    });

    ctx.on('subscription.suspended', async (payload) => {
      const p = payload as { subscriptionId: string; tenantId: string };
      try {
        const svc = ctx.service<IProvisioningService>('provisioning');
        const db = ctx.db as any;
        const { serviceInstances: si } = await import('./schema.js');
        const { eq, and } = await import('drizzle-orm');

        const instances = await db
          .select()
          .from(si)
          .where(and(eq(si.subscriptionId, p.subscriptionId), eq(si.status, 'active')));

        for (const instance of instances) {
          try {
            await svc.suspendService(instance.id, p.tenantId);
          } catch (err) {
            ctx.logger.error(`Auto-suspend failed for ${instance.id}`, { error: err });
          }
        }
      } catch (err) {
        ctx.logger.error('Provisioning suspend failed on subscription.suspended', { error: err });
      }
    });

    ctx.on('subscription.terminated', async (payload) => {
      const p = payload as { subscriptionId: string; tenantId: string };
      try {
        const svc = ctx.service<IProvisioningService>('provisioning');
        const db = ctx.db as any;
        const { serviceInstances: si } = await import('./schema.js');
        const { eq, and } = await import('drizzle-orm');

        const instances = await db
          .select()
          .from(si)
          .where(and(eq(si.subscriptionId, p.subscriptionId), eq(si.status, 'suspended')));

        for (const instance of instances) {
          try {
            await svc.terminateService(instance.id, p.tenantId);
          } catch (err) {
            ctx.logger.error(`Auto-terminate failed for ${instance.id}`, { error: err });
          }
        }
      } catch (err) {
        ctx.logger.error('Provisioning terminate failed on subscription.terminated', { error: err });
      }
    });

    // Health check cron
    ctx.job('provisioning-health-check', '0 */6 * * *', async () => {
      ctx.logger.info('Running provisioning health check');
      try {
        const svc = ctx.service<IProvisioningService>('provisioning');
        // Health check runs per-tenant but we can't enumerate tenants here easily.
        // The individual endpoint handles per-tenant checks.
        ctx.logger.info('Provisioning health check cron fired (use per-tenant endpoint for actual checks)');
      } catch (err) {
        ctx.logger.error('Provisioning health check failed', { error: err });
      }
    });
  },
});

export type { IProvisioningService } from './types.js';
