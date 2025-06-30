import { db } from '../../db';
import { 
  provisioningProviders, 
  serviceInstances, 
  provisioningTasks 
} from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { JobScheduler } from '../jobs/JobScheduler';
import { EventEmitter } from 'events';
import {
  ProvisioningAdapter,
  ProvisioningPlugin,
  ProvisioningConfig,
  ServiceParameters,
  ProvisioningResult,
  ProvisioningJobData,
  ProvisioningError,
  ProviderConnectionError,
  HealthCheckResult,
  ProvisioningEvent,
  ProvisioningEventType
} from './types';
import { CpanelPlugin } from './plugins/CpanelPlugin';
import { encryptionService } from '../security/EncryptionService';

export class ProvisioningManager extends EventEmitter {
  private static instance: ProvisioningManager;
  private plugins: Map<string, ProvisioningPlugin> = new Map();
  private adapters: Map<string, ProvisioningAdapter> = new Map();
  private jobScheduler: JobScheduler;
  private initialized = false;

  private constructor() {
    super();
    this.jobScheduler = JobScheduler.getInstance();
  }

  static getInstance(): ProvisioningManager {
    if (!ProvisioningManager.instance) {
      ProvisioningManager.instance = new ProvisioningManager();
    }
    return ProvisioningManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('🔄 Initializing Provisioning Manager...');

    try {
      // Initialize job scheduler if not already done
      await this.jobScheduler.initialize();

      // Add provisioning job queues
      await this.setupJobQueues();

      // Load and initialize plugins
      await this.loadPlugins();

      // Setup event handlers
      this.setupEventHandlers();

      this.initialized = true;
      console.log('✅ Provisioning Manager initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Provisioning Manager:', error);
      throw error;
    }
  }

  private async setupJobQueues(): Promise<void> {
    // Add provisioning-specific job queues to the scheduler
    const queues = [
      'provisioning-provision',
      'provisioning-suspend',
      'provisioning-unsuspend',
      'provisioning-terminate',
      'provisioning-modify',
      'provisioning-sync',
      'provisioning-health-check'
    ];

    for (const queueName of queues) {
      // Queue creation is handled by JobScheduler
      console.log(`📋 Queue ${queueName} ready`);
    }
  }

  private async loadPlugins(): Promise<void> {
    console.log('🔌 Loading provisioning plugins...');
    
    // Register built-in plugins
    this.registerPlugin(new CpanelPlugin());
    
    // TODO: Add more plugins
    // this.registerPlugin(new PleskPlugin());
    // this.registerPlugin(new DockerPlugin());
  }

  private setupEventHandlers(): void {
    // Event handler setup
    console.log('📡 Setting up event handlers...');
    
    this.on('task.completed', async (data) => {
      console.log(`✅ Task completed: ${data.taskId}`);
    });

    this.on('task.failed', async (data) => {
      console.error(`❌ Task failed: ${data.taskId}`, data.error);
    });
  }

  // Plugin management
  registerPlugin(plugin: ProvisioningPlugin): void {
    this.plugins.set(plugin.type, plugin);
    console.log(`🔌 Registered plugin: ${plugin.name} (${plugin.type})`);
  }

  getPlugin(type: string): ProvisioningPlugin | undefined {
    return this.plugins.get(type);
  }

  // Provider management
  async createProvider(data: {
    name: string;
    type: string;
    hostname: string;
    port: number;
    username?: string;
    apiKey?: string;
    apiSecret?: string;
    useSSL?: boolean;
    verifySSL?: boolean;
    config?: Record<string, any>;
    tenantId: string;
  }): Promise<string> {
    try {
      const plugin = this.getPlugin(data.type);
      if (!plugin) {
        throw new ProvisioningError(`Plugin not found for type: ${data.type}`);
      }

      // Test connection before creating provider
      const adapter = plugin.createAdapter({
        hostname: data.hostname,
        port: data.port,
        username: data.username,
        apiKey: data.apiKey,
        apiSecret: data.apiSecret,
        useSSL: data.useSSL ?? true,
        verifySSL: data.verifySSL ?? true,
        ...data.config
      });

      const isConnected = await adapter.testConnection();
      if (!isConnected) {
        throw new ProviderConnectionError('Failed to connect to provider');
      }

      // Encrypt sensitive data before storing
      const encryptedConfig = data.config ? JSON.parse(JSON.stringify(data.config)) : {};
      if (encryptedConfig.password) {
        encryptedConfig.password = encryptionService.encrypt(encryptedConfig.password);
      }
      if (encryptedConfig.secret) {
        encryptedConfig.secret = encryptionService.encrypt(encryptedConfig.secret);
      }

      // Create provider in database with encrypted credentials
      const [provider] = await db
        .insert(provisioningProviders)
        .values({
          name: data.name,
          type: data.type as any,
          hostname: data.hostname,
          port: data.port,
          username: data.username,
          apiKey: data.apiKey ? encryptionService.encrypt(data.apiKey) : null,
          apiSecret: data.apiSecret ? encryptionService.encrypt(data.apiSecret) : null,
          useSSL: data.useSSL ?? true,
          verifySSL: data.verifySSL ?? true,
          config: encryptedConfig,
          isActive: true,
          healthStatus: 'healthy',
          lastHealthCheck: new Date(),
          tenantId: data.tenantId,
        })
        .returning();

      // Cache the adapter
      this.adapters.set(provider.id, adapter);

      console.log(`✅ Created provider: ${provider.name} (${provider.id})`);
      return provider.id;
    } catch (error) {
      console.error('❌ Failed to create provider:', error);
      throw error;
    }
  }

  async getProviderAdapter(providerId: string): Promise<ProvisioningAdapter> {
    // Check cache first
    if (this.adapters.has(providerId)) {
      return this.adapters.get(providerId)!;
    }

    // Load from database
    const provider = await db
      .select()
      .from(provisioningProviders)
      .where(eq(provisioningProviders.id, providerId))
      .limit(1);

    if (!provider.length) {
      throw new ProvisioningError(`Provider not found: ${providerId}`);
    }

    const providerData = provider[0];
    const plugin = this.getPlugin(providerData.type);
    if (!plugin) {
      throw new ProvisioningError(`Plugin not found for type: ${providerData.type}`);
    }

    // Decrypt sensitive data before creating adapter
    const decryptedConfig = providerData.config ? JSON.parse(JSON.stringify(providerData.config)) : {};
    if (decryptedConfig.password) {
      decryptedConfig.password = encryptionService.decrypt(decryptedConfig.password);
    }
    if (decryptedConfig.secret) {
      decryptedConfig.secret = encryptionService.decrypt(decryptedConfig.secret);
    }

    const adapter = plugin.createAdapter({
      hostname: providerData.hostname,
      port: providerData.port,
      username: providerData.username || undefined,
      apiKey: providerData.apiKey ? encryptionService.decrypt(providerData.apiKey) : undefined,
      apiSecret: providerData.apiSecret ? encryptionService.decrypt(providerData.apiSecret) : undefined,
      useSSL: providerData.useSSL,
      verifySSL: providerData.verifySSL,
      ...decryptedConfig
    });

    // Cache the adapter
    this.adapters.set(providerId, adapter);
    return adapter;
  }

  // Core provisioning operations
  async provision(
    serviceInstanceId: string,
    providerId: string,
    parameters: ServiceParameters,
    tenantId: string
  ): Promise<string> {
    return this.executeProvisioningOperation(
      'provision',
      serviceInstanceId,
      providerId,
      parameters,
      tenantId
    );
  }

  async suspend(
    serviceInstanceId: string,
    providerId: string,
    parameters: ServiceParameters,
    tenantId: string
  ): Promise<string> {
    return this.executeProvisioningOperation(
      'suspend',
      serviceInstanceId,
      providerId,
      parameters,
      tenantId
    );
  }

  async unsuspend(
    serviceInstanceId: string,
    providerId: string,
    parameters: ServiceParameters,
    tenantId: string
  ): Promise<string> {
    return this.executeProvisioningOperation(
      'unsuspend',
      serviceInstanceId,
      providerId,
      parameters,
      tenantId
    );
  }

  async terminate(
    serviceInstanceId: string,
    providerId: string,
    parameters: ServiceParameters,
    tenantId: string
  ): Promise<string> {
    return this.executeProvisioningOperation(
      'terminate',
      serviceInstanceId,
      providerId,
      parameters,
      tenantId
    );
  }

  private async executeProvisioningOperation(
    operation: string,
    serviceInstanceId: string,
    providerId: string,
    parameters: ServiceParameters,
    tenantId: string
  ): Promise<string> {
    try {
      // Create provisioning task
      const [task] = await db
        .insert(provisioningTasks)
        .values({
          serviceInstanceId,
          providerId,
          operation: operation as any,
          status: 'pending',
          requestData: parameters,
          tenantId,
        })
        .returning();

      // Schedule job
      const jobData: ProvisioningJobData = {
        operation,
        serviceInstanceId,
        providerId,
        parameters,
        tenantId,
        attempts: 3,
      };

      const jobId = await this.jobScheduler.addJob(
        `provisioning-${operation}`,
        {
          type: `provisioning.${operation}`,
          payload: { taskId: task.id, ...jobData },
          tenantId,
        }
      );

      // Update task with job ID
      await db
        .update(provisioningTasks)
        .set({ 
          jobId,
          status: 'in_progress',
          startedAt: new Date()
        })
        .where(eq(provisioningTasks.id, task.id));

      console.log(`📋 Scheduled ${operation} operation for service ${serviceInstanceId}`);
      return task.id;
    } catch (error) {
      console.error(`❌ Failed to execute ${operation} operation:`, error);
      throw error;
    }
  }

  // Process provisioning job (called by job processor)
  async processProvisioningJob(taskId: string): Promise<void> {
    try {
      // Get task details
      const task = await db
        .select()
        .from(provisioningTasks)
        .where(eq(provisioningTasks.id, taskId))
        .limit(1);

      if (!task.length) {
        throw new ProvisioningError(`Task not found: ${taskId}`);
      }

      const taskData = task[0];
      const adapter = await this.getProviderAdapter(taskData.providerId);
      
      // Execute the operation
      let result: ProvisioningResult;
      const parameters = taskData.requestData as ServiceParameters;

      switch (taskData.operation) {
        case 'provision':
          result = await adapter.provision(parameters);
          break;
        case 'suspend':
          result = await adapter.suspend(parameters);
          break;
        case 'unsuspend':
          result = await adapter.unsuspend(parameters);
          break;
        case 'terminate':
          result = await adapter.terminate(parameters);
          break;
        default:
          throw new ProvisioningError(`Unsupported operation: ${taskData.operation}`);
      }

      // Update task with result
      await db
        .update(provisioningTasks)
        .set({
          status: result.success ? 'completed' : 'failed',
          responseData: result,
          completedAt: new Date(),
          errorMessage: result.error?.message,
          errorDetails: result.error
        })
        .where(eq(provisioningTasks.id, taskId));

      // Update service instance if operation was successful
      if (result.success && result.data) {
        await this.updateServiceInstance(taskData.serviceInstanceId!, result);
      }

      console.log(`✅ Completed ${taskData.operation} operation for task ${taskId}`);
    } catch (error) {
      console.error(`❌ Failed to process provisioning job ${taskId}:`, error);
      
      // Update task with error
      await db
        .update(provisioningTasks)
        .set({
          status: 'failed',
          completedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          errorDetails: { error: error instanceof Error ? error.stack : error }
        })
        .where(eq(provisioningTasks.id, taskId));

      throw error;
    }
  }

  private async updateServiceInstance(
    serviceInstanceId: string, 
    result: ProvisioningResult
  ): Promise<void> {
    const updateData: any = {
      updatedAt: new Date()
    };

    if (result.data?.remoteId) {
      updateData.remoteId = result.data.remoteId;
    }
    if (result.data?.username) {
      updateData.username = result.data.username;
    }
    if (result.data?.password) {
      updateData.password = encryptionService.encrypt(result.data.password);
    }
    if (result.data?.controlPanelUrl) {
      updateData.controlPanelUrl = result.data.controlPanelUrl;
    }
    if (result.data) {
      updateData.remoteData = result.data;
    }

    await db
      .update(serviceInstances)
      .set(updateData)
      .where(eq(serviceInstances.id, serviceInstanceId));
  }

  // Health checking
  async performHealthCheck(providerId: string): Promise<HealthCheckResult> {
    try {
      const adapter = await this.getProviderAdapter(providerId);
      const result = await adapter.healthCheck();

      // Update provider health status
      await db
        .update(provisioningProviders)
        .set({
          lastHealthCheck: new Date(),
          healthStatus: result.status,
        })
        .where(eq(provisioningProviders.id, providerId));

      return result;
    } catch (error) {
      console.error(`❌ Health check failed for provider ${providerId}:`, error);
      
      await db
        .update(provisioningProviders)
        .set({
          lastHealthCheck: new Date(),
          healthStatus: 'error',
        })
        .where(eq(provisioningProviders.id, providerId));

      throw error;
    }
  }

  // Utility methods
  async getProviderStatus(providerId: string): Promise<any> {
    const provider = await db
      .select()
      .from(provisioningProviders)
      .where(eq(provisioningProviders.id, providerId))
      .limit(1);

    if (!provider.length) {
      throw new ProvisioningError(`Provider not found: ${providerId}`);
    }

    return provider[0];
  }

  async listProviders(tenantId: string): Promise<any[]> {
    return db
      .select()
      .from(provisioningProviders)
      .where(eq(provisioningProviders.tenantId, tenantId));
  }

  async shutdown(): Promise<void> {
    console.log('🔄 Shutting down Provisioning Manager...');
    
    // Clean up adapters
    this.adapters.clear();
    
    // Destroy plugins
    for (const plugin of this.plugins.values()) {
      try {
        await plugin.destroy();
      } catch (error) {
        console.error('Error destroying plugin:', error);
      }
    }
    
    this.plugins.clear();
    this.initialized = false;
    
    console.log('✅ Provisioning Manager shut down successfully');
  }
} 