import { EventEmitter } from 'events';
import { createId } from '@paralleldrive/cuid2';
import { db } from '../../db';
import {
  permissions,
  rolePermissions,
  roleHierarchy,
  permissionGroups,
  permissionGroupItems,
  roles as rolesTable,
} from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@panel1/core';
import { Role, ResourceType, PermissionAction, type Permission } from './types';

export { Role, ResourceType, PermissionAction } from './types';
export type { Permission } from './types';

export interface PermissionCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'owns' | 'belongs_to_tenant';
  value: unknown;
}

export interface UserPermissionContext {
  userId: string;
  role: Role;
  tenantId?: string;
  clientId?: string;
  permissions: string[];
}

export interface ResourceContext {
  type: ResourceType;
  id?: string;
  ownerId?: string;
  tenantId?: string;
  clientId?: string;
  metadata?: Record<string, unknown>;
}

type CachedPermission = Omit<Permission, 'conditions'> & { conditions?: PermissionCondition[] };

export class PermissionManager extends EventEmitter {
  private static instance: PermissionManager;
  private rolePermissions = new Map<Role, string[]>();
  private permissionsCache = new Map<string, CachedPermission>();
  private cacheExpiry = new Date(0);
  private readonly CACHE_TTL = 5 * 60 * 1000;

  private constructor() {
    super();
  }

  static getInstance(): PermissionManager {
    if (!PermissionManager.instance) {
      PermissionManager.instance = new PermissionManager();
    }
    return PermissionManager.instance;
  }

  private async loadPermissions(): Promise<void> {
    if (this.cacheExpiry > new Date()) {
      return;
    }

    const dbPermissions = await db.select().from(permissions);
    this.permissionsCache.clear();

    for (const perm of dbPermissions) {
      let parsedConditions: PermissionCondition[] | undefined;
      if (perm.conditions) {
        const raw = perm.conditions as unknown;
        parsedConditions = Array.isArray(raw)
          ? (raw as PermissionCondition[])
          : (JSON.parse(String(raw)) as PermissionCondition[]);
      }
      const permission: CachedPermission = {
        id: perm.id,
        name: perm.name,
        resource: perm.resource as ResourceType,
        action: perm.action as PermissionAction,
        description: perm.description ?? '',
        conditions: parsedConditions,
      };
      this.permissionsCache.set(perm.name, permission);
    }

    const rolePerms = await db
      .select({
        roleId: rolePermissions.roleId,
        permissionName: permissions.name,
      })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id));

    this.rolePermissions.clear();
    for (const rolePerm of rolePerms) {
      const role = rolePerm.roleId as Role;
      if (!this.rolePermissions.has(role)) {
        this.rolePermissions.set(role, []);
      }
      this.rolePermissions.get(role)!.push(rolePerm.permissionName);
    }

    this.cacheExpiry = new Date(Date.now() + this.CACHE_TTL);
    logger.info(`Loaded ${this.permissionsCache.size} permissions and role mappings into cache`);
  }

  async hasPermission(
    userContext: UserPermissionContext,
    permissionId: string,
    resourceContext?: ResourceContext
  ): Promise<boolean> {
    try {
      await this.loadPermissions();

      if (userContext.role === Role.SUPER_ADMIN) {
        return true;
      }

      const rolePerms = this.rolePermissions.get(userContext.role);
      let allowed = rolePerms?.includes(permissionId) ?? false;
      if (!allowed) {
        allowed = await this.hasInheritedPermission(userContext.role, permissionId);
      }

      if (!allowed) {
        return false;
      }

      if (!resourceContext) {
        return true;
      }

      const permission = this.permissionsCache.get(permissionId);
      if (!permission) {
        logger.warn(`Permission not found: ${permissionId}`);
        return false;
      }

      if (permission.conditions && permission.conditions.length > 0) {
        return this.evaluateConditions(permission.conditions, userContext, resourceContext);
      }

      return true;
    } catch (error) {
      logger.error('Error checking permission:', error);
      return false;
    }
  }

  private async hasInheritedPermission(role: Role, permissionId: string): Promise<boolean> {
    const inheritedRoles = await db.query.roleHierarchy.findMany({
      where: eq(roleHierarchy.childRole, role),
    });

    for (const { parentRole } of inheritedRoles) {
      const parentPerms = this.rolePermissions.get(parentRole as Role);
      if (parentPerms?.includes(permissionId)) {
        return true;
      }
    }
    return false;
  }

  private evaluateConditions(
    conditions: PermissionCondition[],
    userContext: UserPermissionContext,
    resourceContext: ResourceContext
  ): boolean {
    return conditions.every((condition) => {
      const fieldValue = this.getFieldValue(condition.field, userContext, resourceContext);

      switch (condition.operator) {
        case 'equals':
          return fieldValue === condition.value;
        case 'not_equals':
          return fieldValue !== condition.value;
        case 'in':
          return Array.isArray(condition.value) && condition.value.includes(fieldValue);
        case 'not_in':
          return Array.isArray(condition.value) && !condition.value.includes(fieldValue);
        case 'owns':
          return this.checkOwnership(condition.field, fieldValue, userContext, resourceContext);
        case 'belongs_to_tenant':
          return userContext.tenantId === resourceContext.tenantId;
        default:
          logger.warn(`Unknown permission condition operator: ${condition.operator}`);
          return false;
      }
    });
  }

  private getFieldValue(
    field: string,
    userContext: UserPermissionContext,
    resourceContext: ResourceContext
  ): unknown {
    const u = userContext as unknown as Record<string, unknown>;
    const r = resourceContext as unknown as Record<string, unknown>;
    if (field.startsWith('user.')) {
      return u[field.substring(5)];
    }
    if (field.startsWith('resource.')) {
      return r[field.substring(9)];
    }
    return r[field];
  }

  private checkOwnership(
    field: string,
    value: unknown,
    userContext: UserPermissionContext,
    resourceContext: ResourceContext
  ): boolean {
    if (value === 'user.clientId') {
      return resourceContext.clientId === userContext.clientId;
    }

    if (value === 'user.id') {
      return resourceContext.ownerId === userContext.userId;
    }

    return false;
  }

  async getUserPermissions(userContext: UserPermissionContext): Promise<string[]> {
    await this.loadPermissions();
    return this.rolePermissions.get(userContext.role) || [];
  }

  async getRolePermissions(role: Role): Promise<string[]> {
    await this.loadPermissions();
    return this.rolePermissions.get(role) || [];
  }

  async getPermission(permissionName: string): Promise<Permission | undefined> {
    await this.loadPermissions();
    return this.permissionsCache.get(permissionName);
  }

  async getAllPermissions(): Promise<Permission[]> {
    await this.loadPermissions();
    return Array.from(this.permissionsCache.values());
  }

  /** All role ids from DB — no hardcoded enum list. */
  async getAvailableRoles(): Promise<Role[]> {
    const rows = await db.select({ id: rolesTable.id }).from(rolesTable);
    return rows.map((r) => r.id as Role);
  }

  async addPermissionToRole(role: Role, permissionName: string): Promise<void> {
    const permission = await db.select().from(permissions).where(eq(permissions.name, permissionName));
    if (permission.length === 0) {
      throw new Error(`Permission not found: ${permissionName}`);
    }

    await db.insert(rolePermissions).values({
      roleId: role,
      permissionId: permission[0].id,
    });

    this.cacheExpiry = new Date(0);
    logger.info(`Added permission ${permissionName} to role ${role}`);
  }

  async removePermissionFromRole(role: Role, permissionName: string): Promise<void> {
    const permission = await db.select().from(permissions).where(eq(permissions.name, permissionName));
    if (permission.length === 0) {
      throw new Error(`Permission not found: ${permissionName}`);
    }

    await db.delete(rolePermissions).where(
      and(eq(rolePermissions.roleId, role), eq(rolePermissions.permissionId, permission[0].id))
    );

    this.cacheExpiry = new Date(0);
    logger.info(`Removed permission ${permissionName} from role ${role}`);
  }

  clearCache(): void {
    this.cacheExpiry = new Date(0);
    this.rolePermissions.clear();
    this.permissionsCache.clear();
  }

  async getPermissionGroups() {
    const groups = await db.select().from(permissionGroups);
    const groupItems = await db.select().from(permissionGroupItems);

    return groups.map((group) => ({
      id: group.id,
      name: group.name,
      description: group.description,
      permissions: groupItems.filter((item) => item.groupId === group.id),
    }));
  }

  async createPermissionGroup(name: string, description: string, permissionIds: string[]) {
    const [group] = await db
      .insert(permissionGroups)
      .values({
        id: createId(),
        name,
        description,
      })
      .returning();

    await db.insert(permissionGroupItems).values(
      permissionIds.map((permissionId) => ({
        groupId: group.id,
        permissionId,
      }))
    );

    return group;
  }

  async updatePermissionGroup(id: string, name: string, description: string, permissionIds: string[]) {
    await db.delete(permissionGroupItems).where(eq(permissionGroupItems.groupId, id));

    await db.insert(permissionGroupItems).values(
      permissionIds.map((permissionId) => ({
        groupId: id,
        permissionId,
      }))
    );

    const [group] = await db
      .update(permissionGroups)
      .set({
        name,
        description,
        updatedAt: new Date(),
      })
      .where(eq(permissionGroups.id, id))
      .returning();

    return group;
  }

  async deletePermissionGroup(id: string) {
    await db.delete(permissionGroupItems).where(eq(permissionGroupItems.groupId, id));

    await db.delete(permissionGroups).where(eq(permissionGroups.id, id));
  }
}

export const permissionManager = PermissionManager.getInstance();
