import type { ModuleContext } from '@panel1/types';
import { eq, and, desc, sql } from 'drizzle-orm';
import { provisioningProviders, serviceInstances, provisioningTasks } from './schema.js';
import type { ProviderDTO, ServiceInstanceDTO, ProvisioningTaskDTO } from './types.js';
import type {
  IProvisioningService,
  CreateProviderInput,
  CreateServiceInstanceInput,
  ProvisioningConfig,
  ServiceParameters,
  ProvisioningResult,
  IProvisioner,
  ProvisioningPlugin,
} from './types.js';
import { CpanelAdapter } from './adapters/CpanelAdapter.js';

export class ProvisioningService implements IProvisioningService {
  private db: any;
  private ctx: ModuleContext;
  private plugins: Map<string, ProvisioningPlugin> = new Map();
  private adapterCache: Map<string, IProvisioner> = new Map();

  constructor(ctx: ModuleContext) {
    this.ctx = ctx;
    this.db = ctx.db;
    this.registerBuiltInPlugins();
  }

  // ── Provider management ──

  async createProvider(input: CreateProviderInput, tenantId: string): Promise<ProviderDTO> {
    const plugin = this.plugins.get(input.type);
    if (!plugin) throw new Error(`Plugin not found for type: ${input.type}`);

    const config = this.buildConfig(input);
    const adapter = plugin.createAdapter(config);
    const isConnected = await adapter.testConnection();
    if (!isConnected) throw new Error('Failed to connect to provider');

    const encryptedApiKey = input.apiKey ? await this.encrypt(input.apiKey) : null;
    const encryptedSecret = input.apiSecret ? await this.encrypt(input.apiSecret) : null;

    const [provider] = await this.db
      .insert(provisioningProviders)
      .values({
        name: input.name,
        type: input.type as any,
        hostname: input.hostname,
        port: input.port ?? 2087,
        username: input.username,
        apiKey: encryptedApiKey,
        apiSecret: encryptedSecret,
        useSSL: input.useSSL ?? true,
        verifySSL: input.verifySSL ?? true,
        config: input.config || {},
        isActive: true,
        healthStatus: 'healthy',
        lastHealthCheck: new Date(),
        tenantId,
      })
      .returning();

    this.adapterCache.set(provider.id, adapter);
    return provider;
  }

  async getProvider(id: string, tenantId: string): Promise<ProviderDTO | null> {
    const [row] = await this.db
      .select()
      .from(provisioningProviders)
      .where(and(eq(provisioningProviders.id, id), eq(provisioningProviders.tenantId, tenantId)))
      .limit(1);
    return row || null;
  }

  async listProviders(tenantId: string): Promise<ProviderDTO[]> {
    return this.db
      .select()
      .from(provisioningProviders)
      .where(eq(provisioningProviders.tenantId, tenantId))
      .orderBy(desc(provisioningProviders.createdAt));
  }

  async updateProvider(id: string, data: Partial<CreateProviderInput>, tenantId: string): Promise<ProviderDTO> {
    const updateData: any = { updatedAt: new Date() };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.hostname !== undefined) updateData.hostname = data.hostname;
    if (data.port !== undefined) updateData.port = data.port;
    if (data.username !== undefined) updateData.username = data.username;
    if (data.apiKey !== undefined) updateData.apiKey = data.apiKey ? await this.encrypt(data.apiKey) : null;
    if (data.apiSecret !== undefined) updateData.apiSecret = data.apiSecret ? await this.encrypt(data.apiSecret) : null;
    if (data.useSSL !== undefined) updateData.useSSL = data.useSSL;
    if (data.verifySSL !== undefined) updateData.verifySSL = data.verifySSL;
    if (data.config !== undefined) updateData.config = data.config;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const [updated] = await this.db
      .update(provisioningProviders)
      .set(updateData)
      .where(and(eq(provisioningProviders.id, id), eq(provisioningProviders.tenantId, tenantId)))
      .returning();

    if (!updated) throw new Error('Provider not found');

    // Clear adapter cache so next call rebuilds with new config
    this.adapterCache.delete(id);

    return updated;
  }

  async deleteProvider(id: string, tenantId: string): Promise<void> {
    const [provider] = await this.db
      .select()
      .from(provisioningProviders)
      .where(and(eq(provisioningProviders.id, id), eq(provisioningProviders.tenantId, tenantId)))
      .limit(1);

    if (!provider) throw new Error('Provider not found');

    const [{ instanceCount }] = await this.db
      .select({ instanceCount: sql<number>`count(*)::int` })
      .from(serviceInstances)
      .where(eq(serviceInstances.providerId, id));

    if (Number(instanceCount) > 0) {
      throw new Error('Cannot delete provider with active service instances');
    }

    await this.db
      .update(provisioningProviders)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(provisioningProviders.id, id));

    this.adapterCache.delete(id);
  }

  async testProviderConnection(id: string, tenantId: string): Promise<{ healthy: boolean; message?: string }> {
    const adapter = await this.getAdapter(id, tenantId);
    const health = await adapter.healthCheck();
    return { healthy: health.healthy, message: health.message };
  }

  // ── Service instance management ──

  async createServiceInstance(input: CreateServiceInstanceInput, tenantId: string): Promise<ServiceInstanceDTO> {
    const [provider] = await this.db
      .select()
      .from(provisioningProviders)
      .where(and(eq(provisioningProviders.id, input.providerId), eq(provisioningProviders.tenantId, tenantId)))
      .limit(1);

    if (!provider) throw new Error('Provider not found');
    if (!provider.isActive) throw new Error('Provider is not active');

    const [instance] = await this.db
      .insert(serviceInstances)
      .values({
        subscriptionId: input.subscriptionId || null,
        providerId: input.providerId,
        serviceName: input.serviceName,
        serviceType: input.serviceType,
        status: 'pending',
        diskQuota: input.diskQuota,
        bandwidthQuota: input.bandwidthQuota,
        emailAccounts: input.emailAccounts,
        databases: input.databases,
        subdomains: input.subdomains,
        metadata: input.metadata || {},
        tenantId,
      })
      .returning();

    return instance;
  }

  async getServiceInstance(id: string, tenantId: string): Promise<ServiceInstanceDTO | null> {
    const [row] = await this.db
      .select()
      .from(serviceInstances)
      .where(and(eq(serviceInstances.id, id), eq(serviceInstances.tenantId, tenantId)))
      .limit(1);
    return row || null;
  }

  async listServiceInstances(tenantId: string, subscriptionId?: string): Promise<ServiceInstanceDTO[]> {
    const conditions: any[] = [eq(serviceInstances.tenantId, tenantId)];
    if (subscriptionId) conditions.push(eq(serviceInstances.subscriptionId, subscriptionId));

    return this.db
      .select()
      .from(serviceInstances)
      .where(and(...conditions))
      .orderBy(desc(serviceInstances.createdAt));
  }

  async deleteServiceInstance(id: string, tenantId: string): Promise<void> {
    const [instance] = await this.db
      .select()
      .from(serviceInstances)
      .where(and(eq(serviceInstances.id, id), eq(serviceInstances.tenantId, tenantId)))
      .limit(1);

    if (!instance) throw new Error('Service instance not found');
    if (instance.status === 'active') throw new Error('Cannot delete an active service instance');

    await this.db
      .update(serviceInstances)
      .set({ status: 'terminated', updatedAt: new Date() })
      .where(eq(serviceInstances.id, id));
  }

  // ── Provisioning operations ──

  async provisionService(instanceId: string, tenantId: string): Promise<ProvisioningTaskDTO> {
    return this.executeOperation('provision', instanceId, tenantId);
  }

  async suspendService(instanceId: string, tenantId: string): Promise<ProvisioningTaskDTO> {
    return this.executeOperation('suspend', instanceId, tenantId);
  }

  async unsuspendService(instanceId: string, tenantId: string): Promise<ProvisioningTaskDTO> {
    return this.executeOperation('unsuspend', instanceId, tenantId);
  }

  async terminateService(instanceId: string, tenantId: string): Promise<ProvisioningTaskDTO> {
    return this.executeOperation('terminate', instanceId, tenantId);
  }

  // ── Task management ──

  async getTask(id: string, tenantId: string): Promise<ProvisioningTaskDTO | null> {
    const [row] = await this.db
      .select()
      .from(provisioningTasks)
      .where(and(eq(provisioningTasks.id, id), eq(provisioningTasks.tenantId, tenantId)))
      .limit(1);
    return row || null;
  }

  async listTasks(tenantId: string, serviceInstanceId?: string): Promise<ProvisioningTaskDTO[]> {
    const conditions: any[] = [eq(provisioningTasks.tenantId, tenantId)];
    if (serviceInstanceId) conditions.push(eq(provisioningTasks.serviceInstanceId, serviceInstanceId));

    return this.db
      .select()
      .from(provisioningTasks)
      .where(and(...conditions))
      .orderBy(desc(provisioningTasks.createdAt))
      .limit(100);
  }

  async runHealthCheck(tenantId: string): Promise<void> {
    const providers = await this.listProviders(tenantId);
    for (const provider of providers) {
      try {
        const adapter = await this.getAdapter(provider.id, tenantId);
        const result = await adapter.healthCheck();
        await this.db
          .update(provisioningProviders)
          .set({
            healthStatus: result.status,
            lastHealthCheck: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(provisioningProviders.id, provider.id));
      } catch (err) {
        await this.db
          .update(provisioningProviders)
          .set({
            healthStatus: 'error',
            lastHealthCheck: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(provisioningProviders.id, provider.id));
        this.ctx.logger.error(`Health check failed for provider ${provider.id}`, { error: err });
      }
    }
  }

  // ── Private helpers ──

  private async executeOperation(operation: string, instanceId: string, tenantId: string): Promise<ProvisioningTaskDTO> {
    const instance = await this.getServiceInstance(instanceId, tenantId);
    if (!instance) throw new Error('Service instance not found');
    if (!instance.providerId) throw new Error('Service instance has no provider');

    const [task] = await this.db
      .insert(provisioningTasks)
      .values({
        serviceInstanceId: instanceId,
        providerId: instance.providerId,
        operation: operation as any,
        status: 'pending',
        requestData: { serviceName: instance.serviceName, serviceType: instance.serviceType },
        tenantId,
      })
      .returning();

    // Execute the operation asynchronously via the job scheduler
    this.processTask(task.id, instance, operation, tenantId).catch((err) => {
      this.ctx.logger.error(`Background task ${task.id} failed`, { error: err });
    });

    return task;
  }

  private async processTask(taskId: string, instance: ServiceInstanceDTO, operation: string, tenantId: string): Promise<void> {
    const adapter = await this.getAdapter(instance.providerId!, tenantId);

    await this.db
      .update(provisioningTasks)
      .set({ status: 'in_progress', startedAt: new Date(), updatedAt: new Date() })
      .where(eq(provisioningTasks.id, taskId));

    const params: ServiceParameters = {
      serviceName: instance.serviceName,
      serviceType: instance.serviceType,
      username: instance.username || undefined,
      email: instance.metadata?.email as string | undefined,
      domain: instance.metadata?.domain as string | undefined,
      diskQuota: instance.diskQuota || undefined,
      bandwidthQuota: instance.bandwidthQuota || undefined,
    };

    let result: ProvisioningResult;
    try {
      switch (operation) {
        case 'provision':
          result = await adapter.provision(params);
          break;
        case 'suspend':
          result = await adapter.suspend(params);
          break;
        case 'unsuspend':
          result = await adapter.unsuspend(params);
          break;
        case 'terminate':
          result = await adapter.terminate(params);
          break;
        default:
          throw new Error(`Unsupported operation: ${operation}`);
      }
    } catch (err) {
      result = {
        success: false,
        error: { message: err instanceof Error ? err.message : 'Unknown error' },
      };
    }

    const status = result.success ? 'completed' : 'failed';
    await this.db
      .update(provisioningTasks)
      .set({
        status,
        responseData: result,
        completedAt: new Date(),
        errorMessage: result.error?.message,
        errorDetails: result.error,
        updatedAt: new Date(),
      })
      .where(eq(provisioningTasks.id, taskId));

    // Update service instance status
    const instanceStatus = result.success
      ? (operation === 'terminate' ? 'terminated' : operation === 'suspend' ? 'suspended' : 'active')
      : instance.status;

    const updateData: any = { status: instanceStatus, updatedAt: new Date() };

    if (result.success && result.data) {
      if (result.data.remoteId) updateData.remoteId = result.data.remoteId;
      if (result.data.username) updateData.username = result.data.username;
      if (result.data.controlPanelUrl) updateData.controlPanelUrl = result.data.controlPanelUrl;
      if (result.data) updateData.remoteData = result.data;
      if (result.data.password && this.ctx.encryption) {
        updateData.password = await this.ctx.encryption.encrypt(result.data.password);
      }
      updateData.lastSync = new Date();
    }

    await this.db
      .update(serviceInstances)
      .set(updateData)
      .where(eq(serviceInstances.id, instance.id));

    // Emit events
    const eventPayload = { serviceInstanceId: instance.id, providerId: instance.providerId!, tenantId };
    if (result.success) {
      const eventMap: Record<string, string> = {
        provision: 'provisioning.completed',
        suspend: 'provisioning.suspended',
        unsuspend: 'provisioning.unsuspended',
        terminate: 'provisioning.terminated',
      };
      await this.ctx.emit(eventMap[operation] || 'provisioning.completed', eventPayload);
    } else {
      await this.ctx.emit('provisioning.failed', {
        ...eventPayload,
        error: result.error?.message || 'Unknown error',
      });
    }
  }

  private async getAdapter(providerId: string, tenantId: string): Promise<IProvisioner> {
    if (this.adapterCache.has(providerId)) {
      return this.adapterCache.get(providerId)!;
    }

    const [provider] = await this.db
      .select()
      .from(provisioningProviders)
      .where(eq(provisioningProviders.id, providerId))
      .limit(1);

    if (!provider) throw new Error('Provider not found');

    const plugin = this.plugins.get(provider.type);
    if (!plugin) throw new Error(`Plugin not found for type: ${provider.type}`);

    const apiKey = provider.apiKey ? await this.decrypt(provider.apiKey) : undefined;
    const apiSecret = provider.apiSecret ? await this.decrypt(provider.apiSecret) : undefined;

    const config: ProvisioningConfig = {
      hostname: provider.hostname,
      port: provider.port || 2087,
      username: provider.username || undefined,
      apiKey,
      apiSecret,
      useSSL: provider.useSSL ?? true,
      verifySSL: provider.verifySSL ?? true,
    };

    const adapter = plugin.createAdapter(config);
    this.adapterCache.set(providerId, adapter);
    return adapter;
  }

  private registerBuiltInPlugins(): void {
    this.plugins.set('cpanel', {
      name: 'cPanel/WHM',
      type: 'cpanel',
      version: '1.0.0',
      description: 'cPanel and WHM hosting control panel integration',
      async initialize() {},
      async destroy() {},
      createAdapter(config: ProvisioningConfig): IProvisioner {
        return new CpanelAdapter(config);
      },
      getMetadata() {
        return {
          name: 'cPanel/WHM',
          type: 'cpanel',
          version: '1.0.0',
          description: 'cPanel and WHM hosting control panel integration',
          supportedOperations: ['provision', 'suspend', 'unsuspend', 'terminate', 'modify', 'backup', 'restore'],
          requiredConfig: ['hostname', 'apiKey'],
          optionalConfig: ['port', 'username', 'useSSL', 'verifySSL', 'timeout', 'retries'],
        };
      },
    });
  }

  private buildConfig(input: CreateProviderInput): ProvisioningConfig {
    return {
      hostname: input.hostname,
      port: input.port ?? 2087,
      username: input.username,
      apiKey: input.apiKey,
      apiSecret: input.apiSecret,
      useSSL: input.useSSL ?? true,
      verifySSL: input.verifySSL ?? true,
      ...(input.config || {}),
    };
  }

  private async encrypt(value: string): Promise<string> {
    if (this.ctx.encryption) {
      return this.ctx.encryption.encrypt(value);
    }
    return value;
  }

  private async decrypt(value: string): Promise<string> {
    if (this.ctx.encryption) {
      return this.ctx.encryption.decrypt(value);
    }
    return value;
  }
}
