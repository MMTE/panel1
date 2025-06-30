import { BasePlugin } from '../BasePlugin';
import { DomainManager } from './DomainManager';
import { PluginContext, PluginMetadata } from '@panel1/plugin-sdk';
import { z } from 'zod';

export interface DomainPluginConfig {
  renewalCheckInterval: number;
  defaultProvider: string;
  providers: {
    [key: string]: {
      type: string;
      credentials: Record<string, any>;
    };
  };
}

export interface DomainRegistrationOptions {
  domain: string;
  registrant: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    organization?: string;
    address: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  nameservers?: string[];
  period?: number;
  privacy?: boolean;
}

export class DomainPlugin extends BasePlugin {
  private domainManager: DomainManager;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(metadata: PluginMetadata) {
    super(metadata);
    this.domainManager = new DomainManager();
  }

  protected async onInitialize(ctx: PluginContext): Promise<void> {
    const pluginConfig = this.config as DomainPluginConfig;
    
    // Start domain expiration check interval
    const interval = pluginConfig?.renewalCheckInterval || 43200; // 12 hours default
    this.checkInterval = setInterval(async () => {
      try {
        await this.domainManager.checkExpiringDomains();
      } catch (error) {
        this.logger.error('Failed to check expiring domains', { error });
      }
    }, interval * 1000);

    // Register extension points
    this.registerExtensionPoint({
      name: 'domain.register',
      description: 'Register a new domain name',
      schema: z.object({
        domain: z.string(),
        registrant: z.object({
          firstName: z.string(),
          lastName: z.string(),
          email: z.string().email(),
          phone: z.string(),
          organization: z.string().optional(),
          address: z.string(),
          city: z.string(),
          state: z.string(),
          postalCode: z.string(),
          country: z.string(),
        }),
        nameservers: z.array(z.string()).optional(),
        period: z.number().min(1).max(10).optional(),
        privacy: z.boolean().optional(),
      }),
    });

    // Register hooks
    this.registerHook('domain.registered', this.handleDomainRegistered.bind(this));
    this.registerHook('domain.renewed', this.handleDomainRenewed.bind(this));
    this.registerHook('domain.transferred', this.handleDomainTransferred.bind(this));
    this.registerHook('domain.expired', this.handleDomainExpired.bind(this));
  }

  protected async onDestroy(): Promise<void> {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  private async handleDomainRegistered(domain: string): Promise<void> {
    this.logger.info('Domain registered', { domain });
  }

  private async handleDomainRenewed(domain: string): Promise<void> {
    this.logger.info('Domain renewed', { domain });
  }

  private async handleDomainTransferred(domain: string): Promise<void> {
    this.logger.info('Domain transferred', { domain });
  }

  private async handleDomainExpired(domain: string): Promise<void> {
    this.logger.warn('Domain expired', { domain });
  }
} 