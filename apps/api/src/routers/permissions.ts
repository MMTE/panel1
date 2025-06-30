import { z } from 'zod';
import { router, adminProcedure, protectedProcedure } from '../trpc/trpc';
import { permissionManager, Role, ResourceType, PermissionAction } from '../lib/auth/PermissionManager';
import { TRPCError } from '@trpc/server';
import { db } from '../db';
import { permissionGroups, permissionGroupItems } from '../db/schema/roles';
import { eq } from 'drizzle-orm';

export const permissionsRouter = router({
  // Get all available permissions
  getAllPermissions: adminProcedure
    .query(async () => {
      const permissions = permissionManager.getAllPermissions();
      return permissions.map(permission => ({
        id: permission.id,
        resource: permission.resource,
        action: permission.action,
        description: permission.description,
        hasConditions: (permission.conditions?.length || 0) > 0,
      }));
    }),

  // Get permissions for a specific role
  getRolePermissions: adminProcedure
    .input(z.object({
      role: z.nativeEnum(Role),
    }))
    .query(async ({ input }) => {
      const permissionIds = permissionManager.getRolePermissions(input.role);
      const permissions = permissionIds.map(id => permissionManager.getPermission(id)).filter(Boolean);
      
      // Get permission groups that contain these permissions
      const groups = await db.query.permissionGroups.findMany({
        with: {
          permissions: {
            where: eq(permissionGroupItems.permissionId, permissionIds[0])
          }
        }
      });

      const relevantGroups = groups.filter(group => 
        group.permissions.some(p => permissionIds.includes(p.permissionId))
      );
      
      return {
        role: input.role,
        permissions: permissions.map(permission => ({
          id: permission!.id,
          resource: permission!.resource,
          action: permission!.action,
          description: permission!.description,
        })),
        groups: relevantGroups.map(group => ({
          id: group.id,
          name: group.name,
          description: group.description,
          matchingPermissions: group.permissions.length
        }))
      };
    }),

  // Get available roles
  getAvailableRoles: adminProcedure
    .query(async () => {
      const roles = permissionManager.getAvailableRoles();
      return roles.map(role => ({
        value: role,
        label: role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()),
        description: getRoleDescription(role),
      }));
    }),

  // Check if current user has specific permission
  checkPermission: protectedProcedure
    .input(z.object({
      permissionId: z.string(),
      resourceType: z.nativeEnum(ResourceType).optional(),
      resourceId: z.string().optional(),
      resourceOwnerId: z.string().optional(),
      resourceClientId: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const userContext = {
        userId: ctx.user.id,
        role: ctx.user.role as Role,
        tenantId: ctx.tenantId || undefined,
        clientId: ctx.user.clientId || undefined,
        permissions: [],
      };

      let resourceContext;
      if (input.resourceType) {
        resourceContext = {
          type: input.resourceType,
          id: input.resourceId,
          ownerId: input.resourceOwnerId,
          clientId: input.resourceClientId,
          tenantId: ctx.tenantId || undefined,
        };
      }

      const hasPermission = permissionManager.hasPermission(
        userContext,
        input.permissionId,
        resourceContext
      );

      return {
        hasPermission,
        permissionId: input.permissionId,
        userRole: ctx.user.role,
      };
    }),

  // Get current user's permissions
  getMyPermissions: protectedProcedure
    .query(async ({ ctx }) => {
      const role = ctx.user.role as Role;
      const permissionIds = permissionManager.getRolePermissions(role);
      const permissions = permissionIds.map(id => permissionManager.getPermission(id)).filter(Boolean);
      
      // Group permissions by resource type
      const groupedPermissions = permissions.reduce((groups, permission) => {
        const resource = permission!.resource;
        if (!groups[resource]) {
          groups[resource] = [];
        }
        groups[resource].push({
          id: permission!.id,
          action: permission!.action,
          description: permission!.description,
          hasConditions: (permission!.conditions?.length || 0) > 0,
        });
        return groups;
      }, {} as Record<ResourceType, any[]>);

      // Get permission groups for the user's permissions
      const groups = await db.query.permissionGroups.findMany({
        with: {
          permissions: {
            where: eq(permissionGroupItems.permissionId, permissionIds[0])
          }
        }
      });

      const userGroups = groups.filter(group => 
        group.permissions.some(p => permissionIds.includes(p.permissionId))
      );

      return {
        role,
        totalPermissions: permissions.length,
        permissions: groupedPermissions,
        groups: userGroups.map(group => ({
          id: group.id,
          name: group.name,
          description: group.description,
          matchingPermissions: group.permissions.length
        }))
      };
    }),

  // Get permission details
  getPermissionDetails: adminProcedure
    .input(z.object({
      permissionId: z.string(),
    }))
    .query(async ({ input }) => {
      const permission = permissionManager.getPermission(input.permissionId);
      
      if (!permission) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Permission not found',
        });
      }

      // Get groups containing this permission
      const groups = await db.query.permissionGroups.findMany({
        with: {
          permissions: {
            where: eq(permissionGroupItems.permissionId, input.permissionId)
          }
        }
      });

      return {
        id: permission.id,
        resource: permission.resource,
        action: permission.action,
        description: permission.description,
        conditions: permission.conditions || [],
        rolesWithPermission: permissionManager.getAvailableRoles().filter(role =>
          permissionManager.getRolePermissions(role).includes(permission.id)
        ),
        groups: groups.map(group => ({
          id: group.id,
          name: group.name,
          description: group.description
        }))
      };
    }),

  // Get resource types and their permissions
  getResourcePermissions: adminProcedure
    .query(async () => {
      const permissions = permissionManager.getAllPermissions();
      const resourceGroups = permissions.reduce((groups, permission) => {
        const resource = permission.resource;
        if (!groups[resource]) {
          groups[resource] = {
            resource,
            label: resource.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()),
            permissions: [],
          };
        }
        groups[resource].permissions.push({
          id: permission.id,
          action: permission.action,
          description: permission.description,
          hasConditions: (permission.conditions?.length || 0) > 0,
        });
        return groups;
      }, {} as Record<ResourceType, any>);

      return Object.values(resourceGroups);
    }),

  // Get permission statistics
  getPermissionStats: adminProcedure
    .query(async () => {
      const allPermissions = permissionManager.getAllPermissions();
      const allRoles = permissionManager.getAvailableRoles();
      
      const stats = {
        totalPermissions: allPermissions.length,
        totalRoles: allRoles.length,
        resourceTypes: Object.values(ResourceType).length,
        permissionActions: Object.values(PermissionAction).length,
        permissionsByResource: {} as Record<ResourceType, number>,
        permissionsByAction: {} as Record<PermissionAction, number>,
        rolePermissionCounts: {} as Record<Role, number>,
      };

      // Count permissions by resource
      allPermissions.forEach(permission => {
        stats.permissionsByResource[permission.resource] = 
          (stats.permissionsByResource[permission.resource] || 0) + 1;
        stats.permissionsByAction[permission.action] = 
          (stats.permissionsByAction[permission.action] || 0) + 1;
      });

      // Count permissions per role
      allRoles.forEach(role => {
        stats.rolePermissionCounts[role] = permissionManager.getRolePermissions(role).length;
      });

      return stats;
    }),
});

/**
 * Get human-readable description for roles
 */
function getRoleDescription(role: Role): string {
  switch (role) {
    case Role.SUPER_ADMIN:
      return 'Full system access with all permissions';
    case Role.ADMIN:
      return 'Administrative access to most system functions';
    case Role.MANAGER:
      return 'Business operations and client management';
    case Role.SUPPORT_AGENT:
      return 'Customer support and ticket management';
    case Role.BILLING_AGENT:
      return 'Billing, payments, and financial operations';
    case Role.RESELLER:
      return 'Limited client and service management for resellers';
    case Role.CLIENT:
      return 'Access to own account and services';
    case Role.CLIENT_USER:
      return 'Limited access to client account features';
    default:
      return 'Standard user access';
  }
} 