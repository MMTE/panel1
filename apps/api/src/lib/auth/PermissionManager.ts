import { EventEmitter } from 'events';
import { db } from '../../db';
import { permissions, rolePermissions, users, roleHierarchy } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '../logging/Logger';

// Permission actions
export enum PermissionAction {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  MANAGE = 'manage', // Full control
  EXECUTE = 'execute', // For operations like sending emails, processing payments
  APPROVE = 'approve', // For workflows requiring approval
  VIEW_SENSITIVE = 'view_sensitive', // For sensitive data like payment info
}

// Resource types
export enum ResourceType {
  // Core entities
  CLIENT = 'client',
  USER = 'user',
  TENANT = 'tenant',
  
  // Billing & Finance
  INVOICE = 'invoice',
  PAYMENT = 'payment',
  SUBSCRIPTION = 'subscription',
  PLAN = 'plan',
  
  // Support & Service
  SUPPORT_TICKET = 'support_ticket',
  KNOWLEDGE_BASE = 'knowledge_base',
  
  // Hosting & Infrastructure
  DOMAIN = 'domain',
  SSL_CERTIFICATE = 'ssl_certificate',
  SERVER = 'server',
  
  // System & Admin
  AUDIT_LOG = 'audit_log',
  SYSTEM_SETTINGS = 'system_settings',
  PLUGIN = 'plugin',
  
  // Reporting & Analytics
  REPORT = 'report',
  ANALYTICS = 'analytics',
}

// Built-in roles with hierarchical permissions
export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  SUPPORT_AGENT = 'SUPPORT_AGENT',
  BILLING_AGENT = 'BILLING_AGENT',
  RESELLER = 'RESELLER',
  CLIENT = 'CLIENT',
  CLIENT_USER = 'CLIENT_USER', // Additional users under a client account
}

// Permission definition
export interface Permission {
  id: string;
  name: string;
  resource: ResourceType;
  action: PermissionAction;
  conditions?: PermissionCondition[];
  description: string;
}

// Permission conditions for fine-grained control
export interface PermissionCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'owns' | 'belongs_to_tenant';
  value: any;
}

// User permission context
export interface UserPermissionContext {
  userId: string;
  role: Role;
  tenantId?: string;
  clientId?: string;
  permissions?: string[]; // Permission IDs from database
  metadata?: Record<string, any>;
}

// Resource context for permission checks
export interface ResourceContext {
  type: ResourceType;
  id?: string;
  ownerId?: string;
  tenantId?: string;
  clientId?: string;
  metadata?: Record<string, any>;
}

export class PermissionManager extends EventEmitter {
  private static instance: PermissionManager;
  private rolePermissions: Map<Role, Set<string>> = new Map();
  private roleHierarchy: Map<Role, Role[]> = new Map();
  private permissions: Map<string, Permission> = new Map();
  private permissionsCache: Map<string, Permission> = new Map();
  private cacheExpiry: Date = new Date(0);
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    super();
    this.initializePermissions();
    this.initializeRoles();
    this.initializeRoleHierarchy();
  }

  static getInstance(): PermissionManager {
    if (!PermissionManager.instance) {
      PermissionManager.instance = new PermissionManager();
    }
    return PermissionManager.instance;
  }

  /**
   * Load permissions from database with caching
   */
  private async loadPermissions(): Promise<void> {
    if (this.cacheExpiry > new Date()) {
      return; // Cache is still valid
    }

    try {
      // Load all permissions
      const dbPermissions = await db.select().from(permissions);
      this.permissionsCache.clear();

      for (const perm of dbPermissions) {
        const permission: Permission = {
          id: perm.id,
          name: perm.name,
          resource: perm.resource as ResourceType,
          action: perm.action as PermissionAction,
          description: perm.description,
          conditions: perm.conditions ? JSON.parse(perm.conditions) : undefined
        };
        this.permissionsCache.set(perm.name, permission);
      }

      // Load role-permission mappings
      const rolePerms = await db.select({
        roleId: rolePermissions.roleId,
        permissionName: permissions.name
      })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id));

      this.rolePermissions.clear();
      for (const rolePerm of rolePerms) {
        const role = rolePerm.roleId as Role;
        if (!this.rolePermissions.has(role)) {
          this.rolePermissions.set(role, new Set());
        }
        this.rolePermissions.get(role)!.add(rolePerm.permissionName);
      }

      // Update cache expiry
      this.cacheExpiry = new Date(Date.now() + this.CACHE_TTL);
      
      logger.info(`Loaded ${this.permissionsCache.size} permissions and role mappings into cache`);
    } catch (error) {
      logger.error('Failed to load permissions from database:', error);
      throw error;
    }
  }

  /**
   * Check if user has a specific permission
   */
  async hasPermission(
    userContext: UserPermissionContext,
    permissionId: string,
    resourceContext?: ResourceContext
  ): Promise<boolean> {
    try {
      await this.loadPermissions();

      // Super admin bypass
      if (userContext.role === Role.SUPER_ADMIN) {
        return true;
      }

      // Check direct role permissions
      const rolePermissions = this.rolePermissions.get(userContext.role);
      let hasDirectPermission = false;
      
      if (rolePermissions?.has(permissionId)) {
        hasDirectPermission = true;
      } else {
        // Check inherited permissions through role hierarchy
        hasDirectPermission = await this.hasInheritedPermission(userContext.role, permissionId);
      }

      if (!hasDirectPermission) {
        return false;
      }

      // If there's no resource context, permission is granted
      if (!resourceContext) {
        return true;
      }

      // Get permission details for condition evaluation
      const permission = this.permissionsCache.get(permissionId);
      if (!permission) {
        logger.warn(`Permission not found: ${permissionId}`);
        return false;
      }

      // If permission has conditions, evaluate them
      if (permission.conditions && permission.conditions.length > 0) {
        return this.evaluateConditions(permission.conditions, userContext, resourceContext);
      }

      return true;
    } catch (error) {
      logger.error('Error checking permission:', error);
      return false;
    }
  }

  /**
   * Check if role has permission through inheritance
   */
  private async hasInheritedPermission(role: Role, permissionId: string): Promise<boolean> {
    try {
      // Get all roles that this role inherits from
      const inheritedRoles = await db.query.roleHierarchy.findMany({
        where: eq(roleHierarchy.childRole, role)
      });

      // Check if any inherited role has the permission
      for (const { parentRole } of inheritedRoles) {
        const rolePermissions = this.rolePermissions.get(parentRole as Role);
        if (rolePermissions?.has(permissionId)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error('Error checking inherited permissions:', error);
      return false;
    }
  }

  /**
   * Get all permissions for a user's role
   */
  async getUserPermissions(userContext: UserPermissionContext): Promise<string[]> {
    await this.loadPermissions();
    const rolePermissions = this.rolePermissions.get(userContext.role);
    return rolePermissions ? Array.from(rolePermissions) : [];
  }

  /**
   * Get all permissions for a specific role
   */
  async getRolePermissions(role: Role): Promise<string[]> {
    await this.loadPermissions();
    const rolePermissions = this.rolePermissions.get(role);
    return rolePermissions ? Array.from(rolePermissions) : [];
  }

  /**
   * Get permission definition by name
   */
  async getPermission(permissionName: string): Promise<Permission | undefined> {
    await this.loadPermissions();
    return this.permissionsCache.get(permissionName);
  }

  /**
   * Get all available permissions
   */
  async getAllPermissions(): Promise<Permission[]> {
    await this.loadPermissions();
    return Array.from(this.permissionsCache.values());
  }

  /**
   * Add a new permission to a role
   */
  async addPermissionToRole(role: Role, permissionName: string): Promise<void> {
    try {
      const permission = await db.select().from(permissions).where(eq(permissions.name, permissionName));
      if (permission.length === 0) {
        throw new Error(`Permission not found: ${permissionName}`);
      }

      await db.insert(rolePermissions).values({
        roleId: role,
        permissionId: permission[0].id
      });

      // Clear cache to force reload
      this.cacheExpiry = new Date(0);
      logger.info(`Added permission ${permissionName} to role ${role}`);
    } catch (error) {
      logger.error('Failed to add permission to role:', error);
      throw error;
    }
  }

  /**
   * Remove a permission from a role
   */
  async removePermissionFromRole(role: Role, permissionName: string): Promise<void> {
    try {
      const permission = await db.select().from(permissions).where(eq(permissions.name, permissionName));
      if (permission.length === 0) {
        throw new Error(`Permission not found: ${permissionName}`);
      }

      await db.delete(rolePermissions).where(
        and(
          eq(rolePermissions.roleId, role),
          eq(rolePermissions.permissionId, permission[0].id)
        )
      );

      // Clear cache to force reload
      this.cacheExpiry = new Date(0);
      logger.info(`Removed permission ${permissionName} from role ${role}`);
    } catch (error) {
      logger.error('Failed to remove permission from role:', error);
      throw error;
    }
  }

  /**
   * Clear permissions cache
   */
  clearCache(): void {
    this.cacheExpiry = new Date(0);
    this.rolePermissions.clear();
    this.permissionsCache.clear();
  }

  /**
   * Initialize all available permissions (DEPRECATED - now using database)
   */
  private initializePermissions(): void {
    const permissions: Permission[] = [
      // Client Management
      { id: 'client.create', resource: ResourceType.CLIENT, action: PermissionAction.CREATE, description: 'Create new clients' },
      { id: 'client.read', resource: ResourceType.CLIENT, action: PermissionAction.READ, description: 'View client information' },
      { id: 'client.update', resource: ResourceType.CLIENT, action: PermissionAction.UPDATE, description: 'Update client information' },
      { id: 'client.delete', resource: ResourceType.CLIENT, action: PermissionAction.DELETE, description: 'Delete clients' },
      { id: 'client.read_own', resource: ResourceType.CLIENT, action: PermissionAction.READ, conditions: [{ field: 'id', operator: 'owns', value: 'user.clientId' }], description: 'View own client information' },
      
      // User Management
      { id: 'user.create', resource: ResourceType.USER, action: PermissionAction.CREATE, description: 'Create new users' },
      { id: 'user.read', resource: ResourceType.USER, action: PermissionAction.READ, description: 'View user information' },
      { id: 'user.update', resource: ResourceType.USER, action: PermissionAction.UPDATE, description: 'Update user information' },
      { id: 'user.delete', resource: ResourceType.USER, action: PermissionAction.DELETE, description: 'Delete users' },
      { id: 'user.manage_roles', resource: ResourceType.USER, action: PermissionAction.MANAGE, description: 'Manage user roles and permissions' },
      
      // Invoice Management
      { id: 'invoice.create', resource: ResourceType.INVOICE, action: PermissionAction.CREATE, description: 'Create invoices' },
      { id: 'invoice.read', resource: ResourceType.INVOICE, action: PermissionAction.READ, description: 'View invoices' },
      { id: 'invoice.update', resource: ResourceType.INVOICE, action: PermissionAction.UPDATE, description: 'Update invoices' },
      { id: 'invoice.delete', resource: ResourceType.INVOICE, action: PermissionAction.DELETE, description: 'Delete invoices' },
      { id: 'invoice.read_own', resource: ResourceType.INVOICE, action: PermissionAction.READ, conditions: [{ field: 'clientId', operator: 'owns', value: 'user.clientId' }], description: 'View own invoices' },
      { id: 'invoice.process_payment', resource: ResourceType.INVOICE, action: PermissionAction.EXECUTE, description: 'Process invoice payments' },
      
      // Payment Management
      { id: 'payment.create', resource: ResourceType.PAYMENT, action: PermissionAction.CREATE, description: 'Create payment records' },
      { id: 'payment.read', resource: ResourceType.PAYMENT, action: PermissionAction.READ, description: 'View payment information' },
      { id: 'payment.read_sensitive', resource: ResourceType.PAYMENT, action: PermissionAction.VIEW_SENSITIVE, description: 'View sensitive payment data' },
      { id: 'payment.refund', resource: ResourceType.PAYMENT, action: PermissionAction.EXECUTE, description: 'Process refunds' },
      
      // Subscription Management
      { id: 'subscription.create', resource: ResourceType.SUBSCRIPTION, action: PermissionAction.CREATE, description: 'Create subscriptions' },
      { id: 'subscription.read', resource: ResourceType.SUBSCRIPTION, action: PermissionAction.READ, description: 'View subscriptions' },
      { id: 'subscription.update', resource: ResourceType.SUBSCRIPTION, action: PermissionAction.UPDATE, description: 'Update subscriptions' },
      { id: 'subscription.cancel', resource: ResourceType.SUBSCRIPTION, action: PermissionAction.EXECUTE, description: 'Cancel subscriptions' },
      { id: 'subscription.read_own', resource: ResourceType.SUBSCRIPTION, action: PermissionAction.READ, conditions: [{ field: 'clientId', operator: 'owns', value: 'user.clientId' }], description: 'View own subscriptions' },
      { id: 'subscription.cancel_own', resource: ResourceType.SUBSCRIPTION, action: PermissionAction.EXECUTE, conditions: [{ field: 'clientId', operator: 'owns', value: 'user.clientId' }], description: 'Cancel own subscriptions' },
      
      // Support Tickets
      { id: 'support_ticket.create', resource: ResourceType.SUPPORT_TICKET, action: PermissionAction.CREATE, description: 'Create support tickets' },
      { id: 'support_ticket.read', resource: ResourceType.SUPPORT_TICKET, action: PermissionAction.READ, description: 'View support tickets' },
      { id: 'support_ticket.update', resource: ResourceType.SUPPORT_TICKET, action: PermissionAction.UPDATE, description: 'Update support tickets' },
      { id: 'support_ticket.assign', resource: ResourceType.SUPPORT_TICKET, action: PermissionAction.EXECUTE, description: 'Assign support tickets' },
      { id: 'support_ticket.read_own', resource: ResourceType.SUPPORT_TICKET, action: PermissionAction.READ, conditions: [{ field: 'clientId', operator: 'owns', value: 'user.clientId' }], description: 'View own support tickets' },
      
      // Domain Management
      { id: 'domain.create', resource: ResourceType.DOMAIN, action: PermissionAction.CREATE, description: 'Register domains' },
      { id: 'domain.read', resource: ResourceType.DOMAIN, action: PermissionAction.READ, description: 'View domain information' },
      { id: 'domain.update', resource: ResourceType.DOMAIN, action: PermissionAction.UPDATE, description: 'Update domain settings' },
      { id: 'domain.delete', resource: ResourceType.DOMAIN, action: PermissionAction.DELETE, description: 'Delete domains' },
      { id: 'domain.read_own', resource: ResourceType.DOMAIN, action: PermissionAction.READ, conditions: [{ field: 'clientId', operator: 'owns', value: 'user.clientId' }], description: 'View own domains' },
      
      // SSL Certificate Management
      { id: 'ssl_certificate.create', resource: ResourceType.SSL_CERTIFICATE, action: PermissionAction.CREATE, description: 'Issue SSL certificates' },
      { id: 'ssl_certificate.read', resource: ResourceType.SSL_CERTIFICATE, action: PermissionAction.READ, description: 'View SSL certificates' },
      { id: 'ssl_certificate.update', resource: ResourceType.SSL_CERTIFICATE, action: PermissionAction.UPDATE, description: 'Update SSL certificates' },
      { id: 'ssl_certificate.delete', resource: ResourceType.SSL_CERTIFICATE, action: PermissionAction.DELETE, description: 'Delete SSL certificates' },
      
      // System Administration
      { id: 'system_settings.read', resource: ResourceType.SYSTEM_SETTINGS, action: PermissionAction.READ, description: 'View system settings' },
      { id: 'system_settings.update', resource: ResourceType.SYSTEM_SETTINGS, action: PermissionAction.UPDATE, description: 'Update system settings' },
      { id: 'audit_log.read', resource: ResourceType.AUDIT_LOG, action: PermissionAction.READ, description: 'View audit logs' },
      { id: 'plugin.manage', resource: ResourceType.PLUGIN, action: PermissionAction.MANAGE, description: 'Manage plugins' },
      
      // Reporting & Analytics
      { id: 'report.read', resource: ResourceType.REPORT, action: PermissionAction.READ, description: 'View reports' },
      { id: 'analytics.read', resource: ResourceType.ANALYTICS, action: PermissionAction.READ, description: 'View analytics' },
    ];

    permissions.forEach(permission => {
      this.permissions.set(permission.id, permission);
    });
  }

  /**
   * Initialize role-based permissions
   */
  private initializeRoles(): void {
    // Super Admin - Full access to everything
    this.rolePermissions.set(Role.SUPER_ADMIN, new Set([
      ...Array.from(this.permissions.keys())
    ]));

    // Admin - Most permissions except super admin functions
    this.rolePermissions.set(Role.ADMIN, new Set([
      'client.create', 'client.read', 'client.update', 'client.delete',
      'user.create', 'user.read', 'user.update', 'user.delete',
      'invoice.create', 'invoice.read', 'invoice.update', 'invoice.delete', 'invoice.process_payment',
      'payment.create', 'payment.read', 'payment.read_sensitive', 'payment.refund',
      'subscription.create', 'subscription.read', 'subscription.update', 'subscription.cancel',
      'support_ticket.create', 'support_ticket.read', 'support_ticket.update', 'support_ticket.assign',
      'domain.create', 'domain.read', 'domain.update', 'domain.delete',
      'ssl_certificate.create', 'ssl_certificate.read', 'ssl_certificate.update', 'ssl_certificate.delete',
      'system_settings.read', 'system_settings.update',
      'audit_log.read',
      'report.read', 'analytics.read',
    ]));

    // Manager - Business operations without system admin
    this.rolePermissions.set(Role.MANAGER, new Set([
      'client.create', 'client.read', 'client.update',
      'user.read', 'user.update',
      'invoice.create', 'invoice.read', 'invoice.update', 'invoice.process_payment',
      'payment.read', 'payment.refund',
      'subscription.read', 'subscription.update', 'subscription.cancel',
      'support_ticket.read', 'support_ticket.update', 'support_ticket.assign',
      'domain.read', 'domain.update',
      'ssl_certificate.read', 'ssl_certificate.update',
      'report.read', 'analytics.read',
    ]));

    // Support Agent - Support and limited client access
    this.rolePermissions.set(Role.SUPPORT_AGENT, new Set([
      'client.read',
      'user.read',
      'invoice.read',
      'payment.read',
      'subscription.read',
      'support_ticket.create', 'support_ticket.read', 'support_ticket.update', 'support_ticket.assign',
      'domain.read',
      'ssl_certificate.read',
    ]));

    // Billing Agent - Billing and payment focused
    this.rolePermissions.set(Role.BILLING_AGENT, new Set([
      'client.read',
      'invoice.create', 'invoice.read', 'invoice.update', 'invoice.process_payment',
      'payment.create', 'payment.read', 'payment.read_sensitive', 'payment.refund',
      'subscription.read', 'subscription.update', 'subscription.cancel',
      'report.read',
    ]));

    // Reseller - Limited client and service management
    this.rolePermissions.set(Role.RESELLER, new Set([
      'client.create', 'client.read', 'client.update',
      'invoice.read',
      'subscription.read',
      'support_ticket.create', 'support_ticket.read',
      'domain.create', 'domain.read', 'domain.update',
      'ssl_certificate.create', 'ssl_certificate.read',
    ]));

    // Client - Own resources only
    this.rolePermissions.set(Role.CLIENT, new Set([
      'client.read_own',
      'invoice.read_own', 'invoice.process_payment',
      'subscription.read_own', 'subscription.cancel_own',
      'support_ticket.create', 'support_ticket.read_own',
      'domain.read_own',
    ]));

    // Client User - Very limited access
    this.rolePermissions.set(Role.CLIENT_USER, new Set([
      'client.read_own',
      'invoice.read_own',
      'subscription.read_own',
      'support_ticket.create', 'support_ticket.read_own',
    ]));
  }

  /**
   * Initialize role hierarchy (roles inherit permissions from lower roles)
   */
  private initializeRoleHierarchy(): void {
    this.roleHierarchy.set(Role.SUPER_ADMIN, []);
    this.roleHierarchy.set(Role.ADMIN, [Role.MANAGER]);
    this.roleHierarchy.set(Role.MANAGER, [Role.SUPPORT_AGENT, Role.BILLING_AGENT]);
    this.roleHierarchy.set(Role.SUPPORT_AGENT, []);
    this.roleHierarchy.set(Role.BILLING_AGENT, []);
    this.roleHierarchy.set(Role.RESELLER, []);
    this.roleHierarchy.set(Role.CLIENT, [Role.CLIENT_USER]);
    this.roleHierarchy.set(Role.CLIENT_USER, []);
  }

  /**
   * Check if user has permission for a specific action on a resource
   */
  hasPermission(
    userContext: UserPermissionContext,
    permissionId: string,
    resourceContext?: ResourceContext
  ): boolean {
    try {
      // Get permission definition
      const permission = this.permissions.get(permissionId);
      if (!permission) {
        console.warn(`Permission ${permissionId} not found`);
        return false;
      }

      // Check if user's role has this permission
      if (!this.roleHasPermission(userContext.role, permissionId)) {
        return false;
      }

      // Check permission conditions if any
      if (permission.conditions && resourceContext) {
        return this.evaluateConditions(permission.conditions, userContext, resourceContext);
      }

      return true;
    } catch (error) {
      console.error('Error checking permission:', error);
      return false;
    }
  }

  /**
   * Check if role has permission (including inherited permissions)
   */
  private roleHasPermission(role: Role, permissionId: string): boolean {
    // Check direct permissions
    const rolePerms = this.rolePermissions.get(role);
    if (rolePerms?.has(permissionId)) {
      return true;
    }

    // Check inherited permissions
    const inheritedRoles = this.roleHierarchy.get(role) || [];
    return inheritedRoles.some(inheritedRole => this.roleHasPermission(inheritedRole, permissionId));
  }

  /**
   * Evaluate permission conditions
   */
  private evaluateConditions(
    conditions: PermissionCondition[],
    userContext: UserPermissionContext,
    resourceContext: ResourceContext
  ): boolean {
    // Evaluate all conditions (AND logic)
    return conditions.every(condition => {
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

  /**
   * Get field value from context
   */
  private getFieldValue(
    field: string,
    userContext: UserPermissionContext,
    resourceContext: ResourceContext
  ): any {
    if (field.startsWith('user.')) {
      const userField = field.substring(5);
      return (userContext as any)[userField];
    }
    
    if (field.startsWith('resource.')) {
      const resourceField = field.substring(9);
      return (resourceContext as any)[resourceField];
    }
    
    return (resourceContext as any)[field];
  }

  /**
   * Check ownership conditions
   */
  private checkOwnership(
    field: string,
    value: string,
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

  /**
   * Get all permissions for a role
   */
  getRolePermissions(role: Role): string[] {
    const permissions = new Set<string>();
    
    // Add direct permissions
    const rolePerms = this.rolePermissions.get(role);
    if (rolePerms) {
      rolePerms.forEach(perm => permissions.add(perm));
    }
    
    // Add inherited permissions
    const inheritedRoles = this.roleHierarchy.get(role) || [];
    inheritedRoles.forEach(inheritedRole => {
      this.getRolePermissions(inheritedRole).forEach(perm => permissions.add(perm));
    });
    
    return Array.from(permissions);
  }

  /**
   * Get permission definition
   */
  getPermission(permissionId: string): Permission | undefined {
    return this.permissions.get(permissionId);
  }

  /**
   * Get all available permissions
   */
  getAllPermissions(): Permission[] {
    return Array.from(this.permissions.values());
  }

  /**
   * Get available roles
   */
  getAvailableRoles(): Role[] {
    return Object.values(Role);
  }
}

// Export singleton instance
export const permissionManager = PermissionManager.getInstance(); 