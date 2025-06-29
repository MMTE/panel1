import { z } from 'zod';
import { router, adminProcedure, protectedProcedure } from '../trpc/trpc';
import { auditService } from '../lib/audit/AuditService';
import { TRPCError } from '@trpc/server';

export const auditRouter = router({
  // Query audit logs with filtering and pagination
  queryLogs: adminProcedure
    .input(z.object({
      actionTypes: z.array(z.string()).optional(),
      resourceTypes: z.array(z.string()).optional(),
      resourceId: z.string().optional(),
      userId: z.string().optional(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
      limit: z.number().min(1).max(1000).default(50),
      offset: z.number().min(0).default(0),
      orderBy: z.enum(['asc', 'desc']).default('desc'),
    }))
    .query(async ({ input, ctx }) => {
      const result = await auditService.queryAuditLogs({
        tenantId: ctx.tenantId!,
        ...input,
      });

      return {
        logs: result.logs.map(log => ({
          id: log.id,
          actionType: log.actionType,
          resourceType: log.resourceType,
          resourceId: log.resourceId,
          userId: log.userId,
          ipAddress: log.ipAddress,
          userAgent: log.userAgent,
          sessionId: log.sessionId,
          oldValues: log.oldValues,
          newValues: log.newValues,
          metadata: log.metadata,
          createdAt: log.createdAt,
        })),
        total: result.total,
        hasMore: result.hasMore,
      };
    }),

  // Get audit trail for a specific resource
  getResourceAuditTrail: adminProcedure
    .input(z.object({
      resourceType: z.string(),
      resourceId: z.string(),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const result = await auditService.getResourceAuditTrail(
        ctx.tenantId!,
        input.resourceType,
        input.resourceId,
        input.limit
      );

      return {
        logs: result.logs.map(log => ({
          id: log.id,
          actionType: log.actionType,
          userId: log.userId,
          oldValues: log.oldValues,
          newValues: log.newValues,
          metadata: log.metadata,
          createdAt: log.createdAt,
        })),
        total: result.total,
      };
    }),

  // Get audit statistics
  getStats: adminProcedure
    .input(z.object({
      days: z.number().min(1).max(365).default(30),
    }))
    .query(async ({ input, ctx }) => {
      const stats = await auditService.getAuditStats(ctx.tenantId!, input.days);
      return stats;
    }),

  // Create an audit export request
  createExport: adminProcedure
    .input(z.object({
      startDate: z.date(),
      endDate: z.date(),
      resourceTypes: z.array(z.string()).optional(),
      format: z.enum(['json', 'csv', 'pdf']).default('json'),
    }))
    .mutation(async ({ input, ctx }) => {
      // Validate date range
      if (input.startDate >= input.endDate) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Start date must be before end date',
        });
      }

      // Limit export range to 1 year
      const maxRange = 365 * 24 * 60 * 60 * 1000; // 1 year in milliseconds
      if (input.endDate.getTime() - input.startDate.getTime() > maxRange) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Export date range cannot exceed 1 year',
        });
      }

      const exportId = await auditService.createExportRequest({
        tenantId: ctx.tenantId!,
        requestedBy: ctx.user.id,
        startDate: input.startDate,
        endDate: input.endDate,
        resourceTypes: input.resourceTypes,
        format: input.format,
      });

      // Trigger background processing
      // In a real implementation, this would be handled by a job queue
      setTimeout(() => {
        auditService.processExport(exportId).catch(error => {
          console.error('Export processing failed:', error);
        });
      }, 1000);

      return {
        exportId,
        status: 'pending',
        message: 'Export request created. You will be notified when it is ready.',
      };
    }),

  // Get export status and download link
  getExportStatus: adminProcedure
    .input(z.object({
      exportId: z.string().uuid(),
    }))
    .query(async ({ input, ctx }) => {
      const { db } = await import('../db');
      const { auditLogExports } = await import('../db/schema');
      const { eq, and } = await import('drizzle-orm');

      const [exportRequest] = await db
        .select({
          id: auditLogExports.id,
          status: auditLogExports.status,
          format: auditLogExports.format,
          fileUrl: auditLogExports.fileUrl,
          fileSize: auditLogExports.fileSize,
          recordCount: auditLogExports.recordCount,
          errorMessage: auditLogExports.errorMessage,
          createdAt: auditLogExports.createdAt,
          completedAt: auditLogExports.completedAt,
          expiresAt: auditLogExports.expiresAt,
        })
        .from(auditLogExports)
        .where(and(
          eq(auditLogExports.id, input.exportId),
          eq(auditLogExports.tenantId, ctx.tenantId!)
        ))
        .limit(1);

      if (!exportRequest) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Export request not found',
        });
      }

      return {
        id: exportRequest.id,
        status: exportRequest.status,
        format: exportRequest.format,
        fileUrl: exportRequest.fileUrl,
        fileSize: exportRequest.fileSize ? parseInt(exportRequest.fileSize) : null,
        recordCount: exportRequest.recordCount ? parseInt(exportRequest.recordCount) : null,
        errorMessage: exportRequest.errorMessage,
        createdAt: exportRequest.createdAt,
        completedAt: exportRequest.completedAt,
        expiresAt: exportRequest.expiresAt,
        isExpired: exportRequest.expiresAt ? new Date() > exportRequest.expiresAt : false,
      };
    }),

  // Get list of export requests
  getExports: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input, ctx }) => {
      const { db } = await import('../db');
      const { auditLogExports, users } = await import('../db/schema');
      const { eq, desc, count } = await import('drizzle-orm');

      const exports = await db
        .select({
          id: auditLogExports.id,
          status: auditLogExports.status,
          format: auditLogExports.format,
          startDate: auditLogExports.startDate,
          endDate: auditLogExports.endDate,
          fileSize: auditLogExports.fileSize,
          recordCount: auditLogExports.recordCount,
          createdAt: auditLogExports.createdAt,
          completedAt: auditLogExports.completedAt,
          expiresAt: auditLogExports.expiresAt,
          requestedByEmail: users.email,
          requestedByName: users.firstName,
        })
        .from(auditLogExports)
        .leftJoin(users, eq(auditLogExports.requestedBy, users.id))
        .where(eq(auditLogExports.tenantId, ctx.tenantId!))
        .orderBy(desc(auditLogExports.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const [totalResult] = await db
        .select({ count: count() })
        .from(auditLogExports)
        .where(eq(auditLogExports.tenantId, ctx.tenantId!));

      return {
        exports: exports.map(exp => ({
          id: exp.id,
          status: exp.status,
          format: exp.format,
          startDate: exp.startDate,
          endDate: exp.endDate,
          fileSize: exp.fileSize ? parseInt(exp.fileSize) : null,
          recordCount: exp.recordCount ? parseInt(exp.recordCount) : null,
          createdAt: exp.createdAt,
          completedAt: exp.completedAt,
          expiresAt: exp.expiresAt,
          requestedBy: {
            email: exp.requestedByEmail,
            name: exp.requestedByName,
          },
          isExpired: exp.expiresAt ? new Date() > exp.expiresAt : false,
        })),
        total: totalResult.count,
        hasMore: input.offset + exports.length < totalResult.count,
      };
    }),

  // Log a custom audit event (for API usage)
  logEvent: protectedProcedure
    .input(z.object({
      actionType: z.string(),
      resourceType: z.string(),
      resourceId: z.string().optional(),
      metadata: z.record(z.any()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const eventId = await auditService.logEvent({
        actionType: input.actionType,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        userId: ctx.user.id,
        tenantId: ctx.tenantId!,
        metadata: input.metadata,
      });

      return {
        eventId,
        success: true,
      };
    }),

  // Get available action types and resource types for filtering
  getFilterOptions: adminProcedure
    .query(async ({ ctx }) => {
      const { db } = await import('../db');
      const { auditLogs } = await import('../db/schema');
      const { eq, sql } = await import('drizzle-orm');

      // Get distinct action types
      const actionTypes = await db
        .selectDistinct({ actionType: auditLogs.actionType })
        .from(auditLogs)
        .where(eq(auditLogs.tenantId, ctx.tenantId!))
        .orderBy(auditLogs.actionType);

      // Get distinct resource types
      const resourceTypes = await db
        .selectDistinct({ resourceType: auditLogs.resourceType })
        .from(auditLogs)
        .where(eq(auditLogs.tenantId, ctx.tenantId!))
        .orderBy(auditLogs.resourceType);

      return {
        actionTypes: actionTypes.map(item => item.actionType),
        resourceTypes: resourceTypes.map(item => item.resourceType),
      };
    }),

  // Cleanup old audit logs (admin only)
  cleanupOldLogs: adminProcedure
    .mutation(async ({ ctx }) => {
      const deletedCount = await auditService.cleanupOldLogs(ctx.tenantId!);
      
      return {
        success: true,
        deletedCount,
        message: `Successfully deleted ${deletedCount} old audit log entries`,
      };
    }),
}); 