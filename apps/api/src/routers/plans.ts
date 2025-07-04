import { z } from 'zod';
import { router, publicProcedure, protectedProcedure, adminProcedure, tenantProcedure } from '../trpc/trpc.js';
import { db, plans, subscriptions } from '../db/index.js';
import { eq, and, desc, count, asc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

export const plansRouter = router({
  getAll: protectedProcedure
    .input(z.object({
      activeOnly: z.boolean().default(true),
    }))
    .query(async ({ input, ctx }) => {
      // Ensure tenant context
      if (!ctx.tenantId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Tenant context is required',
        });
      }

      try {
        const conditions = [
          eq(plans.tenantId, ctx.tenantId),
          ...(input.activeOnly ? [eq(plans.isActive, true)] : []),
        ];

        const allPlans = await db
          .select()
          .from(plans)
          .where(and(...conditions))
          .orderBy(plans.price);

        return allPlans;
      } catch (error) {
        console.error('Error in plans.getAll:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred while fetching plans',
          cause: error,
                 });
       }
    }),

  getById: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
    }))
    .query(async ({ input, ctx }) => {
      // Ensure tenant context
      if (!ctx.tenantId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Tenant context is required',
        });
      }

      try {
        const [plan] = await db
          .select()
          .from(plans)
          .where(and(
            eq(plans.id, input.id),
            eq(plans.tenantId, ctx.tenantId)
          ))
          .limit(1);

        if (!plan) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Plan not found',
          });
        }

        return plan;
      } catch (error) {
        console.error('Error in plans.getById:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred while fetching plan',
          cause: error,
        });
      }
    }),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      price: z.string().regex(/^\d+(\.\d{1,2})?$/),
      currency: z.string().default('USD'),
      interval: z.enum(['MONTHLY', 'YEARLY', 'WEEKLY', 'DAILY']),
      features: z.record(z.any()).optional(),
      trialPeriodDays: z.number().int().min(0).default(0),
      setupFee: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'),
    }))
    .mutation(async ({ input, ctx }) => {
      const [newPlan] = await db
        .insert(plans)
        .values({
          ...input,
          tenantId: ctx.tenantId!,
        })
        .returning();

      return newPlan;
    }),

  update: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      price: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
      currency: z.string().optional(),
      interval: z.enum(['MONTHLY', 'YEARLY', 'WEEKLY', 'DAILY']).optional(),
      isActive: z.boolean().optional(),
      features: z.record(z.any()).optional(),
      trialPeriodDays: z.number().int().min(0).optional(),
      setupFee: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input;

      const conditions = [
        eq(plans.id, id),
        ...(ctx.tenantId ? [eq(plans.tenantId, ctx.tenantId)] : []),
      ];

      const [updatedPlan] = await db
        .update(plans)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(and(...conditions))
        .returning();

      if (!updatedPlan) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Plan not found',
        });
      }

      return updatedPlan;
    }),

  delete: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
    }))
    .mutation(async ({ input, ctx }) => {
      const conditions = [
        eq(plans.id, input.id),
        ...(ctx.tenantId ? [eq(plans.tenantId, ctx.tenantId)] : []),
      ];

      const [deletedPlan] = await db
        .delete(plans)
        .where(and(...conditions))
        .returning({ id: plans.id });

      if (!deletedPlan) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Plan not found',
        });
      }

      return { success: true };
    }),
});