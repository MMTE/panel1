import { EventEmitter } from 'events';
import { db } from '../../db';
import { auditLogs, auditLogRetentionPolicies, auditLogExports, NewAuditLog } from '../../db/schema';
import { eq, and, gte, lte, desc, asc, count, sql, inArray } from 'drizzle-orm';

export interface AuditEvent {
  actionType: string;
  resourceType: string;
  resourceId?: string;
  userId?: string;
  tenantId: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  oldValues?: any;
  newValues?: any;
  metadata?: any;
}

export interface AuditQuery {
  tenantId: string;
  actionTypes?: string[];
  resourceTypes?: string[];
  resourceId?: string;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  orderBy?: 'asc' | 'desc';
}

export interface AuditExportRequest {
  tenantId: string;
  requestedBy: string;
  startDate: Date;
  endDate: Date;
  resourceTypes?: string[];
  format: 'json' | 'csv' | 'pdf';
}

export class AuditService extends EventEmitter {
  private static instance: AuditService;

  private constructor() {
    super();
  }

  static getInstance(): AuditService {
    if (!AuditService.instance) {
      AuditService.instance = new AuditService();
    }
    return AuditService.instance;
  }

  /**
   * Log an audit event to the database
   */
  async logEvent(event: AuditEvent): Promise<string> {
    try {
      const auditLogData: NewAuditLog = {
        actionType: event.actionType,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        userId: event.userId,
        tenantId: event.tenantId,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        sessionId: event.sessionId,
        oldValues: event.oldValues,
        newValues: event.newValues,
        metadata: event.metadata,
      };

      const [auditLog] = await db
        .insert(auditLogs)
        .values(auditLogData)
        .returning({ id: auditLogs.id });

      this.emit('audit_logged', { id: auditLog.id, ...event });
      
      return auditLog.id;
    } catch (error) {
      console.error('Failed to log audit event:', error);
      this.emit('audit_error', { event, error });
      throw error;
    }
  }

  /**
   * Query audit logs with filtering and pagination
   */
  async queryAuditLogs(query: AuditQuery) {
    try {
      const conditions = [eq(auditLogs.tenantId, query.tenantId)];

      // Add filters
      if (query.actionTypes?.length) {
        conditions.push(inArray(auditLogs.actionType, query.actionTypes));
      }

      if (query.resourceTypes?.length) {
        conditions.push(inArray(auditLogs.resourceType, query.resourceTypes));
      }

      if (query.resourceId) {
        conditions.push(eq(auditLogs.resourceId, query.resourceId));
      }

      if (query.userId) {
        conditions.push(eq(auditLogs.userId, query.userId));
      }

      if (query.startDate) {
        conditions.push(gte(auditLogs.createdAt, query.startDate));
      }

      if (query.endDate) {
        conditions.push(lte(auditLogs.createdAt, query.endDate));
      }

      // Build the query
      const baseQuery = db
        .select()
        .from(auditLogs)
        .where(and(...conditions));

      // Add ordering
      const orderBy = query.orderBy === 'asc' ? asc(auditLogs.createdAt) : desc(auditLogs.createdAt);
      
      // Execute query with pagination
      const logs = await baseQuery
        .orderBy(orderBy)
        .limit(query.limit || 50)
        .offset(query.offset || 0);

      // Get total count
      const [totalResult] = await db
        .select({ count: count() })
        .from(auditLogs)
        .where(and(...conditions));

      return {
        logs,
        total: totalResult.count,
        hasMore: (query.offset || 0) + logs.length < totalResult.count,
      };
    } catch (error) {
      console.error('Failed to query audit logs:', error);
      throw error;
    }
  }

  /**
   * Get audit trail for a specific resource
   */
  async getResourceAuditTrail(
    tenantId: string,
    resourceType: string,
    resourceId: string,
    limit = 50
  ) {
    return this.queryAuditLogs({
      tenantId,
      resourceTypes: [resourceType],
      resourceId,
      limit,
      orderBy: 'desc',
    });
  }

  /**
   * Get audit statistics for a tenant
   */
  async getAuditStats(tenantId: string, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Total events in period
      const [totalEvents] = await db
        .select({ count: count() })
        .from(auditLogs)
        .where(and(
          eq(auditLogs.tenantId, tenantId),
          gte(auditLogs.createdAt, startDate)
        ));

      // Events by action type
      const eventsByAction = await db
        .select({
          actionType: auditLogs.actionType,
          count: count(),
        })
        .from(auditLogs)
        .where(and(
          eq(auditLogs.tenantId, tenantId),
          gte(auditLogs.createdAt, startDate)
        ))
        .groupBy(auditLogs.actionType)
        .orderBy(desc(count()));

      // Events by resource type
      const eventsByResource = await db
        .select({
          resourceType: auditLogs.resourceType,
          count: count(),
        })
        .from(auditLogs)
        .where(and(
          eq(auditLogs.tenantId, tenantId),
          gte(auditLogs.createdAt, startDate)
        ))
        .groupBy(auditLogs.resourceType)
        .orderBy(desc(count()));

      // Daily event counts
      const dailyEvents = await db
        .select({
          date: sql<string>`DATE(${auditLogs.createdAt})`,
          count: count(),
        })
        .from(auditLogs)
        .where(and(
          eq(auditLogs.tenantId, tenantId),
          gte(auditLogs.createdAt, startDate)
        ))
        .groupBy(sql`DATE(${auditLogs.createdAt})`)
        .orderBy(sql`DATE(${auditLogs.createdAt})`);

      return {
        totalEvents: totalEvents.count,
        period: days,
        eventsByAction,
        eventsByResource,
        dailyEvents,
      };
    } catch (error) {
      console.error('Failed to get audit stats:', error);
      throw error;
    }
  }

  /**
   * Create an audit export request
   */
  async createExportRequest(request: AuditExportRequest): Promise<string> {
    try {
      const [exportRequest] = await db
        .insert(auditLogExports)
        .values({
          tenantId: request.tenantId,
          requestedBy: request.requestedBy,
          startDate: request.startDate,
          endDate: request.endDate,
          resourceTypes: request.resourceTypes || null,
          format: request.format,
          status: 'pending',
        })
        .returning({ id: auditLogExports.id });

      // Emit event for background processing
      this.emit('export_requested', { id: exportRequest.id, ...request });

      return exportRequest.id;
    } catch (error) {
      console.error('Failed to create export request:', error);
      throw error;
    }
  }

  /**
   * Process an audit export (background job)
   */
  async processExport(exportId: string): Promise<void> {
    try {
      // Get export request
      const [exportRequest] = await db
        .select()
        .from(auditLogExports)
        .where(eq(auditLogExports.id, exportId))
        .limit(1);

      if (!exportRequest) {
        throw new Error('Export request not found');
      }

      // Update status to processing
      await db
        .update(auditLogExports)
        .set({ status: 'processing' })
        .where(eq(auditLogExports.id, exportId));

      // Query audit logs for export
      const query: AuditQuery = {
        tenantId: exportRequest.tenantId,
        startDate: exportRequest.startDate,
        endDate: exportRequest.endDate,
        resourceTypes: exportRequest.resourceTypes as string[] || undefined,
        limit: 10000, // Large limit for export
      };

      const result = await this.queryAuditLogs(query);
      
      // Generate export file based on format
      let fileContent: string;
      let fileName: string;
      
      switch (exportRequest.format) {
        case 'csv':
          fileContent = this.generateCSVExport(result.logs);
          fileName = `audit-export-${exportId}.csv`;
          break;
        case 'json':
          fileContent = JSON.stringify(result.logs, null, 2);
          fileName = `audit-export-${exportId}.json`;
          break;
        default:
          throw new Error(`Unsupported export format: ${exportRequest.format}`);
      }

      // In a real implementation, you would upload to S3 or save to disk
      // For now, we'll simulate this
      const fileUrl = `/exports/${fileName}`;
      const fileSize = Buffer.byteLength(fileContent, 'utf8');

      // Update export request with completion details
      await db
        .update(auditLogExports)
        .set({
          status: 'completed',
          fileUrl,
          fileSize: fileSize.toString(),
          recordCount: result.logs.length.toString(),
          completedAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        })
        .where(eq(auditLogExports.id, exportId));

      this.emit('export_completed', { id: exportId, fileUrl, recordCount: result.logs.length });
    } catch (error) {
      console.error('Failed to process export:', error);
      
      // Update export request with error
      await db
        .update(auditLogExports)
        .set({
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        })
        .where(eq(auditLogExports.id, exportId));

      this.emit('export_failed', { id: exportId, error });
      throw error;
    }
  }

  /**
   * Generate CSV export
   */
  private generateCSVExport(logs: any[]): string {
    if (logs.length === 0) {
      return 'No data to export';
    }

    const headers = [
      'timestamp',
      'action_type',
      'resource_type',
      'resource_id',
      'user_id',
      'ip_address',
      'user_agent',
    ];

    const rows = logs.map(log => [
      log.createdAt?.toISOString() || '',
      log.actionType || '',
      log.resourceType || '',
      log.resourceId || '',
      log.userId || '',
      log.ipAddress || '',
      log.userAgent || '',
    ]);

    return [headers, ...rows]
      .map(row => row.map(field => `"${field.toString().replace(/"/g, '""')}"`).join(','))
      .join('\n');
  }

  /**
   * Clean up old audit logs based on retention policies
   */
  async cleanupOldLogs(tenantId: string): Promise<number> {
    try {
      // Get retention policies for tenant
      const policies = await db
        .select()
        .from(auditLogRetentionPolicies)
        .where(eq(auditLogRetentionPolicies.tenantId, tenantId));

      let totalDeleted = 0;

      for (const policy of policies) {
        const retentionDays = parseInt(policy.retentionDays);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

        // Skip if marked as immutable
        if (policy.immutable === 'true') {
          continue;
        }

        const deleted = await db
          .delete(auditLogs)
          .where(and(
            eq(auditLogs.tenantId, tenantId),
            eq(auditLogs.resourceType, policy.resourceType),
            lte(auditLogs.createdAt, cutoffDate)
          ));

        totalDeleted += deleted.rowCount || 0;
      }

      this.emit('cleanup_completed', { tenantId, deletedCount: totalDeleted });
      return totalDeleted;
    } catch (error) {
      console.error('Failed to cleanup old logs:', error);
      this.emit('cleanup_failed', { tenantId, error });
      throw error;
    }
  }
}

// Export singleton instance
export const auditService = AuditService.getInstance(); 