import type { EventBus, JobScheduler } from '@panel1/core';
import { logger } from '../logging/Logger';
import { setApplicationEventBus } from './appRuntime.js';
import { operationalQueues } from '../jobs/OperationalQueues.js';
import { jobProcessor } from '../jobs/JobProcessor.js';
import { PaymentEventHandler } from '../payments/PaymentEventHandler.js';

/**
 * Issue 1.7: Wire legacy operational workers and payment/catalog-style listeners onto
 * `@panel1/core` EventBus + JobScheduler so the old BullMQ `events` queue + EventProcessor can be removed.
 */
export async function installLegacyBridgeBeforeJobSchedulerStart(ctx: {
  eventBus: EventBus;
  jobScheduler: JobScheduler;
}): Promise<void> {
  setApplicationEventBus(ctx.eventBus);

  await operationalQueues.initialize();
  await jobProcessor.initialize();

  await PaymentEventHandler.getInstance().attachToEventBus(ctx.eventBus);

  ctx.eventBus.on('plugin.manager.plugin:error', async (payload: unknown) => {
    logger.info('[plugin] plugin.manager.plugin:error', { payload });
  });
  ctx.eventBus.on('plugin.lifecycle.beforeInstall', async (payload: unknown) => {
    logger.info('[plugin] plugin.lifecycle.beforeInstall', { payload });
  });

  const core = ctx.jobScheduler;
  core.register(
    'legacy-daily-subscription-renewals',
    '0 1 * * *',
    async () => {
      await operationalQueues.scheduleSubscriptionRenewals();
    },
    'legacy'
  );
  core.register(
    'legacy-hourly-failed-payments',
    '0 * * * *',
    async () => {
      await operationalQueues.processFailedPayments();
    },
    'legacy'
  );
  core.register(
    'legacy-dunning-campaigns',
    '0 */6 * * *',
    async () => {
      await operationalQueues.processDunningCampaigns();
    },
    'legacy'
  );
  core.register(
    'legacy-process-scheduled-jobs',
    '*/30 * * * *',
    async () => {
      await operationalQueues.processScheduledJobs();
    },
    'legacy'
  );

  console.log('[legacyBridge] Operational queues + payment handlers + legacy crons registered on core scheduler');
}
