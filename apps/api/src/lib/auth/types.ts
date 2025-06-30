export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  STAFF = 'STAFF',
  AGENT = 'AGENT',
  SUPPORT_AGENT = 'SUPPORT_AGENT',
  BILLING_AGENT = 'BILLING_AGENT',
  RESELLER = 'RESELLER',
  CLIENT = 'CLIENT',
  CLIENT_USER = 'CLIENT_USER'
}

export enum ResourceType {
  TENANT = 'TENANT',
  USER = 'USER',
  CLIENT = 'CLIENT',
  PRODUCT = 'PRODUCT',
  COMPONENT = 'COMPONENT',
  SUBSCRIPTION = 'SUBSCRIPTION',
  INVOICE = 'INVOICE',
  PAYMENT = 'PAYMENT',
  TICKET = 'TICKET',
  PLAN = 'PLAN',
  SYSTEM_SETTINGS = 'SYSTEM_SETTINGS',
  SUPPORT_TICKET = 'SUPPORT_TICKET',
  PLUGIN = 'PLUGIN',
  AUDIT_LOG = 'AUDIT_LOG',
  ANALYTICS = 'ANALYTICS'
}

export enum PermissionAction {
  CREATE = 'CREATE',
  READ = 'READ',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  LIST = 'LIST',
  MANAGE = 'MANAGE',
  ASSIGN = 'ASSIGN',
  REVOKE = 'REVOKE',
  EXECUTE = 'EXECUTE',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  CANCEL = 'CANCEL',
  REFUND = 'REFUND',
  VIEW_ALL = 'VIEW_ALL',
  MODIFY_ALL = 'MODIFY_ALL'
}

export interface Permission {
  id: string;
  name: string;
  resource: ResourceType;
  action: PermissionAction;
  description?: string;
  conditions?: Record<string, any>[];
  metadata?: Record<string, any>;
  isSystem?: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  tenantId: string;
  role: Role;
  clientId?: string;
  permissions: string[];
  metadata?: Record<string, any>;
  isActive?: boolean;
  lastLoginAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface UserContext {
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
  clientId?: string;
  tenantId?: string;
}

export interface CreateTicketParams {
  subject: string;
  content: string;
  clientId?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  categoryId?: string;
  assignedToId?: string;
  tags?: string[];
  customFields?: Record<string, any>;
  attachments?: Array<{
    filename: string;
    fileSize: number;
    mimeType: string;
    url: string;
  }>;
}

export interface CreateSubscriptionParams {
  tenantId: string;
  clientId: string;
  planId?: string;
  productId?: string;
  paymentMethodId?: string;
  metadata?: Record<string, any>;
  trialDays?: number;
}

export interface AddMessageParams {
  content: string;
  isInternal?: boolean;
  attachments?: Array<{
    filename: string;
    fileSize: number;
    mimeType: string;
    url: string;
  }>;
}

export interface AutomationCondition {
  field: string;
  operator: string;
  value: any;
}

export interface AutomationAction {
  type: string;
  parameters: Record<string, any>;
}

export interface EventPayload {
  source?: string;
  tenantId?: string;
  delay?: number;
  priority?: number;
  userId?: string;
  correlationId?: string;
  data: Record<string, any>;
}