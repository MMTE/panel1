import { defineModule } from '@panel1/core';
import { paymentSchema } from './schema.js';
import { PaymentService, StripeGateway } from './service.js';
import { paymentRoutes } from './routes.js';
import type { IPaymentService } from './types.js';
import { SEED_PERM } from './seed-permissions.js';

export default defineModule({
  name: 'payments',
  version: '1.0.0',
  deps: [],

  schema: paymentSchema,

  permissions: [
    SEED_PERM.gatewaysView,
    SEED_PERM.gatewaysManage,
    SEED_PERM.transactionsView,
    SEED_PERM.transactionsRefund,
  ],

  emits: [
    'payment.initiated',
    'payment.succeeded',
    'payment.failed',
    'payment.refunded',
  ],

  setup(ctx) {
    const paymentService = new PaymentService(ctx);
    ctx.service('payments', paymentService);

    paymentService.registerGatewayPlugin(new StripeGateway());

    ctx.routes(paymentRoutes(ctx));

    ctx.job('payments-retry-failed', '0 * * * *', async () => {
      const svc = ctx.service<IPaymentService>('payments');
      await svc.retryStaleFailedPayments();
    });

    ctx.on('invoice.sent', async (payload: any) => {
      const svc = ctx.service<IPaymentService>('payments');
      await svc.handleInvoiceSent(payload);
    });
  },
});

export type { IPaymentService } from './types.js';
