import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context';
import { permissionManager, type ResourceContext, ResourceType } from '../lib/auth/PermissionManager';
import { createErrorHandlingMiddleware } from '../lib/middleware/errorHandler';
import { logger } from '../lib/logging/Logger';

// Initialize tRPC
const t = initTRPC.context<Context>().create();

// Create error handling middleware
const errorHandlingMiddleware = createErrorHandlingMiddleware();

// Export reusable router and procedure helpers
export const router = t.router;
export const publicProcedure = t.procedure.use(errorHandlingMiddleware);

// Protected procedure that requires authentication
export const protectedProcedure = t.procedure
  .use(errorHandlingMiddleware)
  .use(({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'You must be logged in to access this resource',
      });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  });

// Admin procedure that requires admin role
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'ADMIN' && ctx.user.role !== 'SUPER_ADMIN') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You must be an admin to access this resource',
    });
  }
  return next();
});

// Tenant procedure that requires tenant context
export const tenantProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.tenantId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Tenant context is required',
    });
  }
  return next();
});

// Permission-based middleware creator
export function requirePermission(
  permission: string,
  getResourceContext?: (ctx: Context & { input: any }) => ResourceContext | undefined
) {
  return protectedProcedure.use(async ({ ctx, next }) => {
    const resourceContext = getResourceContext?.(ctx as Context & { input: any });
    
    // Convert user to UserPermissionContext
    const userContext = {
      userId: ctx.user.id,
      role: ctx.user.role as any,
      tenantId: ctx.user.tenantId || undefined,
      clientId: ctx.user.clientId || undefined,
    };
    
    const hasPermission = await permissionManager.hasPermission(
      userContext,
      permission,
      resourceContext
    );

    if (!hasPermission) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `You don't have permission to perform this action: ${permission}`,
      });
    }

    return next();
  });
}

// Helper function to create permission-based procedures
export const createPermissionProcedure = (permission: string) =>
  requirePermission(permission);