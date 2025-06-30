import { z } from 'zod';
import { BasePlugin } from '../BasePlugin';
import { ComponentHandler } from '../../components/ComponentLifecycleService';
import { DomainManager } from '../../domains/DomainManager';
import { Logger } from '../../logging/Logger';
import { db } from '../../../db';
import { 
  subscribedComponents,
  domains,
  dnsZones,
  dnsRecords,
  domainOperations
} from '../../../db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { ExtensionPoint, PluginHook } from '../types';
import { router, protectedProcedure } from '../../../trpc/trpc';
import { TRPCError } from '@trpc/server';

// Input validation schemas
const domainContactSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  organization: z.string().optional(),
  email: z.string().email('Valid email is required'),
  phone: z.string().min(1, 'Phone number is required'),
  address: z.object({
    line1: z.string().min(1, 'Address line 1 is required'),
    line2: z.string().optional(),
    city: z.string().min(1, 'City is required'),
    state: z.string().min(1, 'State is required'),
    postalCode: z.string().min(1, 'Postal code is required'),
    country: z.string().min(1, 'Country is required'),
  }),
});

const registerDomainSchema = z.object({
  domainName: z.string().min(1, 'Domain name is required').regex(
    /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/,
    'Invalid domain name format'
  ),
  clientId: z.string().uuid('Valid client ID is required'),
  subscriptionId: z.string().uuid().optional(),
  registrar: z.string().min(1, 'Registrar is required'),
  registrantContact: domainContactSchema,
  adminContact: domainContactSchema.optional(),
  techContact: domainContactSchema.optional(),
  billingContact: domainContactSchema.optional(),
  nameservers: z.array(z.string()).optional(),
  autoRenew: z.boolean().default(true),
  renewalPeriod: z.number().min(1).max(10).default(1),
  privacyEnabled: z.boolean().default(false),
});

const updateNameserversSchema = z.object({
  domainId: z.string().uuid('Valid domain ID is required'),
  nameservers: z.array(z.string().min(1, 'Nameserver cannot be empty')).min(2, 'At least two nameservers are required'),
});

const createDnsRecordSchema = z.object({
  zoneId: z.string().uuid('Valid zone ID is required'),
  type: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA']),
  name: z.string().min(1, 'Record name is required'),
  content: z.string().min(1, 'Record content is required'),
  ttl: z.number().min(60).max(86400).default(3600),
  priority: z.number().optional(),
});

const updateDnsRecordSchema = z.object({
  recordId: z.string().uuid('Valid record ID is required'),
  type: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA']).optional(),
  name: z.string().min(1, 'Record name is required').optional(),
  content: z.string().min(1, 'Record content is required').optional(),
  ttl: z.number().min(60).max(86400).optional(),
  priority: z.number().optional(),
});

interface DomainPluginConfig {
  defaultTld?: string;
  defaultRegistrationPeriod?: number;
  defaultAutoRenew?: boolean;
  defaultPrivacyProtection?: boolean;
  renewalCheckInterval?: number;
}

export class DomainPlugin extends BasePlugin implements ComponentHandler {
  private domainManager = DomainManager.getInstance();
  private logger = Logger.getInstance();
  private renewalCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    super({
      id: 'domain-plugin',
      name: 'Domain Management Plugin',
      version: '1.0.0',
      description: 'Manages domain registrations and DNS through the component system',
      author: 'Panel1 Team',
      tags: ['domains', 'dns', 'registrar'],
    });
  }

  async install(): Promise<void> {
    await super.install();
    this.logger.info('🌐 Installing Domain Management Plugin...');
    await this.domainManager.initialize();
  }

  async uninstall(): Promise<void> {
    await super.uninstall();
    this.logger.info('🗑️ Uninstalling Domain Management Plugin...');
    if (this.renewalCheckInterval) {
      clearInterval(this.renewalCheckInterval);
      this.renewalCheckInterval = null;
    }
  }

  async enable(): Promise<void> {
    await super.enable();
    this.logger.info('✅ Enabling Domain Management Plugin...');
    await this.startRenewalChecks();
  }

  async disable(): Promise<void> {
    await super.disable();
    this.logger.info('⏸️ Disabling Domain Management Plugin...');
    if (this.renewalCheckInterval) {
      clearInterval(this.renewalCheckInterval);
      this.renewalCheckInterval = null;
    }
  }

  async configure(config: DomainPluginConfig): Promise<void> {
    if (!this.validateDomainConfig(config)) {
      throw new Error('Invalid domain plugin configuration');
    }
    await super.configure(config);
  }

  getExtensionPoints(): ExtensionPoint[] {
    return [
      this.registerExtensionPoint(
        'domain-registrar',
        'Add support for additional domain registrars',
        {
          type: 'object',
          properties: {
            name: { type: 'string' },
            handler: { type: 'function' },
            supportedTlds: { type: 'array', items: { type: 'string' } },
          },
          required: ['name', 'handler', 'supportedTlds'],
        }
      ),
      this.registerExtensionPoint(
        'dns-provider',
        'Add support for additional DNS providers',
        {
          type: 'object',
          properties: {
            name: { type: 'string' },
            handler: { type: 'function' },
            features: { type: 'array', items: { type: 'string' } },
          },
          required: ['name', 'handler', 'features'],
        }
      ),
    ];
  }

  getHooks(): PluginHook[] {
    return [
      this.registerHook('domain.registered', this.handleDomainRegistered.bind(this), 10),
      this.registerHook('domain.renewed', this.handleDomainRenewed.bind(this), 10),
      this.registerHook('domain.expiring', this.handleDomainExpiring.bind(this), 10),
      this.registerHook('domain.transferred', this.handleDomainTransferred.bind(this), 10),
    ];
  }

  // Register tRPC router for domain management
  getRouter() {
    return router({
      // Domain Registration
      registerDomain: protectedProcedure
        .input(registerDomainSchema)
        .mutation(async ({ input, ctx }) => {
          try {
            await this.domainManager.initialize();
            
            const domainId = await this.domainManager.registerDomain({
              ...input,
              tenantId: ctx.user.tenantId,
            });

            return { success: true, domainId };
          } catch (error) {
            console.error('Failed to register domain:', error);
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: error instanceof Error ? error.message : 'Failed to register domain',
            });
          }
        }),

      // Domain Management
      renewDomain: protectedProcedure
        .input(z.object({ 
          domainId: z.string().uuid(),
          years: z.number().min(1).max(10).default(1)
        }))
        .mutation(async ({ input, ctx }) => {
          try {
            await this.domainManager.initialize();
            
            const domain = await db
              .select()
              .from(domains)
              .where(
                and(
                  eq(domains.id, input.domainId),
                  eq(domains.tenantId, ctx.user.tenantId)
                )
              )
              .limit(1);

            if (!domain.length) {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Domain not found',
              });
            }

            await this.domainManager.renewDomain(input.domainId, input.years);

            return { success: true };
          } catch (error) {
            if (error instanceof TRPCError) throw error;
            
            console.error('Failed to renew domain:', error);
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: error instanceof Error ? error.message : 'Failed to renew domain',
            });
          }
        }),

      updateNameservers: protectedProcedure
        .input(updateNameserversSchema)
        .mutation(async ({ input, ctx }) => {
          try {
            await this.domainManager.initialize();
            
            const domain = await db
              .select()
              .from(domains)
              .where(
                and(
                  eq(domains.id, input.domainId),
                  eq(domains.tenantId, ctx.user.tenantId)
                )
              )
              .limit(1);

            if (!domain.length) {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Domain not found',
              });
            }

            await this.domainManager.updateNameservers(input.domainId, input.nameservers);

            return { success: true };
          } catch (error) {
            if (error instanceof TRPCError) throw error;
            
            console.error('Failed to update nameservers:', error);
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: error instanceof Error ? error.message : 'Failed to update nameservers',
            });
          }
        }),

      // Domain Information
      listDomains: protectedProcedure
        .input(z.object({
          clientId: z.string().uuid().optional(),
          page: z.number().min(1).default(1),
          limit: z.number().min(1).max(100).default(20),
        }))
        .query(async ({ input, ctx }) => {
          try {
            const offset = (input.page - 1) * input.limit;
            
            let query = db
              .select()
              .from(domains)
              .where(eq(domains.tenantId, ctx.user.tenantId));

            if (input.clientId) {
              query = query.where(eq(domains.clientId, input.clientId));
            }

            const [results, [{ count }]] = await Promise.all([
              query
                .orderBy(desc(domains.createdAt))
                .limit(input.limit)
                .offset(offset),
              db
                .select({ count: sql<number>`count(*)` })
                .from(domains)
                .where(eq(domains.tenantId, ctx.user.tenantId))
            ]);

            return {
              domains: results,
              pagination: {
                page: input.page,
                limit: input.limit,
                total: count,
              },
            };
          } catch (error) {
            console.error('Failed to list domains:', error);
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to list domains',
            });
          }
        }),

      // DNS Zone Management
      getDnsZones: protectedProcedure
        .input(z.object({ domainId: z.string().uuid() }))
        .query(async ({ input, ctx }) => {
          try {
            const domain = await db
              .select()
              .from(domains)
              .where(
                and(
                  eq(domains.id, input.domainId),
                  eq(domains.tenantId, ctx.user.tenantId)
                )
              )
              .limit(1);

            if (!domain.length) {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Domain not found',
              });
            }

            const zones = await db
              .select()
              .from(dnsZones)
              .where(eq(dnsZones.domainId, input.domainId));

            return zones;
          } catch (error) {
            if (error instanceof TRPCError) throw error;
            
            console.error('Failed to get DNS zones:', error);
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to get DNS zones',
            });
          }
        }),

      // DNS Record Management
      createDnsRecord: protectedProcedure
        .input(createDnsRecordSchema)
        .mutation(async ({ input, ctx }) => {
          try {
            await this.domainManager.initialize();
            
            const zone = await db
              .select()
              .from(dnsZones)
              .where(
                and(
                  eq(dnsZones.id, input.zoneId),
                  eq(dnsZones.tenantId, ctx.user.tenantId)
                )
              )
              .limit(1);

            if (!zone.length) {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'DNS zone not found',
              });
            }

            const recordId = await this.domainManager.createDnsRecord({
              ...input,
              tenantId: ctx.user.tenantId,
            });

            return { success: true, recordId };
          } catch (error) {
            if (error instanceof TRPCError) throw error;
            
            console.error('Failed to create DNS record:', error);
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: error instanceof Error ? error.message : 'Failed to create DNS record',
            });
          }
        }),

      updateDnsRecord: protectedProcedure
        .input(updateDnsRecordSchema)
        .mutation(async ({ input, ctx }) => {
          try {
            await this.domainManager.initialize();
            
            const record = await db
              .select()
              .from(dnsRecords)
              .where(
                and(
                  eq(dnsRecords.id, input.recordId),
                  eq(dnsRecords.tenantId, ctx.user.tenantId)
                )
              )
              .limit(1);

            if (!record.length) {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'DNS record not found',
              });
            }

            const { recordId, ...updates } = input;
            await this.domainManager.updateDnsRecord(recordId, updates);

            return { success: true };
          } catch (error) {
            if (error instanceof TRPCError) throw error;
            
            console.error('Failed to update DNS record:', error);
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: error instanceof Error ? error.message : 'Failed to update DNS record',
            });
          }
        }),

      deleteDnsRecord: protectedProcedure
        .input(z.object({ recordId: z.string().uuid() }))
        .mutation(async ({ input, ctx }) => {
          try {
            await this.domainManager.initialize();
            
            const record = await db
              .select()
              .from(dnsRecords)
              .where(
                and(
                  eq(dnsRecords.id, input.recordId),
                  eq(dnsRecords.tenantId, ctx.user.tenantId)
                )
              )
              .limit(1);

            if (!record.length) {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'DNS record not found',
              });
            }

            await this.domainManager.deleteDnsRecord(input.recordId);

            return { success: true };
          } catch (error) {
            if (error instanceof TRPCError) throw error;
            
            console.error('Failed to delete DNS record:', error);
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: error instanceof Error ? error.message : 'Failed to delete DNS record',
            });
          }
        }),

      getDnsRecords: protectedProcedure
        .input(z.object({ zoneId: z.string().uuid() }))
        .query(async ({ input, ctx }) => {
          try {
            const zone = await db
              .select()
              .from(dnsZones)
              .where(
                and(
                  eq(dnsZones.id, input.zoneId),
                  eq(dnsZones.tenantId, ctx.user.tenantId)
                )
              )
              .limit(1);

            if (!zone.length) {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'DNS zone not found',
              });
            }

            const records = await db
              .select()
              .from(dnsRecords)
              .where(eq(dnsRecords.zoneId, input.zoneId))
              .orderBy(desc(dnsRecords.createdAt));

            return records;
          } catch (error) {
            if (error instanceof TRPCError) throw error;
            
            console.error('Failed to get DNS records:', error);
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to get DNS records',
            });
          }
        }),
    });
  }

  // ComponentHandler Implementation
  async provision(data: { subscribedComponentId: string; config: any; }): Promise<{ success: boolean; remoteId?: string; data?: any; }> {
    try {
      this.logger.info(`🌐 Provisioning domain registration for component: ${data.subscribedComponentId}`);

      const [subscribedComponent] = await db
        .select()
        .from(subscribedComponents)
        .where(eq(subscribedComponents.id, data.subscribedComponentId))
        .limit(1);

      if (!subscribedComponent) {
        throw new Error(`Subscribed component not found: ${data.subscribedComponentId}`);
      }

      const pluginConfig = this.config as DomainPluginConfig;
      const registrationOptions: DomainRegistrationOptions = {
        domainName: data.config.domainName,
        tld: data.config.tld || pluginConfig.defaultTld || '.com',
        registrationPeriod: data.config.registrationPeriod || pluginConfig.defaultRegistrationPeriod || 1,
        autoRenew: data.config.autoRenew ?? pluginConfig.defaultAutoRenew ?? true,
        privacyProtection: data.config.privacyProtection ?? pluginConfig.defaultPrivacyProtection ?? false,
        nameservers: data.config.nameservers,
        customFields: data.config.customFields,
      };

      if (!registrationOptions.domainName) {
        throw new Error('Domain name is required for domain registration');
      }

      const domainId = await this.domainManager.registerDomain({
        ...registrationOptions,
        tenantId: subscribedComponent.tenantId,
        clientId: subscribedComponent.subscriptionId,
      });

      this.logger.info(`✅ Domain registration successful: ${registrationOptions.domainName}${registrationOptions.tld}`, { domainId });

      return {
        success: true,
        remoteId: domainId,
        data: registrationOptions
      };

    } catch (error) {
      this.logger.error(`❌ Domain registration failed for component ${data.subscribedComponentId}:`, error);
      return {
        success: false,
        data: {
          error: error instanceof Error ? error.message : 'Unknown error occurred'
        }
      };
    }
  }

  async suspend(data: { subscribedComponentId: string; }): Promise<{ success: boolean; }> {
    this.logger.info(`⏸️ Domain suspension called for component: ${data.subscribedComponentId}`);
    return { success: true };
  }

  async unsuspend(data: { subscribedComponentId: string; }): Promise<{ success: boolean; }> {
    this.logger.info(`▶️ Domain unsuspension called for component: ${data.subscribedComponentId}`);
    return { success: true };
  }

  async terminate(data: { subscribedComponentId: string; }): Promise<{ success: boolean; }> {
    try {
      this.logger.info(`🗑️ Domain termination called for component: ${data.subscribedComponentId}`);
      
      const [subscribedComponent] = await db
        .select()
        .from(subscribedComponents)
        .where(eq(subscribedComponents.id, data.subscribedComponentId))
        .limit(1);

      if (!subscribedComponent) {
        this.logger.warn(`Subscribed component not found: ${data.subscribedComponentId}`);
        return { success: true };
      }

      const remoteId = subscribedComponent.metadata?.remoteId;
      
      if (remoteId) {
        await this.domainManager.disableAutoRenew(remoteId);
        this.logger.info(`✅ Auto-renewal disabled for domain: ${remoteId}`);
      }
      
      return { success: true };
      
    } catch (error) {
      this.logger.error(`❌ Domain termination failed for component ${data.subscribedComponentId}:`, error);
      return { success: false };
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string; details?: Record<string, any>; }> {
    try {
      await this.domainManager.initialize();
      const registrarStatus = await this.checkRegistrarConnections();
      const dnsStatus = await this.checkDnsProviders();
      
      const healthy = registrarStatus.every(r => r.healthy) && dnsStatus.every(d => d.healthy);
      
      return {
        healthy,
        message: healthy ? 'Domain services are operational' : 'Some domain services are not working',
        details: {
          registrars: registrarStatus,
          dnsProviders: dnsStatus,
          renewalChecksActive: this.renewalCheckInterval !== null,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        message: 'Failed to check domain services health',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  // Private methods
  private validateDomainConfig(config: DomainPluginConfig): boolean {
    if (!config) return false;

    if (config.defaultRegistrationPeriod && (config.defaultRegistrationPeriod < 1 || config.defaultRegistrationPeriod > 10)) {
      return false;
    }

    if (config.renewalCheckInterval && (config.renewalCheckInterval < 3600 || config.renewalCheckInterval > 86400)) {
      return false;
    }

    return true;
  }

  private async startRenewalChecks(): Promise<void> {
    if (this.renewalCheckInterval) return;
    
    const interval = (this.config as DomainPluginConfig)?.renewalCheckInterval || 43200; // 12 hours default
    this.renewalCheckInterval = setInterval(async () => {
      try {
        await this.domainManager.checkExpiringDomains();
      } catch (error) {
        this.logger.error('Failed to check expiring domains:', error);
      }
    }, interval * 1000);
    
    this.logger.info('🔄 Started domain renewal checks');
  }

  private async checkRegistrarConnections(): Promise<Array<{ registrar: string; healthy: boolean; error?: string; }>> {
    // Implementation for checking registrar connections
    return [];
  }

  private async checkDnsProviders(): Promise<Array<{ provider: string; healthy: boolean; error?: string; }>> {
    // Implementation for checking DNS provider health
    return [];
  }

  private async handleDomainRegistered(context: any): Promise<void> {
    this.logger.info('🌐 Domain registered:', context);
  }

  private async handleDomainRenewed(context: any): Promise<void> {
    this.logger.info('🔄 Domain renewed:', context);
  }

  private async handleDomainExpiring(context: any): Promise<void> {
    this.logger.info('⚠️ Domain expiring:', context);
  }

  private async handleDomainTransferred(context: any): Promise<void> {
    this.logger.info('↔️ Domain transferred:', context);
  }
} 