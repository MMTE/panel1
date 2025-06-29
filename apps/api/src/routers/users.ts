import { z } from 'zod';
import { router, publicProcedure, protectedProcedure, adminProcedure, tenantProcedure } from '../trpc/trpc.js';
import { db, users, clients } from '../db/index.js';
import { eq, and, desc, count, ilike, or } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { registerUser, hashPassword } from '../lib/auth.js';

export const usersRouter = router({
  getAll: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(10),
      offset: z.number().min(0).default(0),
      search: z.string().optional(),
      role: z.enum(['ADMIN', 'CLIENT', 'RESELLER']).optional(),
      isActive: z.boolean().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const { limit, offset, search, role, isActive } = input;

      const whereConditions = [eq(users.tenantId, ctx.tenantId!)];

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

      if (isActive !== undefined) {
        whereConditions.push(eq(users.isActive, isActive));
      }

      const allUsers = await db
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

      const [totalResult] = await db
        .select({ count: count() })
        .from(users)
        .where(and(...whereConditions));

      return {
        users: allUsers,
        total: totalResult.count,
        hasMore: offset + limit < totalResult.count,
      };
    }),

  getById: tenantProcedure
    .input(z.object({
      id: z.string().uuid(),
    }))
    .query(async ({ input, ctx }) => {
      const [user] = await db
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
          eq(users.tenantId, ctx.tenantId!)
        ))
        .limit(1);

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Get client profile if user is a client
      let clientProfile: any = null;
      if (user.role === 'CLIENT') {
        const [client] = await db
          .select()
          .from(clients)
          .where(eq(clients.userId, user.id))
          .limit(1);
        clientProfile = client || null;
      }

      return {
        ...user,
        clientProfile,
      };
    }),

  create: adminProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(6),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      role: z.enum(['ADMIN', 'CLIENT', 'RESELLER']).default('CLIENT'),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const newUser = await registerUser({
          email: input.email,
          password: input.password,
          firstName: input.firstName,
          lastName: input.lastName,
          role: input.role,
          tenantId: ctx.tenantId!,
        });

        return {
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          role: newUser.role,
          isActive: newUser.isActive,
          createdAt: newUser.createdAt,
          updatedAt: newUser.updatedAt,
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
          message: 'Failed to create user',
        });
      }
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

      const [updatedUser] = await db
        .update(users)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(and(
          eq(users.id, id),
          eq(users.tenantId, ctx.tenantId!)
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

      if (!updatedUser) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      return updatedUser;
    }),

  updatePassword: protectedProcedure
    .input(z.object({
      currentPassword: z.string(),
      newPassword: z.string().min(6),
    }))
    .mutation(async ({ input, ctx }) => {
      // For now, this is a placeholder
      // In a full implementation, you'd verify the current password
      // and update it using the auth system
      
      const hashedPassword = await hashPassword(input.newPassword);
      
      await db
        .update(users)
        .set({
          password: hashedPassword,
          updatedAt: new Date(),
        })
        .where(eq(users.id, ctx.user!.id));

      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Check if user exists and belongs to tenant
      const [existingUser] = await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(and(
          eq(users.id, input.id),
          eq(users.tenantId, ctx.tenantId!)
        ))
        .limit(1);

      if (!existingUser) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Prevent deleting the last admin
      if (existingUser.role === 'ADMIN') {
        const [adminCount] = await db
          .select({ count: count() })
          .from(users)
          .where(and(
            eq(users.tenantId, ctx.tenantId!),
            eq(users.role, 'ADMIN'),
            eq(users.isActive, true)
          ));

        if (adminCount.count <= 1) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Cannot delete the last admin user',
          });
        }
      }

      // Soft delete - deactivate instead of hard delete
      await db
        .update(users)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(users.id, input.id));

      return { success: true };
    }),

  // Get user statistics
  getStats: adminProcedure
    .query(async ({ ctx }) => {
      const [totalUsers] = await db
        .select({ count: count() })
        .from(users)
        .where(eq(users.tenantId, ctx.tenantId!));

      const [activeUsers] = await db
        .select({ count: count() })
        .from(users)
        .where(and(
          eq(users.tenantId, ctx.tenantId!),
          eq(users.isActive, true)
        ));

      const [adminUsers] = await db
        .select({ count: count() })
        .from(users)
        .where(and(
          eq(users.tenantId, ctx.tenantId!),
          eq(users.role, 'ADMIN'),
          eq(users.isActive, true)
        ));

      const [clientUsers] = await db
        .select({ count: count() })
        .from(users)
        .where(and(
          eq(users.tenantId, ctx.tenantId!),
          eq(users.role, 'CLIENT'),
          eq(users.isActive, true)
        ));

      const [resellerUsers] = await db
        .select({ count: count() })
        .from(users)
        .where(and(
          eq(users.tenantId, ctx.tenantId!),
          eq(users.role, 'RESELLER'),
          eq(users.isActive, true)
        ));

      return {
        total: totalUsers.count,
        active: activeUsers.count,
        inactive: totalUsers.count - activeUsers.count,
        byRole: {
          admin: adminUsers.count,
          client: clientUsers.count,
          reseller: resellerUsers.count,
        },
      };
    }),

  // Toggle user active status
  toggleStatus: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Get current status
      const [currentUser] = await db
        .select({ isActive: users.isActive, role: users.role })
        .from(users)
        .where(and(
          eq(users.id, input.id),
          eq(users.tenantId, ctx.tenantId!)
        ))
        .limit(1);

      if (!currentUser) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Prevent deactivating the last admin
      if (currentUser.role === 'ADMIN' && currentUser.isActive) {
        const [adminCount] = await db
          .select({ count: count() })
          .from(users)
          .where(and(
            eq(users.tenantId, ctx.tenantId!),
            eq(users.role, 'ADMIN'),
            eq(users.isActive, true)
          ));

        if (adminCount.count <= 1) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Cannot deactivate the last admin user',
          });
        }
      }

      const [updatedUser] = await db
        .update(users)
        .set({
          isActive: !currentUser.isActive,
          updatedAt: new Date(),
        })
        .where(and(
          eq(users.id, input.id),
          eq(users.tenantId, ctx.tenantId!)
        ))
        .returning({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          isActive: users.isActive,
        });

      return updatedUser;
    }),

  // Development-only: Get all users for dev bar (no auth required)
  devGetAll: publicProcedure
    .query(async () => {
      // Only allow in development mode
      if (process.env.NODE_ENV === 'production') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Dev endpoints only allowed in development mode',
        });
      }

      const allUsers = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          isActive: users.isActive,
          tenantId: users.tenantId,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.isActive, true))
        .orderBy(desc(users.createdAt))
        .limit(50);

      return {
        users: allUsers,
        total: allUsers.length,
      };
    }),
});