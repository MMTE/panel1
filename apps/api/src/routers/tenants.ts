import { z } from 'zod';
import { router, adminProcedure, protectedProcedure } from '../trpc/trpc.js';
import { db, tenants, users } from '../db/index.js';
import { eq, and, desc, count } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

export const tenantsRouter = router({
  // Get all tenants (super admin only)
  getAll: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(10),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const { limit, offset } = input;

      const allTenants = await db
        .select({
          id: tenants.id,
          name: tenants.name,
          slug: tenants.slug,
          domain: tenants.domain,
          isActive: tenants.isActive,
          createdAt: tenants.createdAt,
          updatedAt: tenants.updatedAt,
        })
        .from(tenants)
        .orderBy(desc(tenants.createdAt))
        .limit(limit)
        .offset(offset);

      const [totalResult] = await db
        .select({ count: count() })
        .from(tenants);

      return {
        tenants: allTenants,
        total: totalResult.count,
        hasMore: offset + limit < totalResult.count,
      };
    }),

  // Get current tenant details
  getCurrent: protectedProcedure
    .query(async ({ ctx }) => {
      if (!ctx.tenantId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No tenant context available',
        });
      }

      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, ctx.tenantId))
        .limit(1);

      if (!tenant) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tenant not found',
        });
      }

      return tenant;
    }),

  // Get tenant by ID
  getById: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
    }))
    .query(async ({ input }) => {
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, input.id))
        .limit(1);

      if (!tenant) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tenant not found',
        });
      }

      return tenant;
    }),

  // Create new tenant (super admin only)
  create: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
      domain: z.string().optional(),
      settings: z.record(z.any()).optional(),
      branding: z.record(z.any()).optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const [newTenant] = await db
          .insert(tenants)
          .values({
            ...input,
            settings: input.settings || {},
            branding: input.branding || {},
          })
          .returning();

        return newTenant;
      } catch (error: any) {
        if (error.code === '23505') { // Unique constraint violation
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Tenant slug already exists',
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create tenant',
        });
      }
    }),

  // Update tenant
  update: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).optional(),
      domain: z.string().optional(),
      settings: z.record(z.any()).optional(),
      branding: z.record(z.any()).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...updateData } = input;

      const [updatedTenant] = await db
        .update(tenants)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, id))
        .returning();

      if (!updatedTenant) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tenant not found',
        });
      }

      return updatedTenant;
    }),

  // Update current tenant settings (tenant admin)
  updateSettings: adminProcedure
    .input(z.object({
      settings: z.record(z.any()).optional(),
      branding: z.record(z.any()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.tenantId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No tenant context available',
        });
      }

      const [updatedTenant] = await db
        .update(tenants)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, ctx.tenantId))
        .returning();

      if (!updatedTenant) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tenant not found',
        });
      }

      return updatedTenant;
    }),

  // Delete tenant (super admin only)
  delete: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
    }))
    .mutation(async ({ input }) => {
      // Check if tenant has users
      const [userCount] = await db
        .select({ count: count() })
        .from(users)
        .where(eq(users.tenantId, input.id));

      if (userCount.count > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Cannot delete tenant with existing users',
        });
      }

      const [deletedTenant] = await db
        .delete(tenants)
        .where(eq(tenants.id, input.id))
        .returning({ id: tenants.id });

      if (!deletedTenant) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tenant not found',
        });
      }

      return { success: true };
    }),

  // Get tenant statistics
  getStats: adminProcedure
    .query(async ({ ctx }) => {
      if (!ctx.tenantId) {
        // Super admin - get all tenant stats
        const [totalTenants] = await db
          .select({ count: count() })
          .from(tenants);

        const [activeTenants] = await db
          .select({ count: count() })
          .from(tenants)
          .where(eq(tenants.isActive, true));

        return {
          total: totalTenants.count,
          active: activeTenants.count,
          inactive: totalTenants.count - activeTenants.count,
        };
      } else {
        // Tenant admin - get current tenant stats
        const [totalUsers] = await db
          .select({ count: count() })
          .from(users)
          .where(eq(users.tenantId, ctx.tenantId));

        const [activeUsers] = await db
          .select({ count: count() })
          .from(users)
          .where(and(
            eq(users.tenantId, ctx.tenantId),
            eq(users.isActive, true)
          ));

        return {
          users: {
            total: totalUsers.count,
            active: activeUsers.count,
            inactive: totalUsers.count - activeUsers.count,
          },
        };
      }
    }),

  // Toggle tenant active status (super admin only)
  toggleStatus: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
    }))
    .mutation(async ({ input }) => {
      // Get current status
      const [currentTenant] = await db
        .select({ isActive: tenants.isActive })
        .from(tenants)
        .where(eq(tenants.id, input.id))
        .limit(1);

      if (!currentTenant) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Tenant not found',
        });
      }

      const [updatedTenant] = await db
        .update(tenants)
        .set({
          isActive: !currentTenant.isActive,
          updatedAt: new Date(),
        })
        .where(eq(tenants.id, input.id))
        .returning();

      return updatedTenant;
    }),
});