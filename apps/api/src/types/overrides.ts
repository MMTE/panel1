// Temporary type overrides for v0.1.0 release
// TODO: Remove these overrides in v0.1.1 and fix the underlying type issues

import { SQL } from 'drizzle-orm';

// Permission System Overrides
export interface UserPermissionContext {
  userId: string;
  role: string;
  tenantId: string;
  clientId?: string;
  permissions?: string[];
}

export interface ResourceContext {
  tenantId?: string;
  clientId?: string;
  [key: string]: any;
}

// Database Operation Overrides
export interface ServiceParameters {
  serviceName?: string;
  serviceType?: string;
  domain?: string;
  email?: string;
  password?: string;
  planId?: string;
  metadata?: Record<string, any>;
  username?: string;
  diskQuota?: number;
  bandwidthQuota?: number;
  packageName?: string;
  [key: string]: any;
}

// Event System Overrides
export interface EventPayload {
  type: string;
  data: any;
  metadata?: Record<string, any>;
  timestamp?: Date;
  source?: string;
  tenantId?: string;
  userId?: string;
  correlationId?: string;
}

export interface EventOptions {
  source?: string;
  tenantId?: string;
  delay?: number;
  priority?: number;
  userId?: string;
  correlationId?: string;
}

// Plugin System Overrides
export interface PluginMetadata {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  dependencies?: Record<string, string>;
  permissions?: string[];
  [key: string]: any;
}

// Drizzle Query Builder Extensions
declare module 'drizzle-orm/pg-core' {
  interface PgSelectBase<T extends Record<string, any>> {
    where: (condition: SQL<unknown>) => PgSelectBase<T>;
    $count: () => number;
  }
}

// Auth User Extensions
declare module './auth' {
  interface AuthUser {
    id: string;
    email: string;
    role: string;
    tenantId: string;
    clientId?: string;
    permissions?: string[];
  }
}

// Component Type Extensions
export interface ComponentConfig {
  componentId: string;
  pricing: 'FIXED' | 'PER_UNIT' | 'TIERED' | 'VOLUME' | 'USAGE_BASED';
  unitPrice?: string;
  includedUnits?: number;
  configuration?: Record<string, any>;
  tiers?: Array<{
    from: number;
    to: number | null;
    price: string;
  }>;
  provisioningProvider?: string;
  usageTrackingSupported?: boolean;
}

// Subscription Type Extensions
export interface CreateSubscriptionParams {
  tenantId: string;
  clientId: string;
  planId?: string;
  paymentMethodId?: string;
  metadata?: Record<string, any>;
  productId?: string;
  trialDays?: number;
}

// Support System Extensions
export interface CreateTicketParams {
  clientId: string;
  subject: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  categoryId?: string;
  assignedToId?: string;
  tags?: string[];
  customFields?: Record<string, any>;
  content?: string;
  attachments?: Array<{
    filename: string;
    fileSize: number;
    mimeType: string;
    url: string;
  }>;
}

// SLA System Extensions
export interface DateRange {
  start: Date;
  end: Date;
}

// Automation System Extensions
export interface AutomationCondition {
  field: string;
  operator: string;
  value: any;
}

export interface AutomationAction {
  type: string;
  parameters: Record<string, any>;
}

export interface AutomationRule {
  name: string;
  description?: string;
  triggerEvent: string;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  priority?: number;
  maxExecutions?: number;
} 