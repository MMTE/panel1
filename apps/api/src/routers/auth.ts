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
import { permissionManager, Role } from '../lib/auth/PermissionManager.js';
import { roles, permissions, rolePermissions, roleHierarchy, userRoles, permissionGroups, permissionGroupItems } from '../db/schema/roles';
import { nanoid } from 'nanoid';
import { PermissionManager } from '../lib/auth/PermissionManager';

// Helper function to attach permissions to a user object
const attachPermissionsToUser = (user: AuthUser): AuthUser => {
  const roleEnum = user.role.toUpperCase() as keyof typeof Role;
  if (Object.values(Role).includes(roleEnum as Role)) {
    const permissions = permissionManager.getRolePermissions(roleEnum as Role);
    return { ...user, permissions };
  }
  // Return user without permissions if role is invalid
  return { ...user, permissions: [] };
};

// Input validation schemas
const roleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  isSystem: z.boolean().optional(),
  metadata: z.record(z.any()).optional()
});

const permissionSchema = z.object({
  name: z.string().min(1),
  resource: z.string().min(1),
  action: z.string().min(1),
  description: z.string().optional(),
  conditions: z.array(z.object({
    field: z.string(),
    operator: z.enum(['equals', 'not_equals', 'in', 'not_in', 'owns', 'belongs_to_tenant']),
    value: z.any()
  })).optional()
});

const rolePermissionSchema = z.object({
  roleId: z.string(),
  permissionId: z.string(),
  conditions: z.record(z.any()).optional()
});

const userRoleSchema = z.object({
  userId: z.string(),
  roleId: z.string(),
  tenantId: z.string().optional(),
  expiresAt: z.date().optional(),
  metadata: z.record(z.any()).optional()
});

export const authRouter = router({
  // Login endpoint
  signIn: publicProcedure
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

      const userWithPermissions = attachPermissionsToUser(user);

      return {
        user: userWithPermissions,
        token,
      };
    }),

  // Register endpoint
  signUp: publicProcedure
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

        const userWithPermissions = attachPermissionsToUser(authUser);

        return {
          user: userWithPermissions,
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
  signOut: protectedProcedure
    .mutation(async ({ ctx }) => {
      // Get token from context and invalidate it
      if (ctx.token) {
        await deleteSession(ctx.token);
      }
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

      const userWithPermissions = attachPermissionsToUser(ctx.user);
      return userWithPermissions;
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

      // Here you would typically update the user in the database
      const updatedUser: AuthUser = {
        ...ctx.user,
        ...input,
      };

      const userWithPermissions = attachPermissionsToUser(updatedUser);
      return userWithPermissions;
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

      const userWithPermissions = attachPermissionsToUser(user);

      return {
        user: userWithPermissions,
        token: newToken,
      };
    }),

  // Development-only: Impersonate user by ID
  impersonate: publicProcedure
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

      // Create or get development tenant
      let userTenantId = user.tenantId;
      
      if (!userTenantId) {
        // First check if default tenant exists
        const [existingTenant] = await db
          .select()
          .from(tenants)
          .where(eq(tenants.slug, 'panel1-demo'))
          .limit(1);

        if (existingTenant) {
          userTenantId = existingTenant.id;
        } else {
          // Create new development tenant
          const [newTenant] = await db.insert(tenants)
            .values({
              name: 'Panel1 Demo',
              slug: 'panel1-demo',
              domain: 'localhost',
              settings: {
                defaultCurrency: 'USD',
                timezone: 'UTC',
              },
              branding: {
                primaryColor: '#3b82f6',
                logo: null,
              },
            })
            .returning();
          
          userTenantId = newTenant.id;
        }

        // Update user with tenant ID
        await db.update(users)
          .set({ tenantId: userTenantId })
          .where(eq(users.id, user.id));

        user.tenantId = userTenantId;
      }

      // Create session for impersonated user
      const token = await createSession(user.id);
      
      // Attach tenant context to user
      const userWithTenant: AuthUser = {
        ...user,
        tenantId: userTenantId,
      };

      const userWithPermissions = attachPermissionsToUser(userWithTenant);

      return {
        user: userWithPermissions,
        token,
      };
    }),

  // Role management
  createRole: protectedProcedure
    .input(roleSchema)
    .mutation(async ({ input, ctx }) => {
      const permissionManager = PermissionManager.getInstance();
      const hasPermission = await permissionManager.hasPermission(
        { userId: ctx.user.id, role: ctx.user.role },
        'admin.roles.create'
      );

      if (!hasPermission) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to create roles'
        });
      }

      const role = await db.insert(roles).values({
        id: nanoid(),
        ...input
      }).returning();

      return role[0];
    }),

  updateRole: protectedProcedure
    .input(z.object({
      id: z.string(),
      data: roleSchema.partial()
    }))
    .mutation(async ({ input, ctx }) => {
      const permissionManager = PermissionManager.getInstance();
      const hasPermission = await permissionManager.hasPermission(
        { userId: ctx.user.id, role: ctx.user.role },
        'admin.roles.update'
      );

      if (!hasPermission) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update roles'
        });
      }

      const role = await db.update(roles)
        .set(input.data)
        .where(eq(roles.id, input.id))
        .returning();

      return role[0];
    }),

  deleteRole: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const permissionManager = PermissionManager.getInstance();
      const hasPermission = await permissionManager.hasPermission(
        { userId: ctx.user.id, role: ctx.user.role },
        'admin.roles.delete'
      );

      if (!hasPermission) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to delete roles'
        });
      }

      await db.delete(roles).where(eq(roles.id, input.id));
      return { success: true };
    }),

  getRoles: protectedProcedure
    .query(async ({ ctx }) => {
      const permissionManager = PermissionManager.getInstance();
      const hasPermission = await permissionManager.hasPermission(
        { userId: ctx.user.id, role: ctx.user.role },
        'admin.roles.view'
      );

      if (!hasPermission) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to view roles'
        });
      }

      return db.select().from(roles);
    }),

  // Permission management
  createPermission: protectedProcedure
    .input(permissionSchema)
    .mutation(async ({ input, ctx }) => {
      const permissionManager = PermissionManager.getInstance();
      const hasPermission = await permissionManager.hasPermission(
        { userId: ctx.user.id, role: ctx.user.role },
        'admin.permissions.create'
      );

      if (!hasPermission) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to create permissions'
        });
      }

      const permission = await db.insert(permissions).values({
        id: nanoid(),
        ...input
      }).returning();

      return permission[0];
    }),

  updatePermission: protectedProcedure
    .input(z.object({
      id: z.string(),
      data: permissionSchema.partial()
    }))
    .mutation(async ({ input, ctx }) => {
      const permissionManager = PermissionManager.getInstance();
      const hasPermission = await permissionManager.hasPermission(
        { userId: ctx.user.id, role: ctx.user.role },
        'admin.permissions.update'
      );

      if (!hasPermission) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update permissions'
        });
      }

      const permission = await db.update(permissions)
        .set(input.data)
        .where(eq(permissions.id, input.id))
        .returning();

      return permission[0];
    }),

  deletePermission: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const permissionManager = PermissionManager.getInstance();
      const hasPermission = await permissionManager.hasPermission(
        { userId: ctx.user.id, role: ctx.user.role },
        'admin.permissions.delete'
      );

      if (!hasPermission) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to delete permissions'
        });
      }

      await db.delete(permissions).where(eq(permissions.id, input.id));
      return { success: true };
    }),

  getPermissions: protectedProcedure
    .query(async ({ ctx }) => {
      const permissionManager = PermissionManager.getInstance();
      const hasPermission = await permissionManager.hasPermission(
        { userId: ctx.user.id, role: ctx.user.role },
        'admin.permissions.view'
      );

      if (!hasPermission) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to view permissions'
        });
      }

      return db.select().from(permissions);
    }),

  // Role-Permission management
  assignPermissionToRole: protectedProcedure
    .input(rolePermissionSchema)
    .mutation(async ({ input, ctx }) => {
      const permissionManager = PermissionManager.getInstance();
      const hasPermission = await permissionManager.hasPermission(
        { userId: ctx.user.id, role: ctx.user.role },
        'admin.roles.manage_permissions'
      );

      if (!hasPermission) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to manage role permissions'
        });
      }

      const rolePermission = await db.insert(rolePermissions).values({
        roleId: input.roleId,
        permissionId: input.permissionId,
        conditions: input.conditions,
        grantedBy: ctx.user.id
      }).returning();

      return rolePermission[0];
    }),

  removePermissionFromRole: protectedProcedure
    .input(z.object({
      roleId: z.string(),
      permissionId: z.string()
    }))
    .mutation(async ({ input, ctx }) => {
      const permissionManager = PermissionManager.getInstance();
      const hasPermission = await permissionManager.hasPermission(
        { userId: ctx.user.id, role: ctx.user.role },
        'admin.roles.manage_permissions'
      );

      if (!hasPermission) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to manage role permissions'
        });
      }

      await db.delete(rolePermissions)
        .where(and(
          eq(rolePermissions.roleId, input.roleId),
          eq(rolePermissions.permissionId, input.permissionId)
        ));

      return { success: true };
    }),

  getRolePermissions: protectedProcedure
    .input(z.object({ roleId: z.string() }))
    .query(async ({ input, ctx }) => {
      const permissionManager = PermissionManager.getInstance();
      const hasPermission = await permissionManager.hasPermission(
        { userId: ctx.user.id, role: ctx.user.role },
        'admin.roles.view'
      );

      if (!hasPermission) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to view role permissions'
        });
      }

      return db.select({
        roleId: rolePermissions.roleId,
        permissionId: rolePermissions.permissionId,
        permission: permissions
      })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, input.roleId));
    }),

  // User-Role management
  assignRoleToUser: protectedProcedure
    .input(userRoleSchema)
    .mutation(async ({ input, ctx }) => {
      const permissionManager = PermissionManager.getInstance();
      const hasPermission = await permissionManager.hasPermission(
        { userId: ctx.user.id, role: ctx.user.role },
        'admin.users.manage_roles'
      );

      if (!hasPermission) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to manage user roles'
        });
      }

      const userRole = await db.insert(userRoles).values({
        ...input,
        assignedBy: ctx.user.id
      }).returning();

      return userRole[0];
    }),

  removeRoleFromUser: protectedProcedure
    .input(z.object({
      userId: z.string(),
      roleId: z.string(),
      tenantId: z.string().optional()
    }))
    .mutation(async ({ input, ctx }) => {
      const permissionManager = PermissionManager.getInstance();
      const hasPermission = await permissionManager.hasPermission(
        { userId: ctx.user.id, role: ctx.user.role },
        'admin.users.manage_roles'
      );

      if (!hasPermission) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to manage user roles'
        });
      }

      const conditions = [
        eq(userRoles.userId, input.userId),
        eq(userRoles.roleId, input.roleId)
      ];

      if (input.tenantId) {
        conditions.push(eq(userRoles.tenantId, input.tenantId));
      }

      await db.delete(userRoles).where(and(...conditions));
      return { success: true };
    }),

  getUserRoles: protectedProcedure
    .input(z.object({
      userId: z.string(),
      tenantId: z.string().optional()
    }))
    .query(async ({ input, ctx }) => {
      const permissionManager = PermissionManager.getInstance();
      const hasPermission = await permissionManager.hasPermission(
        { userId: ctx.user.id, role: ctx.user.role },
        'admin.users.view_roles'
      );

      if (!hasPermission) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to view user roles'
        });
      }

      const conditions = [eq(userRoles.userId, input.userId)];
      if (input.tenantId) {
        conditions.push(eq(userRoles.tenantId, input.tenantId));
      }

      return db.select({
        userId: userRoles.userId,
        roleId: userRoles.roleId,
        tenantId: userRoles.tenantId,
        role: roles
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(and(...conditions));
    }),

  // Permission checking
  checkPermission: protectedProcedure
    .input(z.object({
      permissionId: z.string(),
      resourceContext: z.object({
        type: z.string(),
        id: z.string().optional(),
        ownerId: z.string().optional(),
        tenantId: z.string().optional(),
        clientId: z.string().optional(),
        metadata: z.record(z.any()).optional()
      }).optional()
    }))
    .query(async ({ input, ctx }) => {
      const permissionManager = PermissionManager.getInstance();
      const result = await permissionManager.hasPermission(
        {
          userId: ctx.user.id,
          role: ctx.user.role,
          tenantId: ctx.user.tenantId
        },
        input.permissionId,
        input.resourceContext
      );

      return { granted: result };
    }),

  checkPermissions: protectedProcedure
    .input(z.object({
      requests: z.array(z.object({
        permissionId: z.string(),
        resourceContext: z.object({
          type: z.string(),
          id: z.string().optional(),
          ownerId: z.string().optional(),
          tenantId: z.string().optional(),
          clientId: z.string().optional(),
          metadata: z.record(z.any()).optional()
        }).optional()
      }))
    }))
    .query(async ({ input, ctx }) => {
      const permissionManager = PermissionManager.getInstance();
      const results: Record<string, { granted: boolean }> = {};

      for (const request of input.requests) {
        const result = await permissionManager.hasPermission(
          {
            userId: ctx.user.id,
            role: ctx.user.role,
            tenantId: ctx.user.tenantId
          },
          request.permissionId,
          request.resourceContext
        );

        results[request.permissionId] = { granted: result };
      }

      return results;
    })
});