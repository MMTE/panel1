import { z } from 'zod';
import { router, protectedProcedure, adminProcedure, tenantProcedure } from '../trpc/trpc.js';
import { users } from '../db/schema/index.js';
import { eq, and, desc, count, ilike, or } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

export const usersRouter = router({
  getAll: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(10),
      offset: z.number().min(0).default(0),
      search: z.string().optional(),
      role: z.enum(['ADMIN', 'CLIENT', 'RESELLER']).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const { limit, offset, search, role } = input;

      let whereConditions = [eq(users.tenantId, ctx.tenantId)];

      if (search) {
        whereConditions.push(
          or(
            ilike(users.email, `%${search}%`),
            ilike(users.firstName, `%${search}%`),
            ilike(users.lastName, `%${search}%`)
          )!
        );
      }

      if (role) {
        whereConditions.push(eq(users.role, role));
      }

      const allUsers = await ctx.db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          isActive: users.isActive,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(and(...whereConditions))
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset);

      const [totalResult] = await ctx.db
        .select({ count: count() })
        .from(users)
        .where(and(...whereConditions));

      return {
        users: allUsers,
        total: totalResult.count,
        hasMore: offset + limit < totalResult.count,
      };
    }),

  getById: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
    }))
    .query(async ({ input, ctx }) => {
      const [user] = await ctx.db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          isActive: users.isActive,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(and(
          eq(users.id, input.id),
          eq(users.tenantId, ctx.tenantId)
        ))
        .limit(1);

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      return user;
    }),

  create: adminProcedure
    .input(z.object({
      email: z.string().email(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      role: z.enum(['ADMIN', 'CLIENT', 'RESELLER']).default('CLIENT'),
    }))
    .mutation(async ({ input, ctx }) => {
      const { email, firstName, lastName, role } = input;

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
          role,
          tenantId: ctx.tenantId,
        })
        .returning({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          isActive: users.isActive,
          createdAt: users.createdAt,
        });

      return newUser;
    }),

  update: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      role: z.enum(['ADMIN', 'CLIENT', 'RESELLER']).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input;

      const [updatedUser] = await ctx.db
        .update(users)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(and(
          eq(users.id, id),
          eq(users.tenantId, ctx.tenantId)
        ))
        .returning({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          isActive: users.isActive,
          updatedAt: users.updatedAt,
        });

      if (!updatedUser)  {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      return updatedUser;
    }),
});