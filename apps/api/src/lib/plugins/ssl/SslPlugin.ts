import { z } from 'zod';
import { BasePlugin } from '../BasePlugin';
import { ComponentHandler } from '../../components/ComponentLifecycleService';
import { SslCertificateManager } from '../../ssl/SslCertificateManager';
import { Logger } from '../../logging/Logger';
import { db } from '../../../db';
import { 
  subscribedComponents,
  sslCertificates,
  sslValidationRecords,
  sslCertificateOperations
} from '../../../db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { ExtensionPoint, PluginHook } from '../types';
import { router, protectedProcedure } from '../../../trpc/trpc';
import { TRPCError } from '@trpc/server';

// Input validation schemas
const issueCertificateSchema = z.object({
  certificateName: z.string().min(1, 'Certificate name is required'),
  type: z.enum(['domain_validated', 'organization_validated', 'extended_validation', 'wildcard', 'multi_domain']),
  provider: z.enum(['letsencrypt', 'sectigo', 'digicert', 'globalsign', 'godaddy', 'namecheap', 'custom']),
  primaryDomain: z.string().min(1, 'Primary domain is required'),
  domains: z.array(z.string().min(1, 'Domain cannot be empty')).min(1, 'At least one domain is required'),
  wildcardDomains: z.array(z.string()).optional(),
  clientId: z.string().uuid('Valid client ID is required'),
  domainId: z.string().uuid().optional(),
  serviceInstanceId: z.string().uuid().optional(),
  validationMethod: z.enum(['dns', 'http', 'email']).default('dns'),
  autoRenew: z.boolean().default(true),
  renewalBuffer: z.number().min(1).max(90).default(30),
});

const createValidationRecordSchema = z.object({
  certificateId: z.string().uuid('Valid certificate ID is required'),
  domain: z.string().min(1, 'Domain is required'),
  method: z.enum(['dns', 'http', 'email']),
  recordName: z.string().optional(),
  recordValue: z.string().optional(),
  recordType: z.string().optional(),
  httpPath: z.string().optional(),
  httpContent: z.string().optional(),
  validationEmail: z.string().email().optional(),
});

interface SslPluginConfig {
  defaultCertificateType?: string;
  defaultValidityPeriod?: number;
  renewalThresholdDays?: number;
  autoRenewal?: boolean;
}

export class SslPlugin extends BasePlugin implements ComponentHandler {
  private sslManager = SslCertificateManager.getInstance();
  private logger = Logger.getInstance();
  private isRenewalMonitoringActive = false;

  constructor() {
    super({
      id: 'ssl-plugin',
      name: 'SSL Certificate Plugin',
      version: '1.0.0',
      description: 'Manages SSL certificates through the component system',
      author: 'Panel1 Team',
      tags: ['ssl', 'security', 'certificates'],
    });
  }

  async install(): Promise<void> {
    await super.install();
    this.logger.info('🔒 Installing SSL Certificate Plugin...');
    await this.sslManager.initialize();
  }

  async uninstall(): Promise<void> {
    await super.uninstall();
    this.logger.info('🗑️ Uninstalling SSL Certificate Plugin...');
  }

  async enable(): Promise<void> {
    await super.enable();
    this.logger.info('✅ Enabling SSL Certificate Plugin...');
    if ((this.config as SslPluginConfig)?.autoRenewal) {
      await this.startRenewalMonitoring();
    }
  }

  async disable(): Promise<void> {
    await super.disable();
    this.logger.info('⏸️ Disabling SSL Certificate Plugin...');
    await this.stopRenewalMonitoring();
  }

  async configure(config: SslPluginConfig): Promise<void> {
    if (!this.validateSslConfig(config)) {
      throw new Error('Invalid SSL plugin configuration');
    }
    await super.configure(config);
  }

  getExtensionPoints(): ExtensionPoint[] {
    return [
      this.registerExtensionPoint(
        'ssl-validation-method',
        'Define custom SSL certificate validation methods',
        {
          type: 'object',
          properties: {
            type: { type: 'string' },
            handler: { type: 'function' },
          },
          required: ['type', 'handler'],
        }
      ),
    ];
  }

  getHooks(): PluginHook[] {
    return [
      this.registerHook('certificate.issued', this.handleCertificateIssued.bind(this), 10),
      this.registerHook('certificate.renewed', this.handleCertificateRenewed.bind(this), 10),
      this.registerHook('certificate.expiring', this.handleCertificateExpiring.bind(this), 10),
      this.registerHook('certificate.revoked', this.handleCertificateRevoked.bind(this), 10),
    ];
  }

  // Register tRPC router for SSL management
  getRouter() {
    return router({
      // SSL Certificate Management
      issueCertificate: protectedProcedure
        .input(issueCertificateSchema)
        .mutation(async ({ input, ctx }) => {
          try {
            await this.sslManager.initialize();
            
            const certificateId = await this.sslManager.issueCertificate({
              ...input,
              tenantId: ctx.user.tenantId,
            });

            return { success: true, certificateId };
          } catch (error) {
            console.error('Failed to issue SSL certificate:', error);
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: error instanceof Error ? error.message : 'Failed to issue SSL certificate',
            });
          }
        }),

      renewCertificate: protectedProcedure
        .input(z.object({ certificateId: z.string().uuid() }))
        .mutation(async ({ input, ctx }) => {
          try {
            await this.sslManager.initialize();
            
            const certificate = await db
              .select()
              .from(sslCertificates)
              .where(
                and(
                  eq(sslCertificates.id, input.certificateId),
                  eq(sslCertificates.tenantId, ctx.user.tenantId)
                )
              )
              .limit(1);

            if (!certificate.length) {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'SSL certificate not found',
              });
            }

            await this.sslManager.renewCertificate(input.certificateId);

            return { success: true };
          } catch (error) {
            if (error instanceof TRPCError) throw error;
            
            console.error('Failed to renew SSL certificate:', error);
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: error instanceof Error ? error.message : 'Failed to renew SSL certificate',
            });
          }
        }),

      revokeCertificate: protectedProcedure
        .input(z.object({ 
          certificateId: z.string().uuid(),
          reason: z.string().optional()
        }))
        .mutation(async ({ input, ctx }) => {
          try {
            await this.sslManager.initialize();
            
            const certificate = await db
              .select()
              .from(sslCertificates)
              .where(
                and(
                  eq(sslCertificates.id, input.certificateId),
                  eq(sslCertificates.tenantId, ctx.user.tenantId)
                )
              )
              .limit(1);

            if (!certificate.length) {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'SSL certificate not found',
              });
            }

            await this.sslManager.revokeCertificate(input.certificateId, input.reason);

            return { success: true };
          } catch (error) {
            if (error instanceof TRPCError) throw error;
            
            console.error('Failed to revoke SSL certificate:', error);
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: error instanceof Error ? error.message : 'Failed to revoke SSL certificate',
            });
          }
        }),

      // SSL Certificate Information
      listCertificates: protectedProcedure
        .input(z.object({
          clientId: z.string().uuid().optional(),
          domainId: z.string().uuid().optional(),
          status: z.enum(['pending', 'active', 'expired', 'revoked', 'cancelled', 'validation_failed']).optional(),
          page: z.number().min(1).default(1),
          limit: z.number().min(1).max(100).default(20),
        }))
        .query(async ({ input, ctx }) => {
          try {
            const offset = (input.page - 1) * input.limit;
            
            let query = db
              .select()
              .from(sslCertificates)
              .where(eq(sslCertificates.tenantId, ctx.user.tenantId));

            if (input.clientId) {
              query = query.where(eq(sslCertificates.clientId, input.clientId));
            }

            if (input.domainId) {
              query = query.where(eq(sslCertificates.domainId, input.domainId));
            }

            if (input.status) {
              query = query.where(eq(sslCertificates.status, input.status));
            }

            const [results, [{ count }]] = await Promise.all([
              query
                .orderBy(desc(sslCertificates.createdAt))
                .limit(input.limit)
                .offset(offset),
              db
                .select({ count: sql<number>`count(*)` })
                .from(sslCertificates)
                .where(eq(sslCertificates.tenantId, ctx.user.tenantId))
            ]);

            return {
              certificates: results,
              pagination: {
                page: input.page,
                limit: input.limit,
                total: count,
              },
            };
          } catch (error) {
            console.error('Failed to list SSL certificates:', error);
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to list SSL certificates',
            });
          }
        }),

      // SSL Validation Management
      createValidationRecord: protectedProcedure
        .input(createValidationRecordSchema)
        .mutation(async ({ input, ctx }) => {
          try {
            await this.sslManager.initialize();
            
            const certificate = await db
              .select()
              .from(sslCertificates)
              .where(
                and(
                  eq(sslCertificates.id, input.certificateId),
                  eq(sslCertificates.tenantId, ctx.user.tenantId)
                )
              )
              .limit(1);

            if (!certificate.length) {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'SSL certificate not found',
              });
            }

            const recordId = await this.sslManager.createValidationRecord({
              ...input,
              tenantId: ctx.user.tenantId,
            });

            return { success: true, recordId };
          } catch (error) {
            if (error instanceof TRPCError) throw error;
            
            console.error('Failed to create SSL validation record:', error);
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: error instanceof Error ? error.message : 'Failed to create SSL validation record',
            });
          }
        }),

      validateDomain: protectedProcedure
        .input(z.object({ recordId: z.string().uuid() }))
        .mutation(async ({ input, ctx }) => {
          try {
            await this.sslManager.initialize();
            
            const record = await db
              .select()
              .from(sslValidationRecords)
              .where(
                and(
                  eq(sslValidationRecords.id, input.recordId),
                  eq(sslValidationRecords.tenantId, ctx.user.tenantId)
                )
              )
              .limit(1);

            if (!record.length) {
              throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'SSL validation record not found',
              });
            }

            await this.sslManager.validateDomain(input.recordId);

            return { success: true };
          } catch (error) {
            if (error instanceof TRPCError) throw error;
            
            console.error('Failed to validate SSL domain:', error);
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: error instanceof Error ? error.message : 'Failed to validate SSL domain',
            });
          }
        }),
    });
  }

  // ComponentHandler Implementation
  async provision(data: { subscribedComponentId: string; config: any; }): Promise<{ success: boolean; remoteId?: string; data?: any; }> {
    try {
      this.logger.info(`🔒 Provisioning SSL certificate for component: ${data.subscribedComponentId}`);

      const [subscribedComponent] = await db
        .select()
        .from(subscribedComponents)
        .where(eq(subscribedComponents.id, data.subscribedComponentId))
        .limit(1);

      if (!subscribedComponent) {
        throw new Error(`Subscribed component not found: ${data.subscribedComponentId}`);
      }

      const config = { ...data.config };
      const domain = config.domain;
      const certificateType = config.certificateType || (this.config as SslPluginConfig).defaultCertificateType || 'domain_validated';
      const validityPeriod = config.validityPeriod || (this.config as SslPluginConfig).defaultValidityPeriod || 365;
      const validationEmail = config.validationEmail;

      if (!domain) {
        throw new Error('Domain is required for SSL certificate provisioning');
      }

      const certificateId = await this.sslManager.issueCertificate({
        domain,
        certificateType,
        validityPeriod,
        validationEmail,
        tenantId: subscribedComponent.tenantId,
        clientId: subscribedComponent.subscriptionId,
      });

      this.logger.info(`✅ SSL certificate issuance successful: ${domain}`, { certificateId });

      return {
        success: true,
        remoteId: certificateId,
        data: {
          domain,
          certificateType,
          validityPeriod,
        }
      };

    } catch (error) {
      this.logger.error(`❌ SSL certificate provisioning failed for component ${data.subscribedComponentId}:`, error);
      return {
        success: false,
        data: {
          error: error instanceof Error ? error.message : 'Unknown error occurred'
        }
      };
    }
  }

  async suspend(data: { subscribedComponentId: string; }): Promise<{ success: boolean; }> {
    this.logger.info(`⏸️ SSL certificate suspension called for component: ${data.subscribedComponentId}`);
    return { success: true };
  }

  async unsuspend(data: { subscribedComponentId: string; }): Promise<{ success: boolean; }> {
    this.logger.info(`▶️ SSL certificate unsuspension called for component: ${data.subscribedComponentId}`);
    return { success: true };
  }

  async terminate(data: { subscribedComponentId: string; }): Promise<{ success: boolean; }> {
    try {
      this.logger.info(`🗑️ SSL certificate termination called for component: ${data.subscribedComponentId}`);
      
      const [subscribedComponent] = await db
        .select()
        .from(subscribedComponents)
        .where(eq(subscribedComponents.id, data.subscribedComponentId))
        .limit(1);

      if (!subscribedComponent) {
        this.logger.warn(`Subscribed component not found: ${data.subscribedComponentId}`);
        return { success: true };
      }

      const certificateId = subscribedComponent.metadata?.remoteId;
      
      if (certificateId) {
        await this.sslManager.revokeCertificate(certificateId, 'Service terminated');
        this.logger.info(`✅ SSL certificate revoked: ${certificateId}`);
      }
      
      return { success: true };
      
    } catch (error) {
      this.logger.error(`❌ SSL certificate termination failed for component ${data.subscribedComponentId}:`, error);
      return { success: false };
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string; details?: Record<string, any>; }> {
    try {
      await this.sslManager.initialize();
      const status = await this.sslManager.checkStatus();
      
      return {
        healthy: status.healthy,
        message: status.healthy ? 'SSL service is operational' : 'SSL service has issues',
        details: {
          ...status,
          autoRenewal: (this.config as SslPluginConfig)?.autoRenewal,
          renewalMonitoring: this.isRenewalMonitoringActive,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        message: 'Failed to check SSL service health',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  // Private methods
  private validateSslConfig(config: SslPluginConfig): boolean {
    if (!config) return false;

    if (config.defaultValidityPeriod && (config.defaultValidityPeriod < 30 || config.defaultValidityPeriod > 825)) {
      return false;
    }

    if (config.renewalThresholdDays && (config.renewalThresholdDays < 1 || config.renewalThresholdDays > 90)) {
      return false;
    }

    return true;
  }

  private async startRenewalMonitoring(): Promise<void> {
    if (this.isRenewalMonitoringActive) return;
    
    this.isRenewalMonitoringActive = true;
    this.logger.info('🔄 Starting SSL certificate renewal monitoring');
    // Implementation of renewal monitoring logic
  }

  private async stopRenewalMonitoring(): Promise<void> {
    if (!this.isRenewalMonitoringActive) return;
    
    this.isRenewalMonitoringActive = false;
    this.logger.info('⏹️ Stopping SSL certificate renewal monitoring');
  }

  private async handleCertificateIssued(context: any): Promise<void> {
    this.logger.info('📜 Certificate issued:', context);
  }

  private async handleCertificateRenewed(context: any): Promise<void> {
    this.logger.info('🔄 Certificate renewed:', context);
  }

  private async handleCertificateExpiring(context: any): Promise<void> {
    this.logger.info('⚠️ Certificate expiring:', context);
  }

  private async handleCertificateRevoked(context: any): Promise<void> {
    this.logger.info('🚫 Certificate revoked:', context);
  }
}