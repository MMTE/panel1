import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import type { Panel1AuthUser } from '@panel1/core';
import type { ModuleContext } from '@panel1/types';
import type { IPaymentService } from './types.js';
import { SEED_PERM } from './seed-permissions.js';

function routePerm(ctx: ModuleContext, ...ids: string[]): MiddlewareHandler[] {
  const rp = ctx.requirePermission;
  if (!rp) {
    throw new Error('@panel1/mod-payments: host must pass requirePermission via bootModules()');
  }
  return [rp(...ids) as MiddlewareHandler];
}

const GatewaySchema = z.object({
  id: z.string(),
  gatewayName: z.string(),
  displayName: z.string(),
  status: z.string().nullable(),
  isActive: z.boolean().nullable(),
  isDefault: z.boolean().nullable(),
  supportedCurrencies: z.array(z.string()).nullable(),
  supportedPaymentMethods: z.array(z.string()).nullable(),
  features: z.array(z.string()).nullable(),
  webhookUrl: z.string().nullable(),
  apiEndpoint: z.string().nullable(),
  lastHealthCheck: z.string().nullable(),
  healthCheckStatus: z.string().nullable(),
  errorMessage: z.string().nullable(),
  metadata: z.unknown().nullable(),
  tenantId: z.string(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

const PaymentSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  clientId: z.string().nullable(),
  invoiceId: z.string().nullable(),
  subscriptionId: z.string().nullable(),
  amount: z.string().nullable(),
  currency: z.string(),
  status: z.string(),
  gateway: z.string(),
  gatewayId: z.string().nullable(),
  gatewayPaymentId: z.string().nullable(),
  description: z.string().nullable(),
  refundedAmount: z.string().nullable(),
  refundStatus: z.string().nullable(),
  refundedAt: z.string().nullable(),
  failureReason: z.string().nullable(),
  failureCode: z.string().nullable(),
  lastError: z.string().nullable(),
  retryCount: z.number().nullable(),
  nextRetryAt: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

const PaginatedPaymentsSchema = z.object({
  payments: z.array(PaymentSchema),
  total: z.number(),
  hasMore: z.boolean(),
});

const ErrorSchema = z.object({ error: z.string() });

const ChargeResultSchema = z.object({
  id: z.string(),
  clientSecret: z.string().nullable(),
  status: z.string(),
  amount: z.number(),
  currency: z.string(),
  gateway: z.string(),
  requiresAction: z.boolean().optional(),
  nextAction: z.object({ type: z.string(), redirectUrl: z.string().optional() }).optional(),
});

const CaptureResultSchema = z.object({
  id: z.string(),
  status: z.string(),
  amount: z.number(),
  currency: z.string(),
});

const RefundResultSchema = z.object({
  id: z.string(),
  status: z.string(),
  amount: z.number(),
  currency: z.string(),
  reason: z.string().optional(),
});

const HealthCheckSchema = z.object({
  healthy: z.boolean(),
  status: z.string(),
  message: z.string().optional(),
  responseTime: z.number().optional(),
});

const WebhookResultSchema = z.object({
  processed: z.boolean(),
  message: z.string().optional(),
});

const listGatewaysRoute = createRoute({
  method: 'get',
  path: '/gateways',
  request: {},
  responses: {
    200: { content: { 'application/json': { schema: z.array(GatewaySchema) } }, description: 'List of gateways' },
  },
});

const getGatewayRoute = createRoute({
  method: 'get',
  path: '/gateways/{id}',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { content: { 'application/json': { schema: GatewaySchema } }, description: 'Gateway config' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const createGatewayRoute = createRoute({
  method: 'post',
  path: '/gateways',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            gatewayName: z.string().min(1).max(50),
            displayName: z.string().min(1).max(255),
            config: z.record(z.unknown()),
            isDefault: z.boolean().default(false),
            isActive: z.boolean().default(false),
            supportedCurrencies: z.array(z.string()).optional(),
            supportedPaymentMethods: z.array(z.string()).optional(),
            features: z.array(z.string()).optional(),
            webhookUrl: z.string().optional(),
            webhookSecret: z.string().optional(),
            apiEndpoint: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: { content: { 'application/json': { schema: GatewaySchema } }, description: 'Gateway created' },
  },
});

const updateGatewayRoute = createRoute({
  method: 'put',
  path: '/gateways/{id}',
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            displayName: z.string().min(1).max(255).optional(),
            config: z.record(z.unknown()).optional(),
            isDefault: z.boolean().optional(),
            isActive: z.boolean().optional(),
            status: z.enum(['ACTIVE', 'INACTIVE', 'PENDING_SETUP', 'ERROR', 'TESTING', 'MAINTENANCE']).optional(),
            supportedCurrencies: z.array(z.string()).optional(),
            supportedPaymentMethods: z.array(z.string()).optional(),
            features: z.array(z.string()).optional(),
            webhookUrl: z.string().optional(),
            webhookSecret: z.string().optional(),
            apiEndpoint: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: { content: { 'application/json': { schema: GatewaySchema } }, description: 'Gateway updated' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const deleteGatewayRoute = createRoute({
  method: 'delete',
  path: '/gateways/{id}',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }, description: 'Gateway deleted' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const testGatewayRoute = createRoute({
  method: 'post',
  path: '/gateways/{id}/test',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { content: { 'application/json': { schema: HealthCheckSchema } }, description: 'Health check result' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const webhookRoute = createRoute({
  method: 'post',
  path: '/gateways/{name}/webhook',
  request: {
    params: z.object({ name: z.string() }),
    body: {
      content: { 'application/json': { schema: z.unknown() } },
    },
  },
  responses: {
    200: { content: { 'application/json': { schema: WebhookResultSchema } }, description: 'Webhook processed' },
  },
});

const createChargeRoute = createRoute({
  method: 'post',
  path: '/charges',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            amount: z.number().positive(),
            currency: z.string().length(3),
            description: z.string().optional(),
            clientId: z.string().optional(),
            invoiceId: z.string().optional(),
            subscriptionId: z.string().optional(),
            gatewayName: z.string().optional(),
            customerId: z.string().optional(),
            metadata: z.record(z.unknown()).optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: { content: { 'application/json': { schema: ChargeResultSchema } }, description: 'Charge created' },
  },
});

const capturePaymentRoute = createRoute({
  method: 'post',
  path: '/charges/{id}/capture',
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            amount: z.number().positive().optional(),
          }).optional(),
        },
      },
    },
  },
  responses: {
    200: { content: { 'application/json': { schema: CaptureResultSchema } }, description: 'Payment captured' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const refundPaymentRoute = createRoute({
  method: 'post',
  path: '/charges/{id}/refund',
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            amount: z.number().positive().optional(),
            reason: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: { content: { 'application/json': { schema: RefundResultSchema } }, description: 'Refund processed' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const listTransactionsRoute = createRoute({
  method: 'get',
  path: '/transactions',
  request: {
    query: z.object({
      status: z.string().optional(),
      gateway: z.string().optional(),
      clientId: z.string().optional(),
      invoiceId: z.string().optional(),
      search: z.string().optional(),
      limit: z.coerce.number().min(1).max(100).default(20),
      offset: z.coerce.number().min(0).default(0),
    }),
  },
  responses: {
    200: { content: { 'application/json': { schema: PaginatedPaymentsSchema } }, description: 'List of transactions' },
  },
});

const getTransactionRoute = createRoute({
  method: 'get',
  path: '/transactions/{id}',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { content: { 'application/json': { schema: PaymentSchema } }, description: 'Transaction details' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const retryTransactionRoute = createRoute({
  method: 'post',
  path: '/transactions/{id}/retry',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { content: { 'application/json': { schema: ChargeResultSchema } }, description: 'Payment retried' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

export function paymentRoutes(ctx: ModuleContext) {
  const app = new OpenAPIHono();

  const getSvc = () => ctx.service<IPaymentService>('payments');

  app.openapi({ ...listGatewaysRoute, middleware: routePerm(ctx, SEED_PERM.gatewaysView) }, async (c) => {
    const svc = getSvc();
    const tenantId = c.get('tenantId') as string;
    const gateways = await svc.listGateways(tenantId);
    return c.json(gateways, 200);
  });

  app.openapi({ ...getGatewayRoute, middleware: routePerm(ctx, SEED_PERM.gatewaysView) }, async (c) => {
    const svc = getSvc();
    const { id } = c.req.valid('param');
    const tenantId = c.get('tenantId') as string;
    const gateway = await svc.getGateway(id, tenantId);
    if (!gateway) return c.json({ error: 'Gateway not found' }, 404);
    return c.json(gateway, 200);
  });

  app.openapi({ ...createGatewayRoute, middleware: routePerm(ctx, SEED_PERM.gatewaysManage) }, async (c) => {
    const svc = getSvc();
    const body = c.req.valid('json');
    const tenantId = c.get('tenantId') as string;
    const gateway = await svc.createGateway(body as any, tenantId);
    return c.json(gateway, 201);
  });

  app.openapi({ ...updateGatewayRoute, middleware: routePerm(ctx, SEED_PERM.gatewaysManage) }, async (c) => {
    const svc = getSvc();
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const tenantId = c.get('tenantId') as string;
    try {
      const gateway = await svc.updateGateway(id, body, tenantId);
      return c.json(gateway, 200);
    } catch {
      return c.json({ error: 'Gateway not found' }, 404);
    }
  });

  app.openapi({ ...deleteGatewayRoute, middleware: routePerm(ctx, SEED_PERM.gatewaysManage) }, async (c) => {
    const svc = getSvc();
    const { id } = c.req.valid('param');
    const tenantId = c.get('tenantId') as string;
    try {
      await svc.deleteGateway(id, tenantId);
      return c.json({ success: true }, 200);
    } catch {
      return c.json({ error: 'Gateway not found' }, 404);
    }
  });

  app.openapi({ ...testGatewayRoute, middleware: routePerm(ctx, SEED_PERM.gatewaysManage) }, async (c) => {
    const svc = getSvc();
    const { id } = c.req.valid('param');
    const tenantId = c.get('tenantId') as string;
    try {
      const result = await svc.testGateway(id, tenantId);
      return c.json(result, 200);
    } catch {
      return c.json({ error: 'Gateway not found' }, 404);
    }
  });

  app.openapi(webhookRoute, async (c) => {
    const svc = getSvc();
    const { name } = c.req.valid('param');
    const payload = c.req.valid('json');
    const signature = c.req.header('stripe-signature') || '';
    const result = await svc.handleWebhook(name, payload, signature);
    return c.json(result, 200);
  });

  app.openapi({ ...createChargeRoute, middleware: routePerm(ctx, SEED_PERM.transactionsView) }, async (c) => {
    const svc = getSvc();
    const body = c.req.valid('json');
    const tenantId = c.get('tenantId') as string;
    const charge = await svc.createCharge(body as any, tenantId);
    return c.json(charge, 201);
  });

  app.openapi({ ...capturePaymentRoute, middleware: routePerm(ctx, SEED_PERM.transactionsView) }, async (c) => {
    const svc = getSvc();
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const tenantId = c.get('tenantId') as string;
    try {
      const result = await svc.capturePayment(id, tenantId, body?.amount);
      return c.json(result, 200);
    } catch {
      return c.json({ error: 'Capture failed' }, 404);
    }
  });

  app.openapi({ ...refundPaymentRoute, middleware: routePerm(ctx, SEED_PERM.transactionsRefund) }, async (c) => {
    const svc = getSvc();
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const tenantId = c.get('tenantId') as string;
    try {
      const result = await svc.refundPayment(id, tenantId, body?.amount, body?.reason);
      return c.json(result, 200);
    } catch {
      return c.json({ error: 'Refund failed' }, 404);
    }
  });

  app.openapi({ ...listTransactionsRoute, middleware: routePerm(ctx, SEED_PERM.transactionsView) }, async (c) => {
    const svc = getSvc();
    const q = c.req.valid('query');
    const tenantId = c.get('tenantId') as string;
    const result = await svc.listPayments(
      {
        status: q.status as any,
        gateway: q.gateway,
        clientId: q.clientId,
        invoiceId: q.invoiceId,
        search: q.search,
      },
      { limit: q.limit, offset: q.offset },
      tenantId,
    );
    return c.json(result, 200);
  });

  app.openapi({ ...getTransactionRoute, middleware: routePerm(ctx, SEED_PERM.transactionsView) }, async (c) => {
    const svc = getSvc();
    const { id } = c.req.valid('param');
    const tenantId = c.get('tenantId') as string;
    const payment = await svc.getPayment(id, tenantId);
    if (!payment) return c.json({ error: 'Transaction not found' }, 404);
    return c.json(payment, 200);
  });

  app.openapi({ ...retryTransactionRoute, middleware: routePerm(ctx, SEED_PERM.transactionsView) }, async (c) => {
    const svc = getSvc();
    const { id } = c.req.valid('param');
    const tenantId = c.get('tenantId') as string;
    try {
      const result = await svc.retryFailedPayment(id, tenantId);
      return c.json(result, 200);
    } catch {
      return c.json({ error: 'Retry failed' }, 404);
    }
  });

  return app;
}
