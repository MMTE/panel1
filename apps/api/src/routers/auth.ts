import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { router, publicProcedure, protectedProcedure } from '../trpc/trpc.js';
import { users } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

export const authRouter = router({
  register: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(8),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { email, password, firstName, lastName } = input;

      // Check if user already exists
      const [existingUser] = await ctx.db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingUser) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'User already exists',
        });
      }

      // Create user in Supabase Auth
      const { data: authData, error: authError } = await ctx.supabase.auth.admin.createUser({
        email,
        password,
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
          tenantId: '00000000-0000-0000-0000-000000000000', // Default tenant
        })
        .returning({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          createdAt: users.createdAt,
        });

      return {
        user: newUser,
        message: 'User created successfully',
      };
    }),

  login: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { email, password } = input;

      // Sign in with Supabase
      const { data, error } = await ctx.supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error || !data.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid credentials',
        });
      }

      // Get user details from our database
      const [user] = await ctx.db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          isActive: users.isActive,
          tenantId: users.tenantId,
        })
        .from(users)
        .where(eq(users.authUserId, data.user.id))
        .limit(1);

      if (!user || !user.isActive) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Account not found or inactive',
        });
      }

      return {
        user,
        session: data.session,
      };
    }),

  me: protectedProcedure
    .query(async ({ ctx }) => {
      const [user] = await ctx.db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          isActive: users.isActive,
          tenantId: users.tenantId,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);

      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      return user;
    }),

  updateProfile: protectedProcedure
    .input(z.object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const [updatedUser] = await ctx.db
        .update(users)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(users.id, ctx.user.id))
        .returning({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          updatedAt: users.updatedAt,
        });

      return updatedUser;
    }),
});