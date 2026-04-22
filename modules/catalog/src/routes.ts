import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import type { Panel1AuthUser } from '@panel1/core';
import type { ModuleContext } from '@panel1/types';
import { z } from 'zod';
import { CatalogService, requireAdmin } from './CatalogService.js';
import { SEED_PERM } from './seed-permissions.js';

function routePerm(ctx: ModuleContext, ...ids: string[]): MiddlewareHandler[] {
  const rp = ctx.requirePermission;
  if (!rp) {
    throw new Error('@panel1/mod-catalog: host must pass requirePermission via bootModules()');
  }
  return [rp(...ids) as MiddlewareHandler];
}

function jsonError(c: { json: (b: unknown, s: number) => Response }, e: unknown, status = 400) {
  const message = e instanceof Error ? e.message : 'Request failed';
  return c.json({ error: message }, status);
}

const listPublicQuery = z.object({
  category: z.string().optional(),
  sortBy: z.enum(['name', 'createdAt', 'sortOrder']).optional().default('sortOrder'),
  sortDirection: z.enum(['asc', 'desc']).optional().default('asc'),
});

export function catalogRoutes(ctx: ModuleContext): Hono {
  const app = new Hono();
  const svc = () => new CatalogService(ctx);

  // --- Public storefront (no Bearer) — parent middleware skips auth for this prefix ---
  app.get('/public/products', async (c) => {
    try {
      const q = listPublicQuery.parse({
        category: c.req.query('category') || undefined,
        sortBy: c.req.query('sortBy') || undefined,
        sortDirection: c.req.query('sortDirection') || undefined,
      });
      const data = await svc().listPublicProducts(q);
      return c.json(data);
    } catch (e) {
      return jsonError(c, e);
    }
  });

  app.get('/providers', async (c) => {
    try {
      return c.json(svc().getProvidersMetadata());
    } catch (e) {
      return jsonError(c, e);
    }
  });

  app.get('/providers/health', async (c) => {
    try {
      return c.json(await svc().performHealthCheck());
    } catch (e) {
      return jsonError(c, e);
    }
  });

  const tenantId = (c: { get: (k: 'tenantId') => unknown }) => String(c.get('tenantId') || '');

  // --- Component definitions (admin) ---
  const createDef = z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    componentKey: z.string().min(1),
    configuration: z.record(z.unknown()),
    dependencies: z.array(z.any()).optional(),
    isActive: z.boolean().optional(),
  });

  app.post('/components/definitions', ...routePerm(ctx, SEED_PERM.componentsManage), async (c) => {
    try {
      const body = createDef.parse(await c.req.json());
      const user = c.get('user') as Panel1AuthUser;
      const row = await svc().createComponentDefinition({
        ...body,
        configuration: body.configuration as Record<string, unknown>,
        tenantId: user.tenantId ?? null,
      });
      return c.json(row, 201);
    } catch (e) {
      return jsonError(c, e);
    }
  });

  app.patch('/components/definitions/:id', ...routePerm(ctx, SEED_PERM.componentsManage), async (c) => {
    try {
      const id = c.req.param('id');
      const body = createDef.partial().parse(await c.req.json());
      const row = await svc().updateComponentDefinition(id, {
        ...body,
        configuration: body.configuration as Record<string, unknown> | undefined,
      });
      return c.json(row);
    } catch (e) {
      return jsonError(c, e);
    }
  });

  app.delete('/components/definitions/:id', ...routePerm(ctx, SEED_PERM.componentsManage), async (c) => {
    try {
      await svc().deleteComponentDefinition(c.req.param('id'));
      return c.json({ success: true });
    } catch (e) {
      return jsonError(c, e);
    }
  });

  app.get('/components/definitions/:id', async (c) => {
    try {
      const row = await svc().getComponentDefinition(c.req.param('id'));
      if (!row) return c.json({ error: 'Not found' }, 404);
      return c.json(row);
    } catch (e) {
      return jsonError(c, e);
    }
  });

  app.get('/components', async (c) => {
    try {
      return c.json(await svc().listComponentDefinitions());
    } catch (e) {
      return jsonError(c, e);
    }
  });

  // --- Dynamic registration ---
  const registerBody = z.object({
    componentKey: z.string().min(2).max(50).regex(/^[a-z0-9_-]+$/i),
    name: z.string().min(1).max(255),
    description: z.string().min(1).max(1000),
    supportedPricingModels: z.array(z.string()).min(1),
    usageTrackingSupported: z.boolean().default(false),
    requiredConfigFields: z.array(z.string()).default([]),
    optionalConfigFields: z.array(z.string()).default([]),
    configFieldTypes: z.record(z.enum(['string', 'number', 'boolean', 'select', 'array'])).optional(),
    configFieldOptions: z
      .record(z.array(z.object({ value: z.string(), label: z.string() })))
      .optional(),
    defaultConfiguration: z.record(z.unknown()).default({}),
    tags: z.array(z.string()).default([]),
    icon: z.string().optional(),
    isActive: z.boolean().default(true),
    provisioningRequired: z.boolean().default(true),
    provisioningProvider: z.string().optional(),
  });

  app.post('/components/register', ...routePerm(ctx, SEED_PERM.componentsManage), async (c) => {
    try {
      const body = registerBody.parse(await c.req.json());
      const tid = tenantId(c);
      if (!tid) return c.json({ error: 'Tenant required' }, 400);
      const result = await svc().registerComponent(tid, {
        ...body,
        defaultConfiguration: body.defaultConfiguration as Record<string, unknown>,
      });
      return c.json(result, 201);
    } catch (e) {
      return jsonError(c, e);
    }
  });

  app.patch('/components/register/:id', ...routePerm(ctx, SEED_PERM.componentsManage), async (c) => {
    try {
      const id = c.req.param('id');
      const body = registerBody.partial().omit({ componentKey: true }).parse(await c.req.json());
      const tid = tenantId(c);
      if (!tid) return c.json({ error: 'Tenant required' }, 400);
      const result = await svc().updateRegisteredComponent(tid, id, {
        ...body,
        defaultConfiguration: body.defaultConfiguration as Record<string, unknown> | undefined,
      });
      return c.json(result);
    } catch (e) {
      return jsonError(c, e);
    }
  });

  app.get('/components/validate-key', ...routePerm(ctx, SEED_PERM.componentsManage), async (c) => {
    try {
      const componentKey = c.req.query('componentKey');
      if (!componentKey) return c.json({ error: 'componentKey required' }, 400);
      const excludeId = c.req.query('excludeId') || undefined;
      return c.json(await svc().validateComponentKey(componentKey, excludeId));
    } catch (e) {
      return jsonError(c, e);
    }
  });

  app.get('/components/stats', ...routePerm(ctx, SEED_PERM.componentsManage), async (c) => {
    try {
      return c.json(await svc().getComponentRegistrationStats());
    } catch (e) {
      return jsonError(c, e);
    }
  });

  // --- Products ---
  const productComponentInput = z.object({
    componentId: z.string().uuid(),
    pricing: z.enum(['FIXED', 'PER_UNIT', 'TIERED', 'VOLUME', 'USAGE_BASED']),
    unitPrice: z.string().optional(),
    includedUnits: z.number().optional(),
    configuration: z.record(z.string(), z.any()).optional(),
    tiers: z
      .array(z.object({ from: z.number(), to: z.number().nullable(), price: z.string() }))
      .optional(),
  });

  const billingPlanInput = z.object({
    name: z.string().min(1),
    basePrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
    interval: z.enum(['MONTHLY', 'YEARLY', 'QUARTERLY']),
    setupFee: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  });

  const createProductBody = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    shortDescription: z.string().optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).default([]),
    isActive: z.boolean().default(true),
    isPublic: z.boolean().default(false),
    sortOrder: z.number().default(0),
    trialPeriodDays: z.number().optional(),
    setupRequired: z.boolean().default(false),
    components: z.array(productComponentInput).default([]),
    billingPlans: z.array(billingPlanInput).min(1).default([
      { name: 'Monthly', basePrice: '0.00', interval: 'MONTHLY' },
    ]),
  });

  app.post('/products', ...routePerm(ctx, SEED_PERM.productsCreate), async (c) => {
    try {
      const body = createProductBody.parse(await c.req.json());
      const tid = tenantId(c);
      const data = await svc().createProduct(tid, {
        ...body,
        components: body.components,
        billingPlans: body.billingPlans,
      });
      return c.json(data, 201);
    } catch (e) {
      return jsonError(c, e);
    }
  });

  const updateProductBody = createProductBody.partial().extend({
    components: z.array(productComponentInput).optional(),
    billingPlans: z.array(billingPlanInput).optional(),
  });

  app.patch('/products/:id', ...routePerm(ctx, SEED_PERM.productsEdit), async (c) => {
    try {
      const id = c.req.param('id');
      const body = updateProductBody.parse(await c.req.json());
      const tid = tenantId(c);
      const data = await svc().updateProduct(tid, id, body);
      return c.json(data);
    } catch (e) {
      return jsonError(c, e);
    }
  });

  app.delete('/products/:id', ...routePerm(ctx, SEED_PERM.productsManage), async (c) => {
    try {
      const tid = tenantId(c);
      await svc().deleteProduct(tid, c.req.param('id'));
      return c.json({ success: true });
    } catch (e) {
      return jsonError(c, e);
    }
  });

  app.get('/products/:id', async (c) => {
    try {
      const tid = tenantId(c);
      const data = await svc().getProduct(tid, c.req.param('id'));
      return c.json(data);
    } catch (e) {
      return jsonError(c, e, 404);
    }
  });

  const listProductsQuery = z.object({
    category: z.string().optional(),
    isActive: z.coerce.boolean().optional(),
    isPublic: z.coerce.boolean().optional(),
    sortBy: z.enum(['name', 'createdAt', 'sortOrder']).optional().default('sortOrder'),
    sortDirection: z.enum(['asc', 'desc']).optional().default('asc'),
  });

  app.get('/products', async (c) => {
    try {
      const q = listProductsQuery.parse({
        category: c.req.query('category') || undefined,
        isActive: c.req.query('isActive'),
        isPublic: c.req.query('isPublic'),
        sortBy: c.req.query('sortBy') || undefined,
        sortDirection: c.req.query('sortDirection') || undefined,
      });
      const tid = tenantId(c);
      return c.json(await svc().listProducts(tid, q));
    } catch (e) {
      return jsonError(c, e);
    }
  });

  app.get('/products-search', async (c) => {
    try {
      const query = c.req.query('q');
      if (!query || query.length < 1) return c.json({ error: 'q required' }, 400);
      const tid = tenantId(c);
      return c.json(await svc().searchProducts(tid, query));
    } catch (e) {
      return jsonError(c, e);
    }
  });

  // --- Billing plans (top-level) ---
  const billingPlanCreate = z.object({
    productId: z.string().uuid(),
    name: z.string().min(1).max(255),
    description: z.string().optional(),
    interval: z.enum(['MONTHLY', 'YEARLY', 'WEEKLY', 'DAILY', 'HOURLY']),
    intervalCount: z.number().int().min(1).default(1),
    basePrice: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'),
    currency: z.string().default('USD'),
    setupFee: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'),
    trialPeriodDays: z.number().int().min(0).default(0),
    isDefault: z.boolean().default(false),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().default(0),
    metadata: z.record(z.unknown()).optional(),
  });

  app.post('/billing-plans', ...routePerm(ctx, SEED_PERM.productsManage), async (c) => {
    try {
      const body = billingPlanCreate.parse(await c.req.json());
      const tid = tenantId(c);
      return c.json(await svc().createBillingPlan(tid, body));
    } catch (e) {
      return jsonError(c, e);
    }
  });

  app.patch('/billing-plans/:id', ...routePerm(ctx, SEED_PERM.productsManage), async (c) => {
    try {
      const body = billingPlanCreate.partial().omit({ productId: true }).parse(await c.req.json());
      const tid = tenantId(c);
      return c.json(await svc().updateBillingPlan(tid, c.req.param('id'), body));
    } catch (e) {
      return jsonError(c, e);
    }
  });

  app.delete('/billing-plans/:id', ...routePerm(ctx, SEED_PERM.productsManage), async (c) => {
    try {
      const tid = tenantId(c);
      await svc().deleteBillingPlan(tid, c.req.param('id'));
      return c.json({ success: true });
    } catch (e) {
      return jsonError(c, e);
    }
  });

  app.get('/billing-plans/:id', async (c) => {
    try {
      const tid = tenantId(c);
      return c.json(await svc().getBillingPlan(tid, c.req.param('id')));
    } catch (e) {
      return jsonError(c, e, 404);
    }
  });

  const listBpQuery = z.object({
    productId: z.string().uuid().optional(),
    isActive: z.coerce.boolean().optional(),
    interval: z.enum(['MONTHLY', 'YEARLY', 'WEEKLY', 'DAILY', 'HOURLY']).optional(),
    sortBy: z.enum(['name', 'basePrice', 'sortOrder']).optional().default('sortOrder'),
    sortDirection: z.enum(['asc', 'desc']).optional().default('asc'),
  });

  app.get('/billing-plans', async (c) => {
    try {
      const q = listBpQuery.parse({
        productId: c.req.query('productId') || undefined,
        isActive: c.req.query('isActive'),
        interval: c.req.query('interval') || undefined,
        sortBy: c.req.query('sortBy') || undefined,
        sortDirection: c.req.query('sortDirection') || undefined,
      });
      const tid = tenantId(c);
      return c.json(await svc().listBillingPlans(tid, q));
    } catch (e) {
      return jsonError(c, e);
    }
  });

  // --- Product ↔ component links ---
  const pcAdd = z.object({
    productId: z.string().uuid(),
    componentDefinitionId: z.string().uuid(),
    pricingModel: z.enum(['FIXED', 'PER_UNIT', 'TIERED', 'VOLUME', 'USAGE_BASED']),
    pricingDetails: z.object({
      fixedPrice: z.number().optional(),
      pricePerUnit: z.number().optional(),
      minQuantity: z.number().int().optional(),
      maxQuantity: z.number().int().optional(),
      tiers: z
        .array(
          z.object({
            minQuantity: z.number().int(),
            maxQuantity: z.number().int().optional(),
            pricePerUnit: z.number(),
          }),
        )
        .optional(),
      includedQuantity: z.number().int().optional(),
      billingUnit: z.string().optional(),
      currency: z.string().default('USD'),
    }),
    defaultConfig: z.record(z.unknown()).optional(),
    isRequired: z.boolean().default(true),
    isConfigurable: z.boolean().default(false),
    sortOrder: z.number().int().default(0),
  });

  app.post('/product-components', ...routePerm(ctx, SEED_PERM.productsManage), async (c) => {
    try {
      const body = pcAdd.parse(await c.req.json());
      const tid = tenantId(c);
      const row = await svc().productComponentsAdd(tid, {
        productId: body.productId,
        componentDefinitionId: body.componentDefinitionId,
        pricingModel: body.pricingModel,
        pricingDetails: body.pricingDetails as Record<string, unknown>,
        defaultConfig: body.defaultConfig as Record<string, unknown> | undefined,
        sortOrder: body.sortOrder,
      });
      return c.json(row, 201);
    } catch (e) {
      return jsonError(c, e);
    }
  });

  app.patch('/product-components/:id', ...routePerm(ctx, SEED_PERM.productsManage), async (c) => {
    try {
      const body = pcAdd
        .omit({ productId: true, componentDefinitionId: true })
        .partial()
        .parse(await c.req.json());
      const tid = tenantId(c);
      const row = await svc().productComponentsUpdate(tid, c.req.param('id'), {
        pricingModel: body.pricingModel,
        pricingDetails: body.pricingDetails as Record<string, unknown> | undefined,
        defaultConfig: body.defaultConfig as Record<string, unknown> | undefined,
        sortOrder: body.sortOrder,
      });
      return c.json(row);
    } catch (e) {
      return jsonError(c, e);
    }
  });

  app.delete('/product-components/:id', ...routePerm(ctx, SEED_PERM.productsManage), async (c) => {
    try {
      const tid = tenantId(c);
      await svc().productComponentsRemove(tid, c.req.param('id'));
      return c.json({ success: true });
    } catch (e) {
      return jsonError(c, e);
    }
  });

  // --- Usage ---
  const usageBody = z.object({
    subscribedComponentId: z.string().uuid(),
    usageAmount: z.number().min(0),
    mode: z.enum(['increment', 'set']).default('increment'),
  });

  app.post('/usage/report', async (c) => {
    try {
      const body = usageBody.parse(await c.req.json());
      const tid = tenantId(c);
      return c.json(await svc().reportUsage(tid, body.subscribedComponentId, body.usageAmount, body.mode));
    } catch (e) {
      return jsonError(c, e);
    }
  });

  // --- Legacy `plans` table ---
  app.get('/legacy-plans', ...routePerm(ctx, SEED_PERM.plansView), async (c) => {
    try {
      const activeOnly = c.req.query('activeOnly') !== 'false';
      const tid = tenantId(c);
      return c.json(await svc().plansGetAll(tid, activeOnly));
    } catch (e) {
      return jsonError(c, e);
    }
  });

  app.get('/legacy-plans/:id', ...routePerm(ctx, SEED_PERM.plansView), async (c) => {
    try {
      const tid = tenantId(c);
      return c.json(await svc().plansGetById(tid, c.req.param('id')));
    } catch (e) {
      return jsonError(c, e, 404);
    }
  });

  app.post('/legacy-plans', ...routePerm(ctx, SEED_PERM.plansCreate), async (c) => {
    try {
      const body = z
        .object({
          name: z.string().min(1),
          description: z.string().optional(),
          price: z.string().regex(/^\d+(\.\d{1,2})?$/),
          currency: z.string().default('USD'),
          interval: z.enum(['MONTHLY', 'YEARLY', 'WEEKLY', 'DAILY']),
          features: z.record(z.unknown()).optional(),
          trialPeriodDays: z.number().int().min(0).default(0),
          setupFee: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'),
        })
        .parse(await c.req.json());
      const tid = tenantId(c);
      return c.json(await svc().plansCreate(tid, body), 201);
    } catch (e) {
      return jsonError(c, e);
    }
  });

  app.patch('/legacy-plans/:id', ...routePerm(ctx, SEED_PERM.plansEdit), async (c) => {
    try {
      const body = z
        .object({
          name: z.string().min(1).optional(),
          description: z.string().optional(),
          price: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
          currency: z.string().optional(),
          interval: z.enum(['MONTHLY', 'YEARLY', 'WEEKLY', 'DAILY']).optional(),
          isActive: z.boolean().optional(),
          features: z.record(z.unknown()).optional(),
          trialPeriodDays: z.number().int().min(0).optional(),
          setupFee: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
        })
        .parse(await c.req.json());
      const tid = tenantId(c);
      return c.json(await svc().plansUpdate(tid, c.req.param('id'), body));
    } catch (e) {
      return jsonError(c, e);
    }
  });

  app.delete('/legacy-plans/:id', ...routePerm(ctx, SEED_PERM.plansDelete), async (c) => {
    try {
      const tid = tenantId(c);
      await svc().plansDelete(tid, c.req.param('id'));
      return c.json({ success: true });
    } catch (e) {
      return jsonError(c, e);
    }
  });

  // --- Subscribed component ops (ex-`components` tRPC router) ---
  app.get('/instances/health', async (c) => {
    try {
      requireAdmin(c.get('user') as Panel1AuthUser);
      const componentId = c.req.query('componentId');
      const providerKey = c.req.query('providerKey');
      if (!componentId || !providerKey) return c.json({ error: 'componentId and providerKey required' }, 400);
      return c.json(await svc().checkComponentHealth(componentId, providerKey));
    } catch (e) {
      return jsonError(c, e, e instanceof Error && e.message.includes('Admin') ? 403 : 400);
    }
  });

  app.post('/instances/:id/restart', async (c) => {
    try {
      const tid = tenantId(c);
      return c.json(await svc().restartSubscribedComponent(tid, c.req.param('id')));
    } catch (e) {
      return jsonError(c, e);
    }
  });

  app.patch('/instances/:id/configuration', async (c) => {
    try {
      const body = z.object({ configuration: z.record(z.unknown()) }).parse(await c.req.json());
      const tid = tenantId(c);
      return c.json(
        await svc().updateSubscribedConfiguration(tid, c.req.param('id'), body.configuration as Record<string, unknown>),
      );
    } catch (e) {
      return jsonError(c, e);
    }
  });

  app.post('/instances/:id/scale', async (c) => {
    try {
      const body = z.object({ quantity: z.number().min(1) }).parse(await c.req.json());
      const tid = tenantId(c);
      return c.json(await svc().scaleSubscribedComponent(tid, c.req.param('id'), body.quantity));
    } catch (e) {
      return jsonError(c, e);
    }
  });

  app.get('/instances/:id/status', async (c) => {
    try {
      const tid = tenantId(c);
      return c.json(await svc().getSubscribedComponentStatus(tid, c.req.param('id')));
    } catch (e) {
      return jsonError(c, e);
    }
  });

  return app;
}
