import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import type { ModuleContext } from '@panel1/types';
import type { IProvisioningService } from './types.js';
import { SEED_PERM } from './seed-permissions.js';

function routePerm(ctx: ModuleContext, ...ids: string[]): MiddlewareHandler[] {
  const rp = ctx.requirePermission;
  if (!rp) {
    throw new Error('@panel1/mod-provisioning: host must pass requirePermission via bootModules()');
  }
  return [rp(...ids) as MiddlewareHandler];
}

const ErrorSchema = z.object({ error: z.string() });

const ProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  hostname: z.string(),
  port: z.number().nullable(),
  username: z.string().nullable(),
  isActive: z.boolean().nullable(),
  lastHealthCheck: z.string().nullable(),
  healthStatus: z.string().nullable(),
  metadata: z.unknown().nullable(),
  tenantId: z.string(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

const InstanceSchema = z.object({
  id: z.string(),
  subscriptionId: z.string().nullable(),
  providerId: z.string().nullable(),
  serviceName: z.string(),
  serviceType: z.string(),
  remoteId: z.string().nullable(),
  controlPanelUrl: z.string().nullable(),
  username: z.string().nullable(),
  status: z.string().nullable(),
  diskQuota: z.number().nullable(),
  bandwidthQuota: z.number().nullable(),
  lastSync: z.string().nullable(),
  metadata: z.unknown().nullable(),
  tenantId: z.string(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

const TaskSchema = z.object({
  id: z.string(),
  serviceInstanceId: z.string().nullable(),
  providerId: z.string().nullable(),
  operation: z.string(),
  status: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  attemptNumber: z.number().nullable(),
  errorMessage: z.string().nullable(),
  tenantId: z.string(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

const HealthResultSchema = z.object({ healthy: z.boolean(), message: z.string().optional() });

// ── Provider routes ──

const listProvidersRoute = createRoute({
  method: 'get',
  path: '/providers',
  request: {},
  responses: {
    200: { content: { 'application/json': { schema: z.array(ProviderSchema) } }, description: 'Providers' },
  },
});

const createProviderRoute = createRoute({
  method: 'post',
  path: '/providers',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            name: z.string().min(1),
            type: z.string().min(1),
            hostname: z.string().min(1),
            port: z.number().int().optional(),
            username: z.string().optional(),
            apiKey: z.string().optional(),
            apiSecret: z.string().optional(),
            useSSL: z.boolean().optional(),
            verifySSL: z.boolean().optional(),
            config: z.record(z.any()).optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: { content: { 'application/json': { schema: ProviderSchema } }, description: 'Created' },
    404: { content: { 'application/json': { schema: z.object({ error: z.string() }) } }, description: 'Not found' },
  },
});

const getProviderRoute = createRoute({
  method: 'get',
  path: '/providers/{id}',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { content: { 'application/json': { schema: ProviderSchema } }, description: 'Provider' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const updateProviderRoute = createRoute({
  method: 'put',
  path: '/providers/{id}',
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            name: z.string().optional(),
            hostname: z.string().optional(),
            port: z.number().int().optional(),
            username: z.string().optional(),
            apiKey: z.string().optional(),
            apiSecret: z.string().optional(),
            useSSL: z.boolean().optional(),
            verifySSL: z.boolean().optional(),
            isActive: z.boolean().optional(),
            config: z.record(z.any()).optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: { content: { 'application/json': { schema: ProviderSchema } }, description: 'Updated' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const deleteProviderRoute = createRoute({
  method: 'delete',
  path: '/providers/{id}',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }, description: 'Deleted' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const testProviderRoute = createRoute({
  method: 'post',
  path: '/providers/{id}/test',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { content: { 'application/json': { schema: HealthResultSchema } }, description: 'Test result' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

// ── Service instance routes ──

const listInstancesRoute = createRoute({
  method: 'get',
  path: '/instances',
  request: {
    query: z.object({ subscriptionId: z.string().optional() }),
  },
  responses: {
    200: { content: { 'application/json': { schema: z.array(InstanceSchema) } }, description: 'Instances' },
  },
});

const createInstanceRoute = createRoute({
  method: 'post',
  path: '/instances',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            subscriptionId: z.string().uuid().optional(),
            providerId: z.string().uuid(),
            serviceName: z.string().min(1),
            serviceType: z.string().min(1),
            username: z.string().optional(),
            password: z.string().optional(),
            email: z.string().optional(),
            domain: z.string().optional(),
            diskQuota: z.number().int().optional(),
            bandwidthQuota: z.number().int().optional(),
            emailAccounts: z.number().int().optional(),
            databases: z.number().int().optional(),
            subdomains: z.number().int().optional(),
            packageName: z.string().optional(),
            metadata: z.record(z.any()).optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: { content: { 'application/json': { schema: InstanceSchema } }, description: 'Created' },
  },
});

const getInstanceRoute = createRoute({
  method: 'get',
  path: '/instances/{id}',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { content: { 'application/json': { schema: InstanceSchema } }, description: 'Instance' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const deleteInstanceRoute = createRoute({
  method: 'delete',
  path: '/instances/{id}',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }, description: 'Deleted' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const provisionInstanceRoute = createRoute({
  method: 'post',
  path: '/instances/{id}/provision',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { content: { 'application/json': { schema: TaskSchema } }, description: 'Task created' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const suspendInstanceRoute = createRoute({
  method: 'post',
  path: '/instances/{id}/suspend',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { content: { 'application/json': { schema: TaskSchema } }, description: 'Task created' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const terminateInstanceRoute = createRoute({
  method: 'post',
  path: '/instances/{id}/terminate',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { content: { 'application/json': { schema: TaskSchema } }, description: 'Task created' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

// ── Task routes ──

const listTasksRoute = createRoute({
  method: 'get',
  path: '/tasks',
  request: {
    query: z.object({ serviceInstanceId: z.string().optional() }),
  },
  responses: {
    200: { content: { 'application/json': { schema: z.array(TaskSchema) } }, description: 'Tasks' },
  },
});

const getTaskRoute = createRoute({
  method: 'get',
  path: '/tasks/{id}',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { content: { 'application/json': { schema: TaskSchema } }, description: 'Task' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const healthCheckRoute = createRoute({
  method: 'post',
  path: '/health-check',
  request: {},
  responses: {
    200: { content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }, description: 'Health check started' },
  },
});

// ── App ──

export function provisioningRoutes(ctx: ModuleContext) {
  const app = new OpenAPIHono();

  // Providers
  app.openapi(
    { ...listProvidersRoute, middleware: routePerm(ctx, SEED_PERM.providersView) },
    async (c) => {
      const svc = ctx.service<IProvisioningService>('provisioning');
      const tenantId = c.get('tenantId') as string;
      const result = await svc.listProviders(tenantId);
      return c.json(result, 200);
    },
  );

  app.openapi(
    { ...createProviderRoute, middleware: routePerm(ctx, SEED_PERM.providersManage) },
    async (c) => {
      const svc = ctx.service<IProvisioningService>('provisioning');
      const body = c.req.valid('json');
      const tenantId = c.get('tenantId') as string;
      try {
        const provider = await svc.createProvider(body as any, tenantId);
        return c.json(provider, 201);
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : 'Failed' }, 404);
      }
    },
  );

  app.openapi(
    { ...getProviderRoute, middleware: routePerm(ctx, SEED_PERM.providersView) },
    async (c) => {
      const svc = ctx.service<IProvisioningService>('provisioning');
      const { id } = c.req.valid('param');
      const tenantId = c.get('tenantId') as string;
      const result = await svc.getProvider(id, tenantId);
      if (!result) return c.json({ error: 'Provider not found' }, 404);
      return c.json(result, 200);
    },
  );

  app.openapi(
    { ...updateProviderRoute, middleware: routePerm(ctx, SEED_PERM.providersManage) },
    async (c) => {
      const svc = ctx.service<IProvisioningService>('provisioning');
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      const tenantId = c.get('tenantId') as string;
      try {
        const provider = await svc.updateProvider(id, body, tenantId);
        return c.json(provider, 200);
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : 'Not found' }, 404);
      }
    },
  );

  app.openapi(
    { ...deleteProviderRoute, middleware: routePerm(ctx, SEED_PERM.providersManage) },
    async (c) => {
      const svc = ctx.service<IProvisioningService>('provisioning');
      const { id } = c.req.valid('param');
      const tenantId = c.get('tenantId') as string;
      try {
        await svc.deleteProvider(id, tenantId);
        return c.json({ success: true }, 200);
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : 'Not found' }, 404);
      }
    },
  );

  app.openapi(
    { ...testProviderRoute, middleware: routePerm(ctx, SEED_PERM.providersManage) },
    async (c) => {
      const svc = ctx.service<IProvisioningService>('provisioning');
      const { id } = c.req.valid('param');
      const tenantId = c.get('tenantId') as string;
      try {
        const result = await svc.testProviderConnection(id, tenantId);
        return c.json(result, 200);
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : 'Not found' }, 404);
      }
    },
  );

  // Service instances
  app.openapi(
    { ...listInstancesRoute, middleware: routePerm(ctx, SEED_PERM.instancesView) },
    async (c) => {
      const svc = ctx.service<IProvisioningService>('provisioning');
      const q = c.req.valid('query');
      const tenantId = c.get('tenantId') as string;
      const result = await svc.listServiceInstances(tenantId, q.subscriptionId);
      return c.json(result, 200);
    },
  );

  app.openapi(
    { ...createInstanceRoute, middleware: routePerm(ctx, SEED_PERM.instancesManage) },
    async (c) => {
      const svc = ctx.service<IProvisioningService>('provisioning');
      const body = c.req.valid('json');
      const tenantId = c.get('tenantId') as string;
      const instance = await svc.createServiceInstance({
        subscriptionId: body.subscriptionId,
        providerId: body.providerId,
        serviceName: body.serviceName,
        serviceType: body.serviceType,
        metadata: {
          email: body.email,
          domain: body.domain,
          packageName: body.packageName,
          ...body.metadata,
        },
        diskQuota: body.diskQuota,
        bandwidthQuota: body.bandwidthQuota,
        emailAccounts: body.emailAccounts,
        databases: body.databases,
        subdomains: body.subdomains,
      }, tenantId);
      return c.json(instance, 201);
    },
  );

  app.openapi(
    { ...getInstanceRoute, middleware: routePerm(ctx, SEED_PERM.instancesView) },
    async (c) => {
      const svc = ctx.service<IProvisioningService>('provisioning');
      const { id } = c.req.valid('param');
      const tenantId = c.get('tenantId') as string;
      const result = await svc.getServiceInstance(id, tenantId);
      if (!result) return c.json({ error: 'Service instance not found' }, 404);
      return c.json(result, 200);
    },
  );

  app.openapi(
    { ...deleteInstanceRoute, middleware: routePerm(ctx, SEED_PERM.instancesManage) },
    async (c) => {
      const svc = ctx.service<IProvisioningService>('provisioning');
      const { id } = c.req.valid('param');
      const tenantId = c.get('tenantId') as string;
      try {
        await svc.deleteServiceInstance(id, tenantId);
        return c.json({ success: true }, 200);
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : 'Not found' }, 404);
      }
    },
  );

  // Provisioning operations
  app.openapi(
    { ...provisionInstanceRoute, middleware: routePerm(ctx, SEED_PERM.instancesManage) },
    async (c) => {
      const svc = ctx.service<IProvisioningService>('provisioning');
      const { id } = c.req.valid('param');
      const tenantId = c.get('tenantId') as string;
      try {
        const task = await svc.provisionService(id, tenantId);
        return c.json(task, 200);
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : 'Not found' }, 404);
      }
    },
  );

  app.openapi(
    { ...suspendInstanceRoute, middleware: routePerm(ctx, SEED_PERM.instancesManage) },
    async (c) => {
      const svc = ctx.service<IProvisioningService>('provisioning');
      const { id } = c.req.valid('param');
      const tenantId = c.get('tenantId') as string;
      try {
        const task = await svc.suspendService(id, tenantId);
        return c.json(task, 200);
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : 'Not found' }, 404);
      }
    },
  );

  app.openapi(
    { ...terminateInstanceRoute, middleware: routePerm(ctx, SEED_PERM.instancesManage) },
    async (c) => {
      const svc = ctx.service<IProvisioningService>('provisioning');
      const { id } = c.req.valid('param');
      const tenantId = c.get('tenantId') as string;
      try {
        const task = await svc.terminateService(id, tenantId);
        return c.json(task, 200);
      } catch (e) {
        return c.json({ error: e instanceof Error ? e.message : 'Not found' }, 404);
      }
    },
  );

  // Tasks
  app.openapi(
    { ...listTasksRoute, middleware: routePerm(ctx, SEED_PERM.instancesView) },
    async (c) => {
      const svc = ctx.service<IProvisioningService>('provisioning');
      const q = c.req.valid('query');
      const tenantId = c.get('tenantId') as string;
      const tasks = await svc.listTasks(tenantId, q.serviceInstanceId);
      return c.json(tasks, 200);
    },
  );

  app.openapi(
    { ...getTaskRoute, middleware: routePerm(ctx, SEED_PERM.instancesView) },
    async (c) => {
      const svc = ctx.service<IProvisioningService>('provisioning');
      const { id } = c.req.valid('param');
      const tenantId = c.get('tenantId') as string;
      const task = await svc.getTask(id, tenantId);
      if (!task) return c.json({ error: 'Task not found' }, 404);
      return c.json(task, 200);
    },
  );

  app.openapi(
    { ...healthCheckRoute, middleware: routePerm(ctx, SEED_PERM.providersManage) },
    async (c) => {
      const svc = ctx.service<IProvisioningService>('provisioning');
      const tenantId = c.get('tenantId') as string;
      void svc.runHealthCheck(tenantId);
      return c.json({ success: true }, 200);
    },
  );

  return app;
}
