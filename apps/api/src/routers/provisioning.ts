import { z } from 'zod';
import { router, protectedProcedure } from '../trpc/trpc';
import { TRPCError } from '@trpc/server';
import { ProvisioningManager } from '../lib/provisioning/ProvisioningManager';
import { db } from '../db';
import { 
  provisioningProviders, 
  serviceInstances, 
  provisioningTasks,
  subscriptions 
} from '../db/schema';
import { eq, and } from 'drizzle-orm';

const provisioningManager = ProvisioningManager.getInstance();

// Input validation schemas
const createProviderSchema = z.object({
  name: z.string().min(1, 'Provider name is required'),
  type: z.enum(['cpanel', 'plesk', 'docker', 'kubernetes', 'custom', 'whm', 'directadmin']),
  hostname: z.string().min(1, 'Hostname is required'),
  port: z.number().min(1).max(65535).default(2087),
  username: z.string().optional(),
  apiKey: z.string().min(1, 'API Key is required'),
  apiSecret: z.string().optional(),
  useSSL: z.boolean().default(true),
  verifySSL: z.boolean().default(true),
  config: z.record(z.any()).optional(),
});

const createServiceInstanceSchema = z.object({
  subscriptionId: z.string().uuid(),
  providerId: z.string().uuid(),
  serviceName: z.string().min(1, 'Service name is required'),
  serviceType: z.string().min(1, 'Service type is required'),
  parameters: z.object({
    serviceName: z.string(),
    serviceType: z.string(),
    username: z.string().optional(),
    password: z.string().optional(),
    email: z.string().email().optional(),
    domain: z.string().optional(),
    diskQuota: z.number().optional(),
    bandwidthQuota: z.number().optional(),
    emailAccounts: z.number().optional(),
    databases: z.number().optional(),
    subdomains: z.number().optional(),
    packageName: z.string().optional(),
    planId: z.string().optional(),
    customFields: z.record(z.any()).optional(),
    metadata: z.record(z.any()).optional(),
  }),
});

const serviceOperationSchema = z.object({
  serviceInstanceId: z.string().uuid(),
  parameters: z.object({
    serviceName: z.string().optional(),
    serviceType: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    email: z.string().optional(),
    domain: z.string().optional(),
    diskQuota: z.number().optional(),
    bandwidthQuota: z.number().optional(),
    emailAccounts: z.number().optional(),
    databases: z.number().optional(),
    subdomains: z.number().optional(),
    packageName: z.string().optional(),
    customFields: z.record(z.any()).optional(),
    metadata: z.record(z.any()).optional(),
  }).optional(),
});

export const provisioningRouter = router({
  // Provider management
  createProvider: protectedProcedure
    .input(createProviderSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        await provisioningManager.initialize();
        
        const providerId = await provisioningManager.createProvider({
          ...input,
          tenantId: ctx.user.tenantId,
        });

        return { success: true, providerId };
      } catch (error) {
        console.error('Failed to create provider:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create provider',
        });
      }
    }),

  listProviders: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        const providers = await db
          .select()
          .from(provisioningProviders)
          .where(eq(provisioningProviders.tenantId, ctx.user.tenantId));

        return providers;
      } catch (error) {
        console.error('Failed to list providers:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to list providers',
        });
      }
    }),

  getProvider: protectedProcedure
    .input(z.object({ providerId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      try {
        const provider = await db
          .select()
          .from(provisioningProviders)
          .where(
            and(
              eq(provisioningProviders.id, input.providerId),
              eq(provisioningProviders.tenantId, ctx.user.tenantId)
            )
          )
          .limit(1);

        if (!provider.length) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Provider not found',
          });
        }

        return provider[0];
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        console.error('Failed to get provider:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get provider',
        });
      }
    }),

  testProvider: protectedProcedure
    .input(z.object({ providerId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      try {
        await provisioningManager.initialize();
        
        const result = await provisioningManager.performHealthCheck(input.providerId);
        
        return {
          success: result.healthy,
          status: result.status,
          message: result.message,
          responseTime: result.responseTime,
        };
      } catch (error) {
        console.error('Failed to test provider:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to test provider',
        });
      }
    }),

  // Service instance management
  createServiceInstance: protectedProcedure
    .input(createServiceInstanceSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        await provisioningManager.initialize();

        // Verify subscription belongs to tenant
        const subscription = await db
          .select()
          .from(subscriptions)
          .where(
            and(
              eq(subscriptions.id, input.subscriptionId),
              eq(subscriptions.tenantId, ctx.user.tenantId)
            )
          )
          .limit(1);

        if (!subscription.length) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Subscription not found',
          });
        }

        // Create service instance record
        const [serviceInstance] = await db
          .insert(serviceInstances)
          .values({
            subscriptionId: input.subscriptionId,
            providerId: input.providerId,
            serviceName: input.serviceName,
            serviceType: input.serviceType,
            status: 'pending',
            tenantId: ctx.user.tenantId,
          })
          .returning();

        // Start provisioning process
        const taskId = await provisioningManager.provision(
          serviceInstance.id,
          input.providerId,
          input.parameters,
          ctx.user.tenantId
        );

        return {
          success: true,
          serviceInstanceId: serviceInstance.id,
          taskId,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        console.error('Failed to create service instance:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create service instance',
        });
      }
    }),

  listServiceInstances: protectedProcedure
    .input(z.object({
      subscriptionId: z.string().uuid().optional(),
      providerId: z.string().uuid().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      try {
        let query = db
          .select({
            id: serviceInstances.id,
            subscriptionId: serviceInstances.subscriptionId,
            providerId: serviceInstances.providerId,
            serviceName: serviceInstances.serviceName,
            serviceType: serviceInstances.serviceType,
            remoteId: serviceInstances.remoteId,
            controlPanelUrl: serviceInstances.controlPanelUrl,
            username: serviceInstances.username,
            status: serviceInstances.status,
            lastSync: serviceInstances.lastSync,
            createdAt: serviceInstances.createdAt,
            updatedAt: serviceInstances.updatedAt,
            provider: {
              id: provisioningProviders.id,
              name: provisioningProviders.name,
              type: provisioningProviders.type,
              hostname: provisioningProviders.hostname,
            }
          })
          .from(serviceInstances)
          .leftJoin(provisioningProviders, eq(serviceInstances.providerId, provisioningProviders.id))
          .where(eq(serviceInstances.tenantId, ctx.user.tenantId));

        if (input.subscriptionId) {
          query = query.where(eq(serviceInstances.subscriptionId, input.subscriptionId));
        }

        if (input.providerId) {
          query = query.where(eq(serviceInstances.providerId, input.providerId));
        }

        if (input.status) {
          query = query.where(eq(serviceInstances.status, input.status));
        }

        const instances = await query;
        return instances;
      } catch (error) {
        console.error('Failed to list service instances:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to list service instances',
        });
      }
    }),

  getServiceInstance: protectedProcedure
    .input(z.object({ serviceInstanceId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      try {
        const instance = await db
          .select()
          .from(serviceInstances)
          .where(
            and(
              eq(serviceInstances.id, input.serviceInstanceId),
              eq(serviceInstances.tenantId, ctx.user.tenantId)
            )
          )
          .limit(1);

        if (!instance.length) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Service instance not found',
          });
        }

        return instance[0];
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        console.error('Failed to get service instance:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get service instance',
        });
      }
    }),

  // Service operations
  suspendService: protectedProcedure
    .input(serviceOperationSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        await provisioningManager.initialize();

        // Get service instance
        const instance = await db
          .select()
          .from(serviceInstances)
          .where(
            and(
              eq(serviceInstances.id, input.serviceInstanceId),
              eq(serviceInstances.tenantId, ctx.user.tenantId)
            )
          )
          .limit(1);

        if (!instance.length) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Service instance not found',
          });
        }

        const serviceInstance = instance[0];
        const parameters = {
          serviceName: serviceInstance.serviceName,
          serviceType: serviceInstance.serviceType,
          username: serviceInstance.username || undefined,
          ...input.parameters,
        };

        const taskId = await provisioningManager.suspend(
          input.serviceInstanceId,
          serviceInstance.providerId,
          parameters,
          ctx.user.tenantId
        );

        return { success: true, taskId };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        console.error('Failed to suspend service:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to suspend service',
        });
      }
    }),

  unsuspendService: protectedProcedure
    .input(serviceOperationSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        await provisioningManager.initialize();

        const instance = await db
          .select()
          .from(serviceInstances)
          .where(
            and(
              eq(serviceInstances.id, input.serviceInstanceId),
              eq(serviceInstances.tenantId, ctx.user.tenantId)
            )
          )
          .limit(1);

        if (!instance.length) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Service instance not found',
          });
        }

        const serviceInstance = instance[0];
        const parameters = {
          serviceName: serviceInstance.serviceName,
          serviceType: serviceInstance.serviceType,
          username: serviceInstance.username || undefined,
          ...input.parameters,
        };

        const taskId = await provisioningManager.unsuspend(
          input.serviceInstanceId,
          serviceInstance.providerId,
          parameters,
          ctx.user.tenantId
        );

        return { success: true, taskId };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        console.error('Failed to unsuspend service:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to unsuspend service',
        });
      }
    }),

  terminateService: protectedProcedure
    .input(serviceOperationSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        await provisioningManager.initialize();

        const instance = await db
          .select()
          .from(serviceInstances)
          .where(
            and(
              eq(serviceInstances.id, input.serviceInstanceId),
              eq(serviceInstances.tenantId, ctx.user.tenantId)
            )
          )
          .limit(1);

        if (!instance.length) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Service instance not found',
          });
        }

        const serviceInstance = instance[0];
        const parameters = {
          serviceName: serviceInstance.serviceName,
          serviceType: serviceInstance.serviceType,
          username: serviceInstance.username || undefined,
          ...input.parameters,
        };

        const taskId = await provisioningManager.terminate(
          input.serviceInstanceId,
          serviceInstance.providerId,
          parameters,
          ctx.user.tenantId
        );

        return { success: true, taskId };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        console.error('Failed to terminate service:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to terminate service',
        });
      }
    }),

  // Task monitoring
  getProvisioningTasks: protectedProcedure
    .input(z.object({
      serviceInstanceId: z.string().uuid().optional(),
      providerId: z.string().uuid().optional(),
      status: z.enum(['pending', 'in_progress', 'completed', 'failed', 'cancelled']).optional(),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ input, ctx }) => {
      try {
        let query = db
          .select()
          .from(provisioningTasks)
          .where(eq(provisioningTasks.tenantId, ctx.user.tenantId))
          .orderBy(provisioningTasks.createdAt)
          .limit(input.limit);

        if (input.serviceInstanceId) {
          query = query.where(eq(provisioningTasks.serviceInstanceId, input.serviceInstanceId));
        }

        if (input.providerId) {
          query = query.where(eq(provisioningTasks.providerId, input.providerId));
        }

        if (input.status) {
          query = query.where(eq(provisioningTasks.status, input.status));
        }

        const tasks = await query;
        return tasks;
      } catch (error) {
        console.error('Failed to get provisioning tasks:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get provisioning tasks',
        });
      }
    }),

  getTask: protectedProcedure
    .input(z.object({ taskId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      try {
        const task = await db
          .select()
          .from(provisioningTasks)
          .where(
            and(
              eq(provisioningTasks.id, input.taskId),
              eq(provisioningTasks.tenantId, ctx.user.tenantId)
            )
          )
          .limit(1);

        if (!task.length) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Task not found',
          });
        }

        return task[0];
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        console.error('Failed to get task:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get task',
        });
      }
    }),
}); 