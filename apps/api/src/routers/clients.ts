import { z } from 'zod';
import { router, protectedProcedure, adminProcedure, tenantProcedure } from '../trpc/trpc.js';
import { db, clients, users } from '../db/index.js';
import { eq, and, desc, count, ilike, or } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { registerUser } from '../lib/auth.js';

export const clientsRouter = router({
  getAll: tenantProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(10),
      offset: z.number().min(0).default(0),
      search: z.string().optional(),
      role: z.enum(['CLIENT', 'RESELLER']).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const { limit, offset, search, role } = input;

      let whereConditions = [eq(clients.tenantId, ctx.tenantId!)];

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

      if (role) {
        whereConditions.push(eq(users.role, role));
      }

      const allClients = await db
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
            role: users.role,
            isActive: users.isActive,
          },
        })
        .from(clients)
        .leftJoin(users, eq(clients.userId, users.id))
        .where(and(...whereConditions))
        .orderBy(desc(clients.createdAt))
        .limit(limit)
        .offset(offset);

      const [totalResult] = await db
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
      const [client] = await db
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
          eq(clients.tenantId, ctx.tenantId!)
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

  // Get current user's client profile
  getCurrent: protectedProcedure
    .query(async ({ ctx }) => {
      if (!ctx.user || ctx.user.role !== 'CLIENT') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only client users can access their client profile',
        });
      }

      const [client] = await db
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
          eq(clients.userId, ctx.user.id),
          eq(clients.tenantId, ctx.tenantId!)
        ))
        .limit(1);

      if (!client) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Client profile not found',
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

      try {
        // Generate a temporary password for the client
        const tempPassword = Math.random().toString(36).slice(-8) + 'Temp123!';

        // Create user using our custom auth system
        const newUser = await registerUser({
          email,
          password: tempPassword,
          firstName,
          lastName,
          role: 'CLIENT',
          tenantId: ctx.tenantId!,
        });

        // Create client profile
        const [newClient] = await db
          .insert(clients)
          .values({
            ...clientData,
            userId: newUser.id,
            tenantId: ctx.tenantId!,
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
          tempPassword, // Return this so admin can share with client
        };
      } catch (error: any) {
        if (error.code === '23505') { // Unique constraint violation
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Email already exists',
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create client',
        });
      }
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

      const [updatedClient] = await db
        .update(clients)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(and(
          eq(clients.id, id),
          eq(clients.tenantId, ctx.tenantId!)
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

  // Update current user's client profile
  updateCurrent: protectedProcedure
    .input(z.object({
      companyName: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipCode: z.string().optional(),
      country: z.string().optional(),
      phone: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user || ctx.user.role !== 'CLIENT') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only client users can update their client profile',
        });
      }

      const [updatedClient] = await db
        .update(clients)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(and(
          eq(clients.userId, ctx.user.id),
          eq(clients.tenantId, ctx.tenantId!)
        ))
        .returning();

      if (!updatedClient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Client profile not found',
        });
      }

      return updatedClient;
    }),

  delete: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
    }))
    .mutation(async ({ input, ctx }) => {
      // First check if client exists and belongs to tenant
      const [existingClient] = await db
        .select({ id: clients.id, userId: clients.userId })
        .from(clients)
        .where(and(
          eq(clients.id, input.id),
          eq(clients.tenantId, ctx.tenantId!)
        ))
        .limit(1);

      if (!existingClient) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Client not found',
        });
      }

      // Delete client (this will cascade delete related records)
      await db
        .delete(clients)
        .where(eq(clients.id, input.id));

      // Optionally deactivate the user account instead of deleting
      if (existingClient.userId) {
        await db
          .update(users)
          .set({ isActive: false })
          .where(eq(users.id, existingClient.userId));
      }

      return { success: true };
    }),

  // Get client statistics
  getStats: adminProcedure
    .query(async ({ ctx }) => {
      const [totalClients] = await db
        .select({ count: count() })
        .from(clients)
        .where(eq(clients.tenantId, ctx.tenantId!));

      const [activeClients] = await db
        .select({ count: count() })
        .from(clients)
        .where(and(
          eq(clients.tenantId, ctx.tenantId!),
          eq(clients.status, 'ACTIVE')
        ));

      const [inactiveClients] = await db
        .select({ count: count() })
        .from(clients)
        .where(and(
          eq(clients.tenantId, ctx.tenantId!),
          eq(clients.status, 'INACTIVE')
        ));

      const [suspendedClients] = await db
        .select({ count: count() })
        .from(clients)
        .where(and(
          eq(clients.tenantId, ctx.tenantId!),
          eq(clients.status, 'SUSPENDED')
        ));

      return {
        total: totalClients.count,
        active: activeClients.count,
        inactive: inactiveClients.count,
        suspended: suspendedClients.count,
      };
    }),
});