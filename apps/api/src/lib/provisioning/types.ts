// Core provisioning types and interfaces

export interface ProvisioningConfig {
  hostname: string;
  port: number;
  username?: string;
  apiKey?: string;
  apiSecret?: string;
  useSSL: boolean;
  verifySSL: boolean;
  timeout?: number;
  retries?: number;
  [key: string]: any;
}

export interface ServiceParameters {
  serviceName: string;
  serviceType: string;
  username?: string;
  password?: string;
  email?: string;
  domain?: string;
  
  // Resource allocations
  diskQuota?: number; // MB
  bandwidthQuota?: number; // MB
  emailAccounts?: number;
  databases?: number;
  subdomains?: number;
  
  // Additional parameters
  packageName?: string;
  planId?: string;
  customFields?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface ProvisioningResult {
  success: boolean;
  message?: string;
  data?: {
    remoteId?: string;
    username?: string;
    password?: string;
    controlPanelUrl?: string;
    ipAddress?: string;
    nameservers?: string[];
    [key: string]: any;
  };
  error?: {
    code?: string;
    message: string;
    details?: any;
  };
}

export interface HealthCheckResult {
  healthy: boolean;
  status: 'healthy' | 'warning' | 'error';
  message?: string;
  responseTime?: number;
  details?: Record<string, any>;
}

export interface ProvisioningAdapter {
  // Core provisioning operations
  provision(params: ServiceParameters): Promise<ProvisioningResult>;
  suspend(params: ServiceParameters): Promise<ProvisioningResult>;
  unsuspend(params: ServiceParameters): Promise<ProvisioningResult>;
  terminate(params: ServiceParameters): Promise<ProvisioningResult>;
  
  // Optional operations
  modify?(params: ServiceParameters): Promise<ProvisioningResult>;
  reinstall?(params: ServiceParameters): Promise<ProvisioningResult>;
  backup?(params: ServiceParameters): Promise<ProvisioningResult>;
  restore?(params: ServiceParameters): Promise<ProvisioningResult>;
  
  // Health and status
  healthCheck(): Promise<HealthCheckResult>;
  getServiceInfo?(remoteId: string): Promise<ProvisioningResult>;
  
  // Utility methods
  testConnection(): Promise<boolean>;
  validateParameters(params: ServiceParameters): Promise<boolean>;
}

export interface ProvisioningPlugin {
  name: string;
  type: string;
  version: string;
  description?: string;
  
  // Plugin lifecycle
  initialize(config: ProvisioningConfig): Promise<void>;
  destroy(): Promise<void>;
  
  // Adapter factory
  createAdapter(config: ProvisioningConfig): ProvisioningAdapter;
  
  // Plugin metadata
  getMetadata(): {
    name: string;
    type: string;
    version: string;
    description?: string;
    supportedOperations: string[];
    requiredConfig: string[];
    optionalConfig?: string[];
  };
}

export interface ProvisioningHookData {
  operation: string;
  serviceInstanceId: string;
  providerId: string;
  parameters: ServiceParameters;
  result?: ProvisioningResult;
  error?: Error;
  tenantId: string;
}

export interface ProvisioningJobData {
  operation: string;
  serviceInstanceId: string;
  providerId: string;
  parameters: ServiceParameters;
  tenantId: string;
  
  // Job metadata
  priority?: number;
  delay?: number;
  attempts?: number;
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
}

// Webhook/Event types
export interface ProvisioningWebhookPayload {
  event: string;
  timestamp: Date;
  serviceInstanceId: string;
  providerId: string;
  data: Record<string, any>;
  tenantId: string;
}

// Provider configuration templates
export interface ProviderTemplate {
  type: string;
  name: string;
  description: string;
  defaultConfig: Partial<ProvisioningConfig>;
  requiredFields: string[];
  optionalFields: string[];
  supportedOperations: string[];
}

// Service synchronization
export interface ServiceSyncData {
  remoteId: string;
  status: string;
  diskUsage?: number;
  bandwidthUsage?: number;
  lastActivity?: Date;
  metadata?: Record<string, any>;
}

export interface SyncResult {
  success: boolean;
  updated: number;
  errors: Array<{
    serviceInstanceId: string;
    error: string;
  }>;
}

// Provider status and monitoring
export interface ProviderStatus {
  healthy: boolean;
  lastCheck: Date;
  responseTime: number;
  activeServices: number;
  totalServices: number;
  diskUsage?: number;
  loadAverage?: number;
  errors?: string[];
}

// Provisioning events
export type ProvisioningEventType = 
  | 'provision.started'
  | 'provision.completed'
  | 'provision.failed'
  | 'suspend.started'
  | 'suspend.completed'
  | 'suspend.failed'
  | 'unsuspend.started'
  | 'unsuspend.completed'
  | 'unsuspend.failed'
  | 'terminate.started'
  | 'terminate.completed'
  | 'terminate.failed'
  | 'modify.started'
  | 'modify.completed'
  | 'modify.failed'
  | 'sync.started'
  | 'sync.completed'
  | 'sync.failed'
  | 'health.check'
  | 'health.warning'
  | 'health.error';

export interface ProvisioningEvent {
  type: ProvisioningEventType;
  timestamp: Date;
  serviceInstanceId?: string;
  providerId: string;
  data: Record<string, any>;
  tenantId: string;
}

// Error types
export class ProvisioningError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: any,
    public retryable = false
  ) {
    super(message);
    this.name = 'ProvisioningError';
  }
}

export class ProviderConnectionError extends ProvisioningError {
  constructor(message: string, details?: any) {
    super(message, 'PROVIDER_CONNECTION_ERROR', details, true);
    this.name = 'ProviderConnectionError';
  }
}

export class ProviderAuthenticationError extends ProvisioningError {
  constructor(message: string, details?: any) {
    super(message, 'PROVIDER_AUTH_ERROR', details, false);
    this.name = 'ProviderAuthenticationError';
  }
}

export class ServiceNotFoundError extends ProvisioningError {
  constructor(message: string, details?: any) {
    super(message, 'SERVICE_NOT_FOUND', details, false);
    this.name = 'ServiceNotFoundError';
  }
}

export class QuotaExceededError extends ProvisioningError {
  constructor(message: string, details?: any) {
    super(message, 'QUOTA_EXCEEDED', details, false);
    this.name = 'QuotaExceededError';
  }
} 