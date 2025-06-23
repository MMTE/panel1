import { z } from 'zod';
import { router, protectedProcedure } from '../../trpc/trpc.js';
import { prisma } from '../../db/prisma.js';

export const clientRouter = router({
  getClients: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(10),
      offset: z.number().min(0).default(0),
      search: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { limit, offset, search } = input;

      const where = {
        userId: ctx.user.id,
        ...(search && {
          OR: [
            { companyName: { contains: search, mode: 'insensitive' as const } },
            { user: { email: { contains: search, mode: 'insensitive' as const } } },
          ],
        }),
      };

      const clients = await prisma.client.findMany({
        where,
        include: {
          user: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          _count: {
            select: {
              invoices: true,
              subscriptions: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      const total = await prisma.client.count({ where });

      return {
        clients,
        total,
        hasMore: offset + limit < total,
      };
    }),

  getClient: protectedProcedure
    .input(z.object({
      id: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const client = await prisma.client.findFirst({
        where: {
          id: input.id,
          userId: ctx.user.id,
        },
        include: {
          user: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
              isActive: true,
            },
          },
          invoices: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
          subscriptions: {
            include: {
              plan: true,
            },
          },
        },
      });

      if (!client) {
        throw new Error('Client not found');
      }

      return client;
    }),

  createClient: protectedProcedure
    .input(z.object({
      email: z.string().email(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      companyName: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipCode: z.string().optional(),
      country: z.string().optional(),
      phone: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { email, firstName, lastName, ...clientData } = input;

      // Create user first
      const user = await prisma.user.create({
        data: {
          email,
          firstName,
          lastName,
          password: 'temp-password', // Should be replaced with proper password generation
          role: 'CLIENT',
        },
      });

      // Create client
      const client = await prisma.client.create({
        data: {
          ...clientData,
          userId: user.id,
        },
        include: {
          user: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      return client;
    }),
});