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

// Role definition
export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  metadata?: Record<string, any>;
}

// Role-Permission mapping
export interface RolePermission {
  roleId: string;
  permissionId: string;
  grantedAt: Date;
  grantedBy?: string;
  conditions?: PermissionCondition[];
}

// Role hierarchy
export interface RoleHierarchy {
  parentRole: string;
  childRole: string;
  metadata?: Record<string, any>;
}

// Permission group for organizing permissions
export interface PermissionGroup {
  id: string;
  name: string;
  description: string;
  permissions: string[]; // Permission IDs
}

// User role assignment
export interface UserRole {
  userId: string;
  roleId: string;
  tenantId?: string;
  assignedAt: Date;
  assignedBy?: string;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

// Permission check result
export interface PermissionCheckResult {
  granted: boolean;
  reason?: string;
  conditions?: PermissionCondition[];
}

// Role assignment options
export interface RoleAssignmentOptions {
  expiresAt?: Date;
  metadata?: Record<string, any>;
  conditions?: PermissionCondition[];
}

// Permission update options
export interface PermissionUpdateOptions {
  conditions?: PermissionCondition[];
  metadata?: Record<string, any>;
}

// Role update options
export interface RoleUpdateOptions {
  name?: string;
  description?: string;
  metadata?: Record<string, any>;
}

// Permission request for checking multiple permissions at once
export interface PermissionRequest {
  permissionId: string;
  resourceContext?: ResourceContext;
}

// Batch permission check result
export interface BatchPermissionCheckResult {
  [permissionId: string]: PermissionCheckResult;
} 