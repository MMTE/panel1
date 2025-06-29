import { z } from 'zod';
import { router, protectedProcedure } from '../trpc/trpc';
import { TRPCError } from '@trpc/server';
import { DomainManager } from '../lib/domains/DomainManager';
import { db } from '../db';
import { 
  domains, 
  dnsZones, 
  dnsRecords, 
  domainOperations
} from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';

const domainManager = DomainManager.getInstance();

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

const createDnsRecordSchema = z.object({
  zoneId: z.string().uuid('Valid zone ID is required'),
  name: z.string().min(1, 'Record name is required'),
  type: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'PTR', 'SRV', 'CAA']),
  value: z.string().min(1, 'Record value is required'),
  ttl: z.number().min(300).max(86400).default(3600),
  priority: z.number().optional(),
});

const updateDnsRecordSchema = z.object({
  recordId: z.string().uuid('Valid record ID is required'),
  name: z.string().min(1).optional(),
  value: z.string().min(1).optional(),
  ttl: z.number().min(300).max(86400).optional(),
  priority: z.number().optional(),
});

const updateNameserversSchema = z.object({
  domainId: z.string().uuid('Valid domain ID is required'),
  nameservers: z.array(z.string().min(1, 'Nameserver cannot be empty')).min(1, 'At least one nameserver is required'),
});

export const domainsRouter = router({
  // Domain Registration
  registerDomain: protectedProcedure
    .input(registerDomainSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        await domainManager.initialize();
        
        const domainId = await domainManager.registerDomain({
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
        await domainManager.initialize();
        
        // Verify domain belongs to tenant
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

        await domainManager.renewDomain(input.domainId, input.years);

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
        await domainManager.initialize();
        
        // Verify domain belongs to tenant
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

        await domainManager.updateNameservers(input.domainId, input.nameservers);

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

        const results = await query
          .orderBy(desc(domains.createdAt))
          .limit(input.limit)
          .offset(offset);

        return {
          domains: results,
          pagination: {
            page: input.page,
            limit: input.limit,
            total: results.length, // TODO: Add proper count query
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

  getDomain: protectedProcedure
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

        return domain[0];
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        console.error('Failed to get domain:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get domain',
        });
      }
    }),

  // DNS Zone Management
  getDnsZones: protectedProcedure
    .input(z.object({ domainId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      try {
        // Verify domain belongs to tenant
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
        await domainManager.initialize();
        
        // Verify zone belongs to tenant
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

        const recordId = await domainManager.createDnsRecord({
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
        await domainManager.initialize();
        
        // Verify record belongs to tenant
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
        await domainManager.updateDnsRecord(recordId, updates);

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
        await domainManager.initialize();
        
        // Verify record belongs to tenant
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

        await domainManager.deleteDnsRecord(input.recordId);

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
        // Verify zone belongs to tenant
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

  // Domain Operations History
  getDomainOperations: protectedProcedure
    .input(z.object({ domainId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      try {
        // Verify domain belongs to tenant
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

        const operations = await db
          .select()
          .from(domainOperations)
          .where(eq(domainOperations.domainId, input.domainId))
          .orderBy(desc(domainOperations.createdAt))
          .limit(50);

        return operations;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        console.error('Failed to get domain operations:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get domain operations',
        });
      }
    }),
}); 