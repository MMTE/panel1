import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc/trpc.js';
import { 
  authenticateUser, 
  registerUser, 
  createSession, 
  deleteSession,
  getUserById,
  type AuthUser 
} from '../lib/auth.js';
import { db } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { tenants, users } from '../db/schema/index.js';

export const authRouter = router({
  // Login endpoint
  login: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(6),
    }))
    .mutation(async ({ input }) => {
      const user = await authenticateUser(input.email, input.password);
      
      if (!user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password',
        });
      }

      // Create session
      const token = await createSession(user.id);

      return {
        user,
        token,
      };
    }),

  // Register endpoint
  register: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(6),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      tenantId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const user = await registerUser({
          email: input.email,
          password: input.password,
          firstName: input.firstName,
          lastName: input.lastName,
          tenantId: input.tenantId,
        });

        // Create session
        const token = await createSession(user.id);

        const authUser: AuthUser = {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role as 'ADMIN' | 'CLIENT' | 'RESELLER',
          tenantId: user.tenantId,
        };

        return {
          user: authUser,
          token,
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
          message: 'Failed to register user',
        });
      }
    }),

  // Logout endpoint
  logout: protectedProcedure
    .mutation(async ({ ctx }) => {
      // Get token from context (we'll need to modify this)
      // For now, we'll implement a simple logout that cleans up sessions
      // In a real implementation, you'd want to track the specific session token
      
      return { success: true };
    }),

  // Get current user profile
  me: protectedProcedure
    .query(async ({ ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Not authenticated',
        });
      }

      return ctx.user;
    }),

  // Update user profile
  updateProfile: protectedProcedure
    .input(z.object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Not authenticated',
        });
      }

      // Update user profile logic would go here
      // For now, return the current user
      return ctx.user;
    }),

  // Refresh token endpoint
  refresh: publicProcedure
    .input(z.object({
      token: z.string(),
    }))
    .mutation(async ({ input }) => {
      // Validate existing token and create new one
      const sessionData = await import('../lib/auth.js').then(m => m.getSessionByToken(input.token));
      
      if (!sessionData) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired token',
        });
      }

      // Create new session
      const newToken = await createSession(sessionData.users.id);
      
      // Delete old session
      await deleteSession(input.token);

      const user: AuthUser = {
        id: sessionData.users.id,
        email: sessionData.users.email,
        firstName: sessionData.users.firstName,
        lastName: sessionData.users.lastName,
        role: sessionData.users.role as 'ADMIN' | 'CLIENT' | 'RESELLER',
        tenantId: sessionData.users.tenantId,
      };

      return {
        user,
        token: newToken,
      };
    }),

  // Development-only: Impersonate user by ID
  devImpersonate: publicProcedure
    .input(z.object({
      userId: z.string().uuid(),
    }))
    .mutation(async ({ input }) => {
      // Only allow in development mode
      if (process.env.NODE_ENV === 'production') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Impersonation only allowed in development mode',
        });
      }

      const user = await getUserById(input.userId);
      
      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }

      // Create development tenant if it doesn't exist
      if (!user.tenantId) {
        const [devTenant] = await db.insert(tenants)
          .values({
            name: 'Development Tenant',
            slug: 'dev',
            domain: 'localhost',
            settings: {},
            branding: {},
          })
          .onConflictDoUpdate({
            target: tenants.slug,
            set: {
              updatedAt: new Date(),
            },
          })
          .returning();

        // Update user with tenant ID
        await db.update(users)
          .set({ tenantId: devTenant.id })
          .where(eq(users.id, user.id));

        user.tenantId = devTenant.id;
      }

      // Create session for impersonated user
      const token = await createSession(user.id);

      return {
        user,
        token,
      };
    }),
});