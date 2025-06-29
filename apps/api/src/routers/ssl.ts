import { z } from 'zod';
import { router, protectedProcedure } from '../trpc/trpc';
import { TRPCError } from '@trpc/server';
import { SslCertificateManager } from '../lib/ssl/SslCertificateManager';
import { db } from '../db';
import { 
  sslCertificates, 
  sslCertificateOperations, 
  sslValidationRecords
} from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';

const sslManager = SslCertificateManager.getInstance();

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

const installCertificateSchema = z.object({
  certificateId: z.string().uuid('Valid certificate ID is required'),
  serviceInstanceId: z.string().uuid('Valid service instance ID is required'),
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

export const sslRouter = router({
  // SSL Certificate Management
  issueCertificate: protectedProcedure
    .input(issueCertificateSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        await sslManager.initialize();
        
        const certificateId = await sslManager.issueCertificate({
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
        await sslManager.initialize();
        
        // Verify certificate belongs to tenant
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

        await sslManager.renewCertificate(input.certificateId);

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

  installCertificate: protectedProcedure
    .input(installCertificateSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        await sslManager.initialize();
        
        // Verify certificate belongs to tenant
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

        await sslManager.installCertificate(input.certificateId, input.serviceInstanceId);

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        console.error('Failed to install SSL certificate:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to install SSL certificate',
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
        await sslManager.initialize();
        
        // Verify certificate belongs to tenant
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

        await sslManager.revokeCertificate(input.certificateId, input.reason);

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

        const results = await query
          .orderBy(desc(sslCertificates.createdAt))
          .limit(input.limit)
          .offset(offset);

        return {
          certificates: results,
          pagination: {
            page: input.page,
            limit: input.limit,
            total: results.length, // TODO: Add proper count query
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

  getCertificate: protectedProcedure
    .input(z.object({ certificateId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      try {
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

        return certificate[0];
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        console.error('Failed to get SSL certificate:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get SSL certificate',
        });
      }
    }),

  // SSL Validation Management
  createValidationRecord: protectedProcedure
    .input(createValidationRecordSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        await sslManager.initialize();
        
        // Verify certificate belongs to tenant
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

        const recordId = await sslManager.createValidationRecord({
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
        await sslManager.initialize();
        
        // Verify validation record belongs to tenant
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

        await sslManager.validateDomain(input.recordId);

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

  getValidationRecords: protectedProcedure
    .input(z.object({ certificateId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      try {
        // Verify certificate belongs to tenant
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

        const records = await db
          .select()
          .from(sslValidationRecords)
          .where(eq(sslValidationRecords.certificateId, input.certificateId))
          .orderBy(desc(sslValidationRecords.createdAt));

        return records;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        console.error('Failed to get SSL validation records:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get SSL validation records',
        });
      }
    }),

  // SSL Certificate Operations History
  getCertificateOperations: protectedProcedure
    .input(z.object({ certificateId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      try {
        // Verify certificate belongs to tenant
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

        const operations = await db
          .select()
          .from(sslCertificateOperations)
          .where(eq(sslCertificateOperations.certificateId, input.certificateId))
          .orderBy(desc(sslCertificateOperations.createdAt))
          .limit(50);

        return operations;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        console.error('Failed to get SSL certificate operations:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get SSL certificate operations',
        });
      }
    }),

  // SSL Certificate Health Check
  checkCertificateHealth: protectedProcedure
    .input(z.object({ certificateId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      try {
        await sslManager.initialize();
        
        // Verify certificate belongs to tenant
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

        const health = await sslManager.checkCertificateHealth(input.certificateId);

        return health;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        console.error('Failed to check SSL certificate health:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to check SSL certificate health',
        });
      }
    }),

  // Get expiring certificates
  getExpiringCertificates: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(365).default(30) }))
    .query(async ({ input, ctx }) => {
      try {
        await sslManager.initialize();
        
        const certificates = await sslManager.getCertificatesExpiringWithin(input.days, ctx.user.tenantId);

        return certificates;
      } catch (error) {
        console.error('Failed to get expiring SSL certificates:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get expiring SSL certificates',
        });
      }
    }),
}); 