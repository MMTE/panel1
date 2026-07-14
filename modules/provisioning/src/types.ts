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
  diskQuota?: number;
  bandwidthQuota?: number;
  emailAccounts?: number;
  databases?: number;
  subdomains?: number;
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

export interface IProvisioner {
  provision(params: ServiceParameters): Promise<ProvisioningResult>;
  suspend(params: ServiceParameters): Promise<ProvisioningResult>;
  unsuspend(params: ServiceParameters): Promise<ProvisioningResult>;
  terminate(params: ServiceParameters): Promise<ProvisioningResult>;
  modify?(params: ServiceParameters): Promise<ProvisioningResult>;
  reinstall?(params: ServiceParameters): Promise<ProvisioningResult>;
  backup?(params: ServiceParameters): Promise<ProvisioningResult>;
  restore?(params: ServiceParameters): Promise<ProvisioningResult>;
  healthCheck(): Promise<HealthCheckResult>;
  getServiceInfo?(remoteId: string): Promise<ProvisioningResult>;
  testConnection(): Promise<boolean>;
  validateParameters(params: ServiceParameters): Promise<boolean>;
}

export interface ProvisioningPlugin {
  name: string;
  type: string;
  version: string;
  description?: string;
  initialize(config: ProvisioningConfig): Promise<void>;
  destroy(): Promise<void>;
  createAdapter(config: ProvisioningConfig): IProvisioner;
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

export interface CreateProviderInput {
  name: string;
  type: string;
  hostname: string;
  port?: number;
  username?: string;
  apiKey?: string;
  apiSecret?: string;
  useSSL?: boolean;
  verifySSL?: boolean;
  config?: Record<string, any>;
  isActive?: boolean;
}

export interface CreateServiceInstanceInput {
  subscriptionId?: string;
  providerId: string;
  serviceName: string;
  serviceType: string;
  username?: string;
  password?: string;
  email?: string;
  domain?: string;
  diskQuota?: number;
  bandwidthQuota?: number;
  emailAccounts?: number;
  databases?: number;
  subdomains?: number;
  packageName?: string;
  metadata?: Record<string, any>;
}

export interface ProviderDTO {
  id: string;
  name: string;
  type: string;
  hostname: string;
  port: number | null;
  username: string | null;
  isActive: boolean | null;
  lastHealthCheck: Date | null;
  healthStatus: string | null;
  metadata: Record<string, any> | null;
  tenantId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ServiceInstanceDTO {
  id: string;
  subscriptionId: string | null;
  providerId: string | null;
  serviceName: string;
  serviceType: string;
  remoteId: string | null;
  controlPanelUrl: string | null;
  username: string | null;
  status: string | null;
  diskQuota: number | null;
  bandwidthQuota: number | null;
  lastSync: Date | null;
  metadata: Record<string, any> | null;
  tenantId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ProvisioningTaskDTO {
  id: string;
  serviceInstanceId: string | null;
  providerId: string | null;
  operation: string;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  attemptNumber: number | null;
  errorMessage: string | null;
  tenantId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IProvisioningService {
  createProvider(input: CreateProviderInput, tenantId: string): Promise<ProviderDTO>;
  getProvider(id: string, tenantId: string): Promise<ProviderDTO | null>;
  listProviders(tenantId: string): Promise<ProviderDTO[]>;
  updateProvider(id: string, data: Partial<CreateProviderInput>, tenantId: string): Promise<ProviderDTO>;
  deleteProvider(id: string, tenantId: string): Promise<void>;
  testProviderConnection(id: string, tenantId: string): Promise<{ healthy: boolean; message?: string }>;

  createServiceInstance(input: CreateServiceInstanceInput, tenantId: string): Promise<ServiceInstanceDTO>;
  getServiceInstance(id: string, tenantId: string): Promise<ServiceInstanceDTO | null>;
  listServiceInstances(tenantId: string, subscriptionId?: string): Promise<ServiceInstanceDTO[]>;
  deleteServiceInstance(id: string, tenantId: string): Promise<void>;

  provisionService(instanceId: string, tenantId: string): Promise<ProvisioningTaskDTO>;
  suspendService(instanceId: string, tenantId: string): Promise<ProvisioningTaskDTO>;
  unsuspendService(instanceId: string, tenantId: string): Promise<ProvisioningTaskDTO>;
  terminateService(instanceId: string, tenantId: string): Promise<ProvisioningTaskDTO>;

  getTask(id: string, tenantId: string): Promise<ProvisioningTaskDTO | null>;
  listTasks(tenantId: string, serviceInstanceId?: string): Promise<ProvisioningTaskDTO[]>;
  runHealthCheck(tenantId: string): Promise<void>;
}

declare module '@panel1/types' {
  interface EventMap {
    'provisioning.started': { serviceInstanceId: string; providerId: string; tenantId: string };
    'provisioning.completed': { serviceInstanceId: string; providerId: string; tenantId: string };
    'provisioning.failed': { serviceInstanceId: string; providerId: string; error: string; tenantId: string };
    'provisioning.suspended': { serviceInstanceId: string; providerId: string; tenantId: string };
    'provisioning.unsuspended': { serviceInstanceId: string; providerId: string; tenantId: string };
    'provisioning.terminated': { serviceInstanceId: string; providerId: string; tenantId: string };
  }
}
