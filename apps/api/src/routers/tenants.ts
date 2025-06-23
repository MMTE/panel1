import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc/trpc.js';
import { tenants, users } from '../db/schema/index.js';
import { eq, and, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

export const tenantsRouter = router({
  getCurrent: protectedProcedure
    .query(async ({ ctx }) => {
      if (!ctx.tenantId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No tenant context available',
        });
      }

      const [tenant] = await ctx.db
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

  getAll: adminProcedure
    .query(async ({ ctx }) => {
      // Super admin can see all tenants
      if (ctx.user.role === 'ADMIN' && !ctx.tenantId) {
        return await ctx.db
          .select()
          .from(tenants)
          .orderBy(desc(tenants.createdAt));
      }

      // Tenant admin can only see their own tenant
      if (ctx.tenantId) {
        const [tenant] = await ctx.db
          .select()
          .from(tenants)
          .where(eq(tenants.id, ctx.tenantId))
          .limit(1);

        return tenant ? [tenant] : [];
      }

      return [];
    }),

  getById: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
    }))
    .query(async ({ input, ctx }) => {
      // Super admin can see any tenant
      if (ctx.user.role === 'ADMIN' && !ctx.tenantId) {
        const [tenant] = await ctx.db
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
      }

      // Tenant admin can only see their own tenant
      if (ctx.tenantId && ctx.tenantId === input.id) {
        const [tenant] = await ctx.db
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
      }

      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You do not have permission to access this tenant',
      });
    }),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
      domain: z.string().optional(),
      settings: z.object({
        features: z.object({
          plugins: z.boolean().optional(),
          multi_currency: z.boolean().optional(),
          custom_branding: z.boolean().optional(),
        }).optional(),
        limits: z.object({
          max_users: z.number().optional(),
          max_clients: z.number().optional(),
          max_storage: z.number().optional(),
        }).optional(),
      }).optional(),
      branding: z.object({
        primary_color: z.string().optional(),
        secondary_color: z.string().optional(),
        logo_url: z.string().optional(),
        company_name: z.string().optional(),
        favicon_url: z.string().optional(),
        custom_css: z.string().optional(),
      }).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Only super admin can create tenants
      if (ctx.user.role !== 'ADMIN' || ctx.tenantId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only super admins can create tenants',
        });
      }

      // Check if slug is already taken
      const [existingTenant] = await ctx.db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, input.slug))
        .limit(1);

      if (existingTenant) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Tenant slug already exists',
        });
      }

      // Create tenant
      const [newTenant] = await ctx.db
        .insert(tenants)
        .values({
          name: input.name,
          slug: input.slug,
          domain: input.domain,
          settings: input.settings || {},
          branding: input.branding || {},
        })
        .returning();

      return newTenant;
    }),

  update: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).optional(),
      domain: z.string().optional(),
      settings: z.object({
        features: z.object({
          plugins: z.boolean().optional(),
          multi_currency: z.boolean().optional(),
          custom_branding: z.boolean().optional(),
        }).optional(),
        limits: z.object({
          max_users: z.number().optional(),
          max_clients: z.number().optional(),
          max_storage: z.number().optional(),
        }).optional(),
      }).optional(),
      branding: z.object({
        primary_color: z.string().optional(),
        secondary_color: z.string().optional(),
        logo_url: z.string().optional(),
        company_name: z.string().optional(),
        favicon_url: z.string().optional(),
        custom_css: z.string().optional(),
      }).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input;

      // Super admin can update any tenant
      if (ctx.user.role === 'ADMIN' && !ctx.tenantId) {
        const [updatedTenant] = await ctx.db
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
      }

      // Tenant admin can only update their own tenant
      if (ctx.tenantId && ctx.tenantId === id) {
        const [updatedTenant] = await ctx.db
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
      }

      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You do not have permission to update this tenant',
      });
    }),
});