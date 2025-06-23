import { z } from 'zod';
import { router, protectedProcedure, adminProcedure, tenantProcedure } from '../trpc/trpc.js';
import { plans } from '../db/schema/index.js';
import { eq, and, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

export const plansRouter = router({
  getAll: protectedProcedure
    .input(z.object({
      activeOnly: z.boolean().default(true),
    }))
    .query(async ({ input, ctx }) => {
      const conditions = [
        ...(ctx.tenantId ? [eq(plans.tenantId, ctx.tenantId)] : []),
        ...(input.activeOnly ? [eq(plans.isActive, true)] : []),
      ];

      const allPlans = await ctx.db
        .select()
        .from(plans)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(plans.price);

      return allPlans;
    }),

  getById: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
    }))
    .query(async ({ input, ctx }) => {
      const conditions = [
        eq(plans.id, input.id),
        ...(ctx.tenantId ? [eq(plans.tenantId, ctx.tenantId)] : []),
      ];

      const [plan] = await ctx.db
        .select()
        .from(plans)
        .where(and(...conditions))
        .limit(1);

      if (!plan) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Plan not found',
        });
      }

      return plan;
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
      const [newPlan] = await ctx.db
        .insert(plans)
        .values({
          ...input,
          tenantId: ctx.tenantId,
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

      const [updatedPlan] = await ctx.db
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

      const [deletedPlan] = await ctx.db
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