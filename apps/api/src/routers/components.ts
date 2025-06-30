import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc/trpc';
import { ComponentManagementService } from '../lib/components/ComponentManagementService';
import { ComponentLifecycleService } from '../lib/components/ComponentLifecycleService';
import { TRPCError } from '@trpc/server';

const componentManagementService = ComponentManagementService.getInstance();

export const componentsRouter = router({
  // Check component health
  checkHealth: adminProcedure
    .input(z.object({
      componentId: z.string(),
      providerKey: z.string()
    }))
    .query(async ({ input }) => {
      try {
        const lifecycleService = ComponentLifecycleService.getInstance();
        const handler = lifecycleService.getHandler(input.providerKey);
        
        if (!handler) {
          return {
            status: 'down' as const,
            message: 'Handler not found',
            lastChecked: new Date().toISOString()
          };
        }
        
        // Check if handler implements health check
        if ('healthCheck' in handler && typeof handler.healthCheck === 'function') {
          const healthResult = await handler.healthCheck();
          return {
            status: healthResult.healthy ? 'healthy' as const : 'degraded' as const,
            message: healthResult.message || 'Health check completed',
            lastChecked: new Date().toISOString(),
            details: healthResult.details
          };
        }
        
        // If no health check method, assume healthy if handler exists
        return {
          status: 'healthy' as const,
          message: 'Handler available (no health check implemented)',
          lastChecked: new Date().toISOString()
        };
      } catch (error) {
        return {
          status: 'down' as const,
          message: error instanceof Error ? error.message : 'Unknown error',
          lastChecked: new Date().toISOString()
        };
      }
    }),

  // Restart a component
  restart: protectedProcedure
    .input(z.object({
      componentId: z.string().uuid(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await componentManagementService.restartComponent(
          input.componentId,
          ctx.tenantId!
        );
        return { success: result };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to restart component',
        });
      }
    }),

  // Update component configuration
  updateConfiguration: protectedProcedure
    .input(z.object({
      componentId: z.string().uuid(),
      configuration: z.record(z.any()),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await componentManagementService.updateConfiguration(
          input.componentId,
          ctx.tenantId!,
          input.configuration
        );
        return { success: result };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update component configuration',
        });
      }
    }),

  // Scale component
  scale: protectedProcedure
    .input(z.object({
      componentId: z.string().uuid(),
      quantity: z.number().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await componentManagementService.scaleComponent(
          input.componentId,
          ctx.tenantId!,
          input.quantity
        );
        return { success: result };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to scale component',
        });
      }
    }),

  // Get component status
  getStatus: protectedProcedure
    .input(z.object({
      componentId: z.string().uuid(),
    }))
    .query(async ({ input, ctx }) => {
      try {
        return await componentManagementService.getComponentStatus(
          input.componentId,
          ctx.tenantId!
        );
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get component status',
        });
      }
    }),
}); 