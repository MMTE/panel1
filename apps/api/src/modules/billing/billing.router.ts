import { z } from 'zod';
import { router, protectedProcedure } from '../../trpc/trpc.js';
import { prisma } from '../../db/prisma.js';

export const billingRouter = router({
  getPlans: protectedProcedure
    .query(async () => {
      const plans = await prisma.plan.findMany({
        where: { isActive: true },
        orderBy: { price: 'asc' },
      });

      return plans;
    }),

  getInvoices: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(10),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const { limit, offset } = input;

      const invoices = await prisma.invoice.findMany({
        where: { userId: ctx.user.id },
        include: {
          client: true,
          items: true,
          payments: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      const total = await prisma.invoice.count({
        where: { userId: ctx.user.id },
      });

      return {
        invoices,
        total,
        hasMore: offset + limit < total,
      };
    }),

  getInvoice: protectedProcedure
    .input(z.object({
      id: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const invoice = await prisma.invoice.findFirst({
        where: {
          id: input.id,
          userId: ctx.user.id,
        },
        include: {
          client: true,
          items: true,
          payments: true,
          subscription: {
            include: {
              plan: true,
            },
          },
        },
      });

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      return invoice;
    }),
});