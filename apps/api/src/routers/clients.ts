import { z } from 'zod';
import { router, protectedProcedure, adminProcedure, tenantProcedure } from '../trpc/trpc.js';
import { clients, users } from '../db/schema/index.js';
import { eq, and, desc, count, ilike, or } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

export const clientsRouter = router({
  getAll: tenantProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(10),
      offset: z.number().min(0).default(0),
      search: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const { limit, offset, search } = input;

      let whereConditions = [eq(clients.tenantId, ctx.tenantId)];

      if (search) {
        whereConditions.push(
          or(
            ilike(clients.companyName, `%${search}%`),
            ilike(users.email, `%${search}%`),
            ilike(users.firstName, `%${search}%`),
            ilike(users.lastName, `%${search}%`)
          )!
        );
      }

      const allClients = await ctx.db
        .select({
          id: clients.id,
          companyName: clients.companyName,
          address: clients.address,
          city: clients.city,
          state: clients.state,
          zipCode: clients.zipCode,
          country: clients.country,
          phone: clients.phone,
          status: clients.status,
          createdAt: clients.createdAt,
          updatedAt: clients.updatedAt,
          user: {
            id: users.id,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
          },
        })
        .from(clients)
        .leftJoin(users, eq(clients.userId, users.id))
        .where(and(...whereConditions))
        .orderBy(desc(clients.createdAt))
        .limit(limit)
        .offset(offset);

      const [totalResult] = await ctx.db
        .select({ count: count() })
        .from(clients)
        .leftJoin(users, eq(clients.userId, users.id))
        .where(and(...whereConditions));

      return {
        clients: allClients,
        total: totalResult.count,
        hasMore: offset + limit < totalResult.count,
      };
    }),

  getById: tenantProcedure
    .input(z.object({
      id: z.string().uuid(),
    }))
    .query(async ({ input, ctx }) => {
      const [client] = await ctx.db
        .select({
          id: clients.id,
          companyName: clients.companyName,
          address: clients.address,
          city: clients.city,
          state: clients.state,
          zipCode: clients.zipCode,
          country: clients.country,
          phone: clients.phone,
          status: clients.status,
          createdAt: clients.createdAt,
          updatedAt: clients.updatedAt,
          user: {
            id: users.id,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
            isActive: users.isActive,
          },
        })
        .from(clients)
        .leftJoin(users, eq(clients.userId, users.id))
        .where(and(
          eq(clients.id, input.id),
          eq(clients.tenantId, ctx.tenantId)
        ))
        .limit(1);

      if (!client) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Client not found',
        });
      }

      return client;
    }),

  create: adminProcedure
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
    .mutation(async ({ input, ctx }) => {
      const { email, firstName, lastName, ...clientData } = input;

      // Create user in Supabase Auth
      const { data: authData, error: authError } = await ctx.supabase.auth.admin.createUser({
        email,
        password: Math.random().toString(36).slice(-8), // Temporary password
        email_confirm: true,
      });

      if (authError || !authData.user) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create user account',
        });
      }

      // Create user in our database
      const [newUser] = await ctx.db
        .insert(users)
        .values({
          authUserId: authData.user.id,
          email,
          firstName,
          lastName,
          role: 'CLIENT',
          tenantId: ctx.tenantId,
        })
        .returning();

      // Create client
      const [newClient] = await ctx.db
        .insert(clients)
        .values({
          ...clientData,
          userId: newUser.id,
          tenantId: ctx.tenantId,
        })
        .returning();

      return {
        ...newClient,
        user: {
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
        },
      };
    }),

  update: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      companyName: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipCode: z.string().optional(),
      country: z.string().optional(),
      phone: z.string().optional(),
      status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input;

      const [updatedClient] = await ctx.db
        .update(clients)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(and(
          eq(clients.id, id),
          eq(clients.tenantId, ctx.tenantId)
        ))
        .returning();

      if (!updatedClient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Client not found',
        });
      }

      return updatedClient;
    }),
});