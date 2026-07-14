import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import type { Panel1AuthUser } from '@panel1/core';
import type { ModuleContext } from '@panel1/types';
import type { ISubscriptionService } from './types.js';
import { SEED_PERM } from './seed-permissions.js';
import { sql } from 'drizzle-orm';

function routePerm(ctx: ModuleContext, ...ids: string[]): MiddlewareHandler[] {
  const rp = ctx.requirePermission;
  if (!rp) {
    throw new Error('@panel1/mod-subscriptions: host must pass requirePermission via bootModules()');
  }
  return [rp(...ids) as MiddlewareHandler];
}

const SubscriptionSchema = z.object({
  id: z.string(),
  clientId: z.string().nullable(),
  planId: z.string().nullable(),
  planName: z.string().nullable(),
  currency: z.string().nullable(),
  status: z.string().nullable(),
  currentPeriodStart: z.string().nullable(),
  currentPeriodEnd: z.string().nullable(),
  nextBillingDate: z.string().nullable(),
  billingCycleAnchor: z.string().nullable(),
  cancelAtPeriodEnd: z.boolean().nullable(),
  canceledAt: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  trialStart: z.string().nullable(),
  trialEnd: z.string().nullable(),
  pastDueDate: z.string().nullable(),
  suspendedAt: z.string().nullable(),
  failedPaymentAttempts: z.number().nullable(),
  lastPaymentAttempt: z.string().nullable(),
  quantity: z.number().nullable(),
  unitPrice: z.string().nullable(),
  paymentMethodId: z.string().nullable(),
  defaultPaymentMethod: z.unknown().nullable(),
  metadata: z.unknown().nullable(),
  tenantId: z.string(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

const PaginatedSchema = z.object({
  subscriptions: z.array(SubscriptionSchema),
  total: z.number(),
  hasMore: z.boolean(),
});

const ErrorSchema = z.object({ error: z.string() });

const StatsSchema = z.object({
  totalSubscriptions: z.number(),
  activeSubscriptions: z.number(),
  trialingSubscriptions: z.number(),
  pastDueSubscriptions: z.number(),
  cancelledSubscriptions: z.number(),
  monthlyRecurringRevenue: z.number(),
});

const ProrationSchema = z.object({
  creditAmount: z.number(),
  chargeAmount: z.number(),
  netAmount: z.number(),
  proratedDays: z.number(),
});

const CancelResultSchema = z.object({
  success: z.boolean(),
  canceledAt: z.string(),
  refundAmount: z.number().optional(),
  refundId: z.string().optional(),
});

// ── Routes ──

const listSubscriptionsRoute = createRoute({
  method: 'get',
  path: '/subscriptions',
  request: {
    query: z.object({
      status: z.enum(['ACTIVE', 'INACTIVE', 'CANCELLED', 'PAST_DUE', 'UNPAID', 'TRIALING', 'PAUSED', 'PENDING_CANCELLATION']).optional(),
      clientId: z.string().optional(),
      planId: z.string().optional(),
      search: z.string().optional(),
      limit: z.coerce.number().min(1).max(100).default(20),
      offset: z.coerce.number().min(0).default(0),
    }),
  },
  responses: {
    200: { content: { 'application/json': { schema: PaginatedSchema } }, description: 'List subscriptions' },
  },
});

const getSubscriptionRoute = createRoute({
  method: 'get',
  path: '/subscriptions/{id}',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { content: { 'application/json': { schema: SubscriptionSchema } }, description: 'Subscription' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const createSubscriptionRoute = createRoute({
  method: 'post',
  path: '/subscriptions',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            clientId: z.string().uuid(),
            planId: z.string().uuid(),
            productId: z.string().uuid().optional(),
            paymentMethodId: z.string().optional(),
            trialDays: z.number().int().min(0).optional(),
            metadata: z.record(z.any()).optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: { content: { 'application/json': { schema: SubscriptionSchema } }, description: 'Created' },
  },
});

const updateSubscriptionRoute = createRoute({
  method: 'put',
  path: '/subscriptions/{id}',
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            planId: z.string().uuid().optional(),
            paymentMethodId: z.string().optional(),
            cancelAtPeriodEnd: z.boolean().optional(),
            cancellationReason: z.string().optional(),
            metadata: z.record(z.any()).optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: { content: { 'application/json': { schema: SubscriptionSchema } }, description: 'Updated' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const cancelSubscriptionRoute = createRoute({
  method: 'post',
  path: '/subscriptions/{id}/cancel',
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            cancelAtPeriodEnd: z.boolean().default(false),
            reason: z.string().optional(),
            refundUnusedTime: z.boolean().default(false),
          }),
        },
      },
    },
  },
  responses: {
    200: { content: { 'application/json': { schema: CancelResultSchema } }, description: 'Cancelled' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const getProrationRoute = createRoute({
  method: 'get',
  path: '/subscriptions/{id}/proration',
  request: {
    params: z.object({ id: z.string() }),
    query: z.object({ newPlanId: z.string().uuid() }),
  },
  responses: {
    200: { content: { 'application/json': { schema: ProrationSchema } }, description: 'Proration calculation' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const changePlanRoute = createRoute({
  method: 'post',
  path: '/subscriptions/{id}/change-plan',
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({ newPlanId: z.string().uuid() }),
        },
      },
    },
  },
  responses: {
    200: { content: { 'application/json': { schema: SubscriptionSchema } }, description: 'Plan changed' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const getStatsRoute = createRoute({
  method: 'get',
  path: '/subscriptions/stats',
  request: {},
  responses: {
    200: { content: { 'application/json': { schema: StatsSchema } }, description: 'Subscription stats' },
  },
});

const getStateChangesRoute = createRoute({
  method: 'get',
  path: '/subscriptions/{id}/state-changes',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { content: { 'application/json': { schema: z.array(z.any()) } }, description: 'State changes' },
  },
});

const getMySubscriptionsRoute = createRoute({
  method: 'get',
  path: '/my-subscriptions',
  request: {
    query: z.object({
      limit: z.coerce.number().min(1).max(100).default(20),
      offset: z.coerce.number().min(0).default(0),
    }),
  },
  responses: {
    200: { content: { 'application/json': { schema: PaginatedSchema } }, description: 'Client subscriptions' },
  },
});

export function subscriptionRoutes(ctx: ModuleContext) {
  const app = new OpenAPIHono();

  app.openapi(
    { ...listSubscriptionsRoute, middleware: routePerm(ctx, SEED_PERM.subscriptionsView) },
    async (c) => {
      const svc = ctx.service<ISubscriptionService>('subscriptions');
      const q = c.req.valid('query');
      const tenantId = c.get('tenantId') as string;
      const result = await svc.listSubscriptions(
        { status: q.status, clientId: q.clientId, planId: q.planId, search: q.search },
        tenantId,
        q.limit,
        q.offset,
      );
      return c.json(result, 200);
    },
  );

  app.openapi(
    { ...getSubscriptionRoute, middleware: routePerm(ctx, SEED_PERM.subscriptionsView, SEED_PERM.subscriptionsViewOwn) },
    async (c) => {
      const svc = ctx.service<ISubscriptionService>('subscriptions');
      const { id } = c.req.valid('param');
      const tenantId = c.get('tenantId') as string;
      const result = await svc.getSubscription(id, tenantId);
      if (!result) return c.json({ error: 'Subscription not found' }, 404);
      return c.json(result, 200);
    },
  );

  app.openapi(
    { ...createSubscriptionRoute, middleware: routePerm(ctx, SEED_PERM.subscriptionsCreate) },
    async (c) => {
      const svc = ctx.service<ISubscriptionService>('subscriptions');
      const body = c.req.valid('json');
      const tenantId = c.get('tenantId') as string;
      const user = c.get('user') as Panel1AuthUser;
      const sub = await svc.createSubscription(
        {
          clientId: body.clientId,
          planId: body.planId,
          productId: body.productId,
          paymentMethodId: body.paymentMethodId,
          trialDays: body.trialDays,
          metadata: body.metadata,
        },
        tenantId,
        user.id,
      );
      return c.json(sub, 201);
    },
  );

  app.openapi(
    { ...updateSubscriptionRoute, middleware: routePerm(ctx, SEED_PERM.subscriptionsEdit) },
    async (c) => {
      const svc = ctx.service<ISubscriptionService>('subscriptions');
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      const tenantId = c.get('tenantId') as string;
      try {
        const sub = await svc.updateSubscription(id, body, tenantId);
        return c.json(sub, 200);
      } catch {
        return c.json({ error: 'Subscription not found' }, 404);
      }
    },
  );

  app.openapi(
    { ...cancelSubscriptionRoute, middleware: routePerm(ctx, SEED_PERM.subscriptionsCancel, SEED_PERM.subscriptionsEdit) },
    async (c) => {
      const svc = ctx.service<ISubscriptionService>('subscriptions');
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      const tenantId = c.get('tenantId') as string;
      const user = c.get('user') as Panel1AuthUser;
      try {
        const result = await svc.cancelSubscription(id, body, tenantId, user.id);
        return c.json({ ...result, canceledAt: result.canceledAt.toISOString() }, 200);
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : 'Not found' }, 404);
      }
    },
  );

  app.openapi(
    { ...getProrationRoute, middleware: routePerm(ctx, SEED_PERM.subscriptionsView) },
    async (c) => {
      const svc = ctx.service<ISubscriptionService>('subscriptions');
      const { id } = c.req.valid('param');
      const q = c.req.valid('query');
      const tenantId = c.get('tenantId') as string;
      try {
        const result = await svc.calculateProration(id, q.newPlanId, tenantId);
        return c.json(result, 200);
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : 'Not found' }, 404);
      }
    },
  );

  app.openapi(
    { ...changePlanRoute, middleware: routePerm(ctx, SEED_PERM.subscriptionsEdit) },
    async (c) => {
      const svc = ctx.service<ISubscriptionService>('subscriptions');
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      const tenantId = c.get('tenantId') as string;
      const user = c.get('user') as Panel1AuthUser;
      try {
        const sub = await svc.changePlan(id, body.newPlanId, tenantId, user.id);
        return c.json(sub, 200);
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : 'Not found' }, 404);
      }
    },
  );

  app.openapi(
    { ...getStatsRoute, middleware: routePerm(ctx, SEED_PERM.subscriptionsView) },
    async (c) => {
      const svc = ctx.service<ISubscriptionService>('subscriptions');
      const tenantId = c.get('tenantId') as string;
      const stats = await svc.getStats(tenantId);
      return c.json(stats, 200);
    },
  );

  app.openapi(
    { ...getStateChangesRoute, middleware: routePerm(ctx, SEED_PERM.subscriptionsView) },
    async (c) => {
      const svc = ctx.service<ISubscriptionService>('subscriptions');
      const { id } = c.req.valid('param');
      const tenantId = c.get('tenantId') as string;
      const changes = await svc.getStateChanges(id, tenantId);
      return c.json(changes, 200);
    },
  );

  app.openapi(
    { ...getMySubscriptionsRoute, middleware: routePerm(ctx, SEED_PERM.subscriptionsViewOwn, SEED_PERM.subscriptionsView) },
    async (c) => {
      const q = c.req.valid('query');
      const tenantId = c.get('tenantId') as string;
      const user = c.get('user') as Panel1AuthUser;
      const db = ctx.db as any;
      const { subscriptions: sub } = await import('./schema.js');
      const { eq, and, desc, sql } = await import('drizzle-orm');

      const [clientRecord] = await db
        .select({ id: sql`id` })
        .from(sql`clients`)
        .where(and(eq(sql`clients.user_id`, user.id), eq(sql`clients.tenant_id`, tenantId)))
        .limit(1);

      if (!clientRecord) {
        return c.json({ subscriptions: [], total: 0, hasMore: false }, 200);
      }

      const conditions = [eq(sub.clientId, (clientRecord as any).id), eq(sub.tenantId, tenantId)];
      const rows = await db
        .select()
        .from(sub)
        .where(and(...conditions))
        .orderBy(desc(sub.createdAt))
        .limit(q.limit)
        .offset(q.offset);

      const [{ total }] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(sub)
        .where(and(...conditions));

      return c.json({ subscriptions: rows, total, hasMore: q.offset + q.limit < total }, 200);
    },
  );

  return app;
}
