import { BasePlugin } from '../BasePlugin';
import { PluginContext, PluginMetadata } from '@panel1/plugin-sdk';
import { z } from 'zod';
import { ProvisioningPlugin, ComponentHandler } from '@panel1/plugin-sdk';
import { ProvisioningAdapter, ServiceParameters } from '@panel1/plugin-sdk';

interface CpanelPluginConfig {
  servers: {
    [key: string]: {
      host: string;
      port: number;
      username: string;
      password: string;
      secure: boolean;
    };
  };
  defaultServer: string;
  defaultPackage: string;
  defaultDomain: string;
}

export class CpanelPlugin extends BasePlugin implements ProvisioningPlugin, ComponentHandler {
  private adapter: ProvisioningAdapter;

  constructor(metadata: PluginMetadata) {
    super(metadata);
  }

  protected async onInitialize(ctx: PluginContext): Promise<void> {
    // Register extension points
    this.registerExtensionPoint({
      name: 'cpanel.provision',
      description: 'Provision a new cPanel account',
      schema: z.object({
        server: z.string().optional(),
        domain: z.string(),
        username: z.string(),
        password: z.string(),
        package: z.string().optional(),
        email: z.string().email(),
      }),
    });

    this.registerExtensionPoint({
      name: 'cpanel.metrics',
      description: 'Get cPanel server metrics',
      schema: z.object({
        server: z.string().optional(),
      }),
    });

    // Register hooks
    this.registerHook('account.created', this.handleAccountCreated.bind(this));
    this.registerHook('account.suspended', this.handleAccountSuspended.bind(this));
    this.registerHook('account.unsuspended', this.handleAccountUnsuspended.bind(this));
    this.registerHook('account.terminated', this.handleAccountTerminated.bind(this));
    this.registerHook('server.overload', this.handleServerOverload.bind(this));
    this.registerHook('backup.completed', this.handleBackupCompleted.bind(this));
    this.registerHook('backup.failed', this.handleBackupFailed.bind(this));
  }

  protected async onDestroy(): Promise<void> {
    // Cleanup resources
  }

  private generateUsername(email: string): string {
    return email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 8);
  }

  private async handleAccountCreated(account: any): Promise<void> {
    this.logger.info('cPanel account created', { account });
  }

  private async handleAccountSuspended(account: any): Promise<void> {
    this.logger.info('cPanel account suspended', { account });
  }

  private async handleAccountUnsuspended(account: any): Promise<void> {
    this.logger.info('cPanel account unsuspended', { account });
  }

  private async handleAccountTerminated(account: any): Promise<void> {
    this.logger.info('cPanel account terminated', { account });
  }

  private async handleServerOverload(metrics: any): Promise<void> {
    this.logger.warn('Server overload detected', { metrics });
  }

  private async handleBackupCompleted(backup: any): Promise<void> {
    this.logger.info('Backup completed successfully', { backup });
  }

  private async handleBackupFailed(error: any): Promise<void> {
    this.logger.error('Backup failed', { error });
  }

  // ComponentHandler implementation
  public async provision(data: any): Promise<any> {
    const pluginConfig = this.config as CpanelPluginConfig;
    const server = pluginConfig.servers[data.server || pluginConfig.defaultServer];

    if (!server) {
      throw new Error('Server configuration not found');
    }

    const params: ServiceParameters = {
      serviceName: 'cpanel',
      serviceType: 'hosting',
      domain: data.domain || data.config?.domain || 'example.com',
      username: this.generateUsername(data.email || 'user'),
      password: data.password,
      email: data.email || 'test@example.com',
      package: data.package || pluginConfig.defaultPackage,
      server: server.host,
    };

    const result = await this.adapter.provision(params);

    return {
      success: true,
      remoteId: result.id,
      metadata: {
        domain: params.domain,
        username: params.username,
        package: params.package,
        server: server.host,
      },
    };
  }

  public async suspend(data: any): Promise<any> {
    const params: ServiceParameters = {
      serviceName: 'cpanel',
      serviceType: 'hosting',
      username: data.metadata?.remoteId,
    };

    await this.adapter.suspend(params);

    return {
      success: true,
    };
  }

  public async unsuspend(data: any): Promise<any> {
    const params: ServiceParameters = {
      serviceName: 'cpanel',
      serviceType: 'hosting',
      username: data.metadata?.remoteId,
    };

    await this.adapter.unsuspend(params);

    return {
      success: true,
    };
  }

  public async terminate(data: any): Promise<any> {
    const params: ServiceParameters = {
      serviceName: 'cpanel',
      serviceType: 'hosting',
      username: data.metadata?.remoteId,
    };

    await this.adapter.terminate(params);

    return {
      success: true,
    };
  }

  public async getMetrics(): Promise<any> {
    const pluginConfig = this.config as CpanelPluginConfig;
    const metrics: any[] = [];

    for (const [serverName, server] of Object.entries(pluginConfig.servers)) {
      try {
        const serverMetrics = await this.adapter.getMetrics({
          serviceName: 'cpanel',
          serviceType: 'hosting',
          server: server.host,
        });

        metrics.push({
          server: serverName,
          ...serverMetrics,
        });
      } catch (error) {
        this.logger.error('Failed to get server metrics', { server: serverName, error });
      }
    }

    return metrics;
  }

  public async checkConnection(): Promise<boolean> {
    const pluginConfig = this.config as CpanelPluginConfig;
    const server = pluginConfig.servers[pluginConfig.defaultServer];

    if (!server) {
      return false;
    }

    try {
      await this.adapter.checkConnection({
        serviceName: 'cpanel',
        serviceType: 'hosting',
        server: server.host,
      });
      return true;
    } catch (error) {
      this.logger.error('Connection check failed', { error });
      return false;
    }
  }

  public async getActiveAccountsCount(): Promise<number> {
    const pluginConfig = this.config as CpanelPluginConfig;
    let totalCount = 0;

    for (const server of Object.values(pluginConfig.servers)) {
      try {
        const count = await this.adapter.getActiveAccountsCount({
          serviceName: 'cpanel',
          serviceType: 'hosting',
          server: server.host,
        });
        totalCount += count;
      } catch (error) {
        this.logger.error('Failed to get active accounts count', { server: server.host, error });
      }
    }

    return totalCount;
  }
} 