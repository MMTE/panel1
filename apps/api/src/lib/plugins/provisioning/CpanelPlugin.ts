import { BasePlugin } from '../BasePlugin';
import { PluginMetadata, PluginConfig, PluginHook, ExtensionPoint } from '../types';
import { ProvisioningPlugin, ProvisioningAdapter, ProvisioningConfig } from '../../provisioning/types';
import { ComponentHandler } from '../../components/ComponentLifecycleService';
import { CpanelAdapter } from '../../provisioning/adapters/CpanelAdapter';
import { Logger } from '../../logging/Logger';
import { db } from '../../../db';
import { subscribedComponents } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { EventService } from '../../events/EventService';

interface CpanelPluginConfig extends PluginConfig {
  servers: {
    [key: string]: {
      hostname: string;
      port?: number;
      username: string;
      apiKey: string;
      useSSL?: boolean;
      verifySSL?: boolean;
      timeout?: number;
      retries?: number;
      maxAccounts?: number;
    }
  };
  packages: {
    [key: string]: {
      diskQuota: number;
      bandwidth: number;
      emailAccounts: number;
      databases: number;
      subdomains: number;
      features: string[];
    }
  };
  defaultServer?: string;
  defaultPackage?: string;
  loadBalancing?: {
    enabled: boolean;
    strategy: 'round-robin' | 'least-loaded' | 'zone-based';
  };
  monitoring?: {
    enabled: boolean;
    interval: number;
    metrics: string[];
  };
  backups?: {
    enabled: boolean;
    retention: number;
    schedule: string;
  };
}

export class CpanelPlugin extends BasePlugin implements ProvisioningPlugin, ComponentHandler {
  private logger = Logger.getInstance();
  private eventService = EventService.getInstance();
  private adapters: Map<string, ProvisioningAdapter> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor() {
    super({
      id: 'cpanel-plugin',
      name: 'cPanel/WHM Plugin',
      version: '2.0.0',
      description: 'Enhanced cPanel and WHM hosting control panel integration',
      author: 'Panel1 Team',
      tags: ['provisioning', 'hosting', 'cpanel', 'whm'],
    });
  }

  async install(): Promise<void> {
    await super.install();
    this.logger.info('🔌 Installing cPanel/WHM Plugin...');
    await this.initializeAdapters();
  }

  async uninstall(): Promise<void> {
    await super.uninstall();
    this.logger.info('🗑️ Uninstalling cPanel/WHM Plugin...');
    this.stopMonitoring();
  }

  async enable(): Promise<void> {
    await super.enable();
    this.logger.info('✅ Enabling cPanel/WHM Plugin...');
    await this.startMonitoring();
  }

  async disable(): Promise<void> {
    await super.disable();
    this.logger.info('⏸️ Disabling cPanel/WHM Plugin...');
    this.stopMonitoring();
  }

  async configure(config: CpanelPluginConfig): Promise<void> {
    if (!this.validateCpanelConfig(config)) {
      throw new Error('Invalid cPanel plugin configuration');
    }
    await super.configure(config);
    await this.initializeAdapters();
  }

  getExtensionPoints(): ExtensionPoint[] {
    return [
      this.registerExtensionPoint(
        'cpanel-package',
        'Define custom cPanel hosting packages',
        {
          type: 'object',
          properties: {
            name: { type: 'string' },
            resources: { type: 'object' },
            features: { type: 'array' },
          },
          required: ['name', 'resources'],
        }
      ),
      this.registerExtensionPoint(
        'server-monitoring',
        'Add custom server monitoring metrics',
        {
          type: 'object',
          properties: {
            name: { type: 'string' },
            collector: { type: 'function' },
            interval: { type: 'number' },
          },
          required: ['name', 'collector'],
        }
      ),
    ];
  }

  getHooks(): PluginHook[] {
    return [
      this.registerHook('account.created', this.handleAccountCreated.bind(this), 10),
      this.registerHook('account.suspended', this.handleAccountSuspended.bind(this), 10),
      this.registerHook('account.unsuspended', this.handleAccountUnsuspended.bind(this), 10),
      this.registerHook('account.terminated', this.handleAccountTerminated.bind(this), 10),
      this.registerHook('server.overload', this.handleServerOverload.bind(this), 10),
      this.registerHook('backup.completed', this.handleBackupCompleted.bind(this), 10),
      this.registerHook('backup.failed', this.handleBackupFailed.bind(this), 10),
    ];
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string; details?: Record<string, any>; }> {
    try {
      const serverStatus = await this.checkServersStatus();
      const healthy = serverStatus.every(s => s.healthy);
      
      return {
        healthy,
        message: healthy ? 'All cPanel servers operational' : 'Some cPanel servers are not responding',
        details: {
          servers: serverStatus,
          activeAccounts: await this.getActiveAccountsCount(),
          monitoringActive: this.monitoringInterval !== null,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        message: 'Failed to check cPanel servers health',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  // ProvisioningPlugin Implementation

  createAdapter(config: ProvisioningConfig): ProvisioningAdapter {
    return new CpanelAdapter(config);
  }

  getMetadata() {
    return {
      name: this.metadata.name,
      type: 'cpanel',
      version: this.metadata.version,
      description: this.metadata.description,
      supportedOperations: [
        'provision',
        'suspend',
        'unsuspend',
        'terminate',
        'modify',
        'backup',
        'restore',
        'monitor',
        'scale'
      ],
      requiredConfig: ['hostname', 'apiKey'],
      optionalConfig: ['port', 'username', 'useSSL', 'verifySSL', 'timeout', 'retries']
    };
  }

  // ComponentHandler Implementation

  async provision(data: { subscribedComponentId: string; config: any; }): Promise<{ success: boolean; remoteId?: string; data?: any; }> {
    try {
      this.logger.info(`🔧 Provisioning cPanel account for component: ${data.subscribedComponentId}`);

      const subscribedComponent = await db.query.subscribedComponents.findFirst({
        where: eq(subscribedComponents.id, data.subscribedComponentId),
        with: {
          component: true,
          subscription: {
            with: {
              client: true
            }
          }
        }
      });

      if (!subscribedComponent) {
        throw new Error(`Subscribed component not found: ${data.subscribedComponentId}`);
      }

      const config = this.config as CpanelPluginConfig;
      const serverKey = await this.selectServer(data.config.server || config.defaultServer);
      const adapter = this.adapters.get(serverKey);

      if (!adapter) {
        throw new Error(`No adapter found for server: ${serverKey}`);
      }

      const packageName = data.config.package || config.defaultPackage || 'default';
      const packageConfig = config.packages[packageName];

      if (!packageConfig) {
        throw new Error(`Package not found: ${packageName}`);
      }

      const provisioningParams = {
        domain: data.config.domain || subscribedComponent.subscription?.client?.email?.split('@')[1] || 'example.com',
        username: this.generateUsername(subscribedComponent.subscription?.client?.email || 'user'),
        password: this.generateSecurePassword(),
        email: subscribedComponent.subscription?.client?.email || 'test@example.com',
        package: packageName,
        resources: packageConfig,
        ...data.config
      };

      const result = await adapter.provision(provisioningParams);

      if (result.success) {
        await this.eventService.emit('account.created', {
          componentId: data.subscribedComponentId,
          server: serverKey,
          username: provisioningParams.username,
          package: packageName
        });

        return {
          success: true,
          remoteId: result.remoteId,
          data: {
            username: provisioningParams.username,
            domain: provisioningParams.domain,
            package: packageName,
            server: serverKey,
            controlPanelUrl: `https://${config.servers[serverKey].hostname}:2083`,
            resources: packageConfig,
            ...result.data
          }
        };
      }

      return {
        success: false,
        data: { error: result.error }
      };

    } catch (error) {
      this.logger.error(`❌ Error provisioning cPanel account:`, error);
      return {
        success: false,
        data: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  async suspend(data: { subscribedComponentId: string; }): Promise<{ success: boolean; }> {
    try {
      this.logger.info(`⏸️ Suspending cPanel account for component: ${data.subscribedComponentId}`);

      const subscribedComponent = await db.query.subscribedComponents.findFirst({
        where: eq(subscribedComponents.id, data.subscribedComponentId)
      });

      if (!subscribedComponent || !subscribedComponent.metadata?.remoteId) {
        return { success: true };
      }

      const serverKey = subscribedComponent.metadata.server;
      const adapter = this.adapters.get(serverKey);

      if (!adapter) {
        throw new Error(`No adapter found for server: ${serverKey}`);
      }

      const result = await adapter.suspend({
        username: subscribedComponent.metadata.remoteId
      });

      if (result.success) {
        await this.eventService.emit('account.suspended', {
          componentId: data.subscribedComponentId,
          server: serverKey,
          username: subscribedComponent.metadata.remoteId
        });
      }

      return { success: result.success };

    } catch (error) {
      this.logger.error(`❌ Error suspending cPanel account:`, error);
      return { success: false };
    }
  }

  async unsuspend(data: { subscribedComponentId: string; }): Promise<{ success: boolean; }> {
    try {
      this.logger.info(`▶️ Unsuspending cPanel account for component: ${data.subscribedComponentId}`);

      const subscribedComponent = await db.query.subscribedComponents.findFirst({
        where: eq(subscribedComponents.id, data.subscribedComponentId)
      });

      if (!subscribedComponent || !subscribedComponent.metadata?.remoteId) {
        return { success: true };
      }

      const serverKey = subscribedComponent.metadata.server;
      const adapter = this.adapters.get(serverKey);

      if (!adapter) {
        throw new Error(`No adapter found for server: ${serverKey}`);
      }

      const result = await adapter.unsuspend({
        username: subscribedComponent.metadata.remoteId
      });

      if (result.success) {
        await this.eventService.emit('account.unsuspended', {
          componentId: data.subscribedComponentId,
          server: serverKey,
          username: subscribedComponent.metadata.remoteId
        });
      }

      return { success: result.success };

    } catch (error) {
      this.logger.error(`❌ Error unsuspending cPanel account:`, error);
      return { success: false };
    }
  }

  async terminate(data: { subscribedComponentId: string; }): Promise<{ success: boolean; }> {
    try {
      this.logger.info(`🗑️ Terminating cPanel account for component: ${data.subscribedComponentId}`);

      const subscribedComponent = await db.query.subscribedComponents.findFirst({
        where: eq(subscribedComponents.id, data.subscribedComponentId)
      });

      if (!subscribedComponent || !subscribedComponent.metadata?.remoteId) {
        return { success: true };
      }

      const serverKey = subscribedComponent.metadata.server;
      const adapter = this.adapters.get(serverKey);

      if (!adapter) {
        throw new Error(`No adapter found for server: ${serverKey}`);
      }

      // Backup before termination if enabled
      const config = this.config as CpanelPluginConfig;
      if (config.backups?.enabled) {
        await this.backupAccount(subscribedComponent.metadata.remoteId, serverKey);
      }

      const result = await adapter.terminate({
        username: subscribedComponent.metadata.remoteId
      });

      if (result.success) {
        await this.eventService.emit('account.terminated', {
          componentId: data.subscribedComponentId,
          server: serverKey,
          username: subscribedComponent.metadata.remoteId
        });
      }

      return { success: result.success };

    } catch (error) {
      this.logger.error(`❌ Error terminating cPanel account:`, error);
      return { success: false };
    }
  }

  // Private methods

  private validateCpanelConfig(config: CpanelPluginConfig): boolean {
    if (!config.servers || Object.keys(config.servers).length === 0) {
      return false;
    }

    for (const [server, settings] of Object.entries(config.servers)) {
      if (!settings.hostname || !settings.username || !settings.apiKey) {
        return false;
      }
    }

    if (!config.packages || Object.keys(config.packages).length === 0) {
      return false;
    }

    return true;
  }

  private async initializeAdapters(): Promise<void> {
    const config = this.config as CpanelPluginConfig;
    
    for (const [server, settings] of Object.entries(config.servers)) {
      const adapter = this.createAdapter({
        hostname: settings.hostname,
        port: settings.port || 2087,
        username: settings.username,
        apiKey: settings.apiKey,
        useSSL: settings.useSSL !== false,
        verifySSL: settings.verifySSL !== false,
        timeout: settings.timeout || 30000,
        retries: settings.retries || 3
      });

      this.adapters.set(server, adapter);
    }
  }

  private async startMonitoring(): Promise<void> {
    const config = this.config as CpanelPluginConfig;
    if (!config.monitoring?.enabled) return;

    const interval = config.monitoring.interval || 5 * 60 * 1000; // Default 5 minutes

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.collectServerMetrics();
      } catch (error) {
        this.logger.error('❌ Error collecting server metrics:', error);
      }
    }, interval);

    // Initial collection
    this.collectServerMetrics().catch(error => {
      this.logger.error('❌ Error in initial metrics collection:', error);
    });
  }

  private stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  private async collectServerMetrics(): Promise<void> {
    for (const [server, adapter] of this.adapters.entries()) {
      try {
        const metrics = await adapter.getMetrics();
        
        if (metrics.load > 80) {
          await this.eventService.emit('server.overload', {
            server,
            metrics
          });
        }

        // Store metrics for load balancing decisions
        await this.updateServerMetrics(server, metrics);
      } catch (error) {
        this.logger.error(`❌ Error collecting metrics for server ${server}:`, error);
      }
    }
  }

  private async selectServer(preferredServer?: string): Promise<string> {
    const config = this.config as CpanelPluginConfig;
    
    if (preferredServer && this.adapters.has(preferredServer)) {
      return preferredServer;
    }

    if (!config.loadBalancing?.enabled) {
      return config.defaultServer || Object.keys(config.servers)[0];
    }

    // Implement load balancing strategy
    switch (config.loadBalancing.strategy) {
      case 'least-loaded':
        return await this.selectLeastLoadedServer();
      case 'zone-based':
        return await this.selectZoneBasedServer();
      case 'round-robin':
      default:
        return await this.selectRoundRobinServer();
    }
  }

  private async selectLeastLoadedServer(): Promise<string> {
    // Implementation for selecting least loaded server
    return '';
  }

  private async selectZoneBasedServer(): Promise<string> {
    // Implementation for selecting server based on geographical zone
    return '';
  }

  private async selectRoundRobinServer(): Promise<string> {
    // Implementation for round-robin server selection
    return '';
  }

  private async updateServerMetrics(server: string, metrics: any): Promise<void> {
    // Implementation for updating server metrics
  }

  private async backupAccount(username: string, server: string): Promise<void> {
    // Implementation for backing up account before termination
  }

  private async checkServersStatus(): Promise<Array<{ server: string; healthy: boolean; error?: string; }>> {
    const results = [];

    for (const [server, adapter] of this.adapters.entries()) {
      try {
        await adapter.checkConnection();
        results.push({ server, healthy: true });
      } catch (error) {
        results.push({
          server,
          healthy: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }

  private async getActiveAccountsCount(): Promise<number> {
    let total = 0;
    for (const adapter of this.adapters.values()) {
      const count = await adapter.getActiveAccountsCount();
      total += count;
    }
    return total;
  }

  private generateUsername(email: string): string {
    const base = email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase();
    return `${base}_${Date.now().toString(36)}`.substring(0, 16);
  }

  private generateSecurePassword(length: number = 16): string {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    return Array.from(crypto.getRandomValues(new Uint32Array(length)))
      .map(x => charset[x % charset.length])
      .join('');
  }

  private async handleAccountCreated(context: any): Promise<void> {
    this.logger.info('📝 Account created:', context);
  }

  private async handleAccountSuspended(context: any): Promise<void> {
    this.logger.info('⏸️ Account suspended:', context);
  }

  private async handleAccountUnsuspended(context: any): Promise<void> {
    this.logger.info('▶️ Account unsuspended:', context);
  }

  private async handleAccountTerminated(context: any): Promise<void> {
    this.logger.info('🗑️ Account terminated:', context);
  }

  private async handleServerOverload(context: any): Promise<void> {
    this.logger.info('⚠️ Server overload detected:', context);
  }

  private async handleBackupCompleted(context: any): Promise<void> {
    this.logger.info('💾 Backup completed:', context);
  }

  private async handleBackupFailed(context: any): Promise<void> {
    this.logger.info('❌ Backup failed:', context);
  }
} 