import { defineModule } from '@panel1/core';
import { z } from 'zod';
import { billingSchema } from './schema.js';
import { BillingService } from './service.js';
import { billingRoutes } from './routes.js';
import type { IBillingService } from './types.js';

export default defineModule({
  name: 'billing',
  version: '0.1.0',
  deps: [],

  schema: billingSchema,

  config: z.object({
    defaultCurrency: z.string().default('USD'),
    defaultPaymentTermsDays: z.number().default(30),
    pdfEnabled: z.boolean().default(true),
    autoSendOnCreate: z.boolean().default(false),
    dunningMaxAttempts: z.number().default(5),
  }),

  permissions: [
    'billing.invoices.view',
    'billing.invoices.view_own',
    'billing.invoices.create',
    'billing.invoices.edit',
    'billing.invoices.delete',
    'billing.invoices.send',
    'billing.invoices.export',
    'billing.invoices.process_payment',
    'billing.dunning.manage',
  ],

  emits: [
    'invoice.created',
    'invoice.sent',
    'invoice.paid',
    'invoice.overdue',
    'invoice.cancelled',
    'invoice.refunded',
    'dunning.attempted',
  ],

  setup(ctx) {
    const billingService = new BillingService(ctx);
    ctx.service('billing', billingService);
    ctx.routes(billingRoutes(ctx));

    ctx.on('payment.succeeded', async (payload) => {
      await billingService.handlePaymentSucceeded(payload as { invoiceId: string; paymentId: string; tenantId: string });
    });

    ctx.on('subscription.renewed', async (payload) => {
      await billingService.createRecurringInvoice(payload as { subscriptionId: string; tenantId: string });
    });

    ctx.job('billing-generate-recurring-invoices', '0 1 * * *', async () => {
      await billingService.generateRecurringInvoices();
    });

    ctx.job('billing-send-overdue-reminders', '0 9 * * *', async () => {
      await billingService.sendOverdueReminders();
    });

    ctx.job('billing-dunning-sweep', '0 12 * * *', async () => {
      await billingService.runDunningCycle();
    });
  },
});

export type { IBillingService } from './types.js';
