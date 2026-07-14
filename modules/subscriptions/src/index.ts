import { defineModule } from '@panel1/core';
import { z } from 'zod';
import { subscriptionSchema } from './schema.js';
import { SubscriptionService } from './service.js';
import { subscriptionRoutes } from './routes.js';
import type { ISubscriptionService } from './types.js';

export default defineModule({
  name: 'subscriptions',
  version: '0.1.0',
  deps: ['billing', 'payments'],

  schema: subscriptionSchema,

  config: z.object({
    defaultTrialDays: z.number().default(0),
    maxFailedPaymentAttempts: z.number().default(3),
    gracePeriodDays: z.number().default(7),
  }),

  permissions: [
    'subscriptions.view',
    'subscriptions.create',
    'subscriptions.edit',
    'subscriptions.delete',
    'subscriptions.cancel',
    'subscriptions.view_own',
  ],

  emits: [
    'subscription.created',
    'subscription.activated',
    'subscription.renewed',
    'subscription.suspended',
    'subscription.cancelled',
    'subscription.past_due',
    'subscription.terminated',
    'subscription.plan_changed',
  ],

  setup(ctx) {
    const subscriptionService = new SubscriptionService(ctx);
    ctx.service('subscriptions', subscriptionService);
    ctx.routes(subscriptionRoutes(ctx));

    // Listen for payment events
    ctx.on('payment.succeeded', async (payload) => {
      const p = payload as { subscriptionId?: string; tenantId: string };
      if (p.subscriptionId) {
        await subscriptionService.handlePaymentSucceeded({ subscriptionId: p.subscriptionId, tenantId: p.tenantId });
      }
    });

    ctx.on('payment.failed', async (payload) => {
      const p = payload as { subscriptionId?: string; tenantId: string; attemptNumber?: number };
      if (p.subscriptionId) {
        await subscriptionService.handlePaymentFailed({
          subscriptionId: p.subscriptionId,
          tenantId: p.tenantId,
          attemptNumber: p.attemptNumber || 1,
        });
      }
    });

    ctx.on('invoice.overdue', async (payload) => {
      const p = payload as { subscriptionId?: string; tenantId: string };
      if (p.subscriptionId) {
        await subscriptionService.handleInvoiceOverdue({ subscriptionId: p.subscriptionId, tenantId: p.tenantId });
      }
    });

    // Renewal sweep cron
    ctx.job('subscriptions-renewal-sweep', '0 2 * * *', async () => {
      ctx.logger.info('Running subscription renewal sweep');
      const db = ctx.db as any;
      const { subscriptions: sub } = await import('./schema.js');
      const { eq, and, lte, isNotNull } = await import('drizzle-orm');

      const dueSubs = await db
        .select()
        .from(sub)
        .where(and(
          eq(sub.status, 'ACTIVE'),
          isNotNull(sub.nextBillingDate),
          lte(sub.nextBillingDate, new Date()),
        ))
        .limit(100);

      for (const subRecord of dueSubs) {
        try {
          await subscriptionService.processRenewal(subRecord.id, subRecord.tenantId);
        } catch (err) {
          ctx.logger.error(`Renewal failed for ${subRecord.id}`, { error: err });
        }
      }
    });

    // Cancel-at-period-end sweep
    ctx.job('subscriptions-cancellation-sweep', '0 3 * * *', async () => {
      ctx.logger.info('Running cancellation sweep');
      const db = ctx.db as any;
      const { subscriptions: sub } = await import('./schema.js');
      const { eq, and, lte } = await import('drizzle-orm');

      const toCancel = await db
        .select()
        .from(sub)
        .where(and(
          eq(sub.cancelAtPeriodEnd, true),
          lte(sub.currentPeriodEnd, new Date()),
        ))
        .limit(50);

      for (const subRecord of toCancel) {
        try {
          await subscriptionService.cancelSubscription(
            subRecord.id,
            { cancelAtPeriodEnd: false, reason: 'period_end' },
            subRecord.tenantId,
          );
        } catch (err) {
          ctx.logger.error(`Auto-cancel failed for ${subRecord.id}`, { error: err });
        }
      }
    });
  },
});

export type { ISubscriptionService } from './types.js';
