import type { ModuleContext } from '@panel1/types';
import type {
  IAuditService, AuditEvent, AuditQuery, AuditQueryResult, AuditStats,
  AuditExportRequest, AuditExportDetail, AuditExportsResult, AuditFilterOptions,
} from './types.js';
import { auditLogs, auditLogRetentionPolicies, auditLogExports } from './schema.js';
import { eq, and, gte, lte, desc, asc, count, sql, inArray } from 'drizzle-orm';

export class AuditService implements IAuditService {
  private db: any;
  private ctx: ModuleContext;

  constructor(ctx: ModuleContext) {
    this.ctx = ctx;
    this.db = ctx.db;
  }

  async logEvent(event: AuditEvent): Promise<string> {
    const [auditLog] = await this.db
      .insert(auditLogs)
      .values({
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
      })
      .returning({ id: auditLogs.id });

    await this.ctx.emit('audit.logged', {
      auditLogId: auditLog.id,
      actionType: event.actionType,
      resourceType: event.resourceType,
    });

    return auditLog.id;
  }

  async queryLogs(query: AuditQuery): Promise<AuditQueryResult> {
    const conditions = [eq(auditLogs.tenantId, query.tenantId)];

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

    const orderBy = query.orderBy === 'asc' ? asc(auditLogs.createdAt) : desc(auditLogs.createdAt);
    const limit = query.limit || 50;
    const offset = query.offset || 0;

    const logs = await this.db
      .select()
      .from(auditLogs)
      .where(and(...conditions))
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    const [totalResult] = await this.db
      .select({ count: count() })
      .from(auditLogs)
      .where(and(...conditions));

    return {
      logs,
      total: totalResult.count,
      hasMore: offset + logs.length < totalResult.count,
    };
  }

  async getResourceAuditTrail(tenantId: string, resourceType: string, resourceId: string, limit = 50): Promise<AuditQueryResult> {
    return this.queryLogs({
      tenantId,
      resourceTypes: [resourceType],
      resourceId,
      limit,
      orderBy: 'desc',
    });
  }

  async getStats(tenantId: string, days = 30): Promise<AuditStats> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [totalEvents] = await this.db
      .select({ count: count() })
      .from(auditLogs)
      .where(and(eq(auditLogs.tenantId, tenantId), gte(auditLogs.createdAt, startDate)));

    const eventsByAction = await this.db
      .select({ actionType: auditLogs.actionType, count: count() })
      .from(auditLogs)
      .where(and(eq(auditLogs.tenantId, tenantId), gte(auditLogs.createdAt, startDate)))
      .groupBy(auditLogs.actionType)
      .orderBy(desc(count()));

    const eventsByResource = await this.db
      .select({ resourceType: auditLogs.resourceType, count: count() })
      .from(auditLogs)
      .where(and(eq(auditLogs.tenantId, tenantId), gte(auditLogs.createdAt, startDate)))
      .groupBy(auditLogs.resourceType)
      .orderBy(desc(count()));

    const dailyEvents = await this.db
      .select({ date: sql<string>`DATE(${auditLogs.createdAt})`, count: count() })
      .from(auditLogs)
      .where(and(eq(auditLogs.tenantId, tenantId), gte(auditLogs.createdAt, startDate)))
      .groupBy(sql`DATE(${auditLogs.createdAt})`)
      .orderBy(sql`DATE(${auditLogs.createdAt})`);

    return {
      totalEvents: totalEvents.count,
      period: days,
      eventsByAction,
      eventsByResource,
      dailyEvents,
    };
  }

  async createExportRequest(request: AuditExportRequest): Promise<string> {
    const [exportReq] = await this.db
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

    return exportReq.id;
  }

  async getExportStatus(exportId: string, tenantId: string): Promise<AuditExportDetail | null> {
    const [row] = await this.db
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
      .where(and(eq(auditLogExports.id, exportId), eq(auditLogExports.tenantId, tenantId)))
      .limit(1);

    if (!row) return null;
    return {
      ...row,
      fileSize: row.fileSize ? parseInt(row.fileSize) : null,
      recordCount: row.recordCount ? parseInt(row.recordCount) : null,
    };
  }

  async getExports(tenantId: string, limit = 20, offset = 0): Promise<AuditExportsResult> {
    const rows = await this.db
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
      })
      .from(auditLogExports)
      .where(eq(auditLogExports.tenantId, tenantId))
      .orderBy(desc(auditLogExports.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalResult] = await this.db
      .select({ count: count() })
      .from(auditLogExports)
      .where(eq(auditLogExports.tenantId, tenantId));

    return {
      exports: rows.map((r: any) => ({
        ...r,
        fileSize: r.fileSize ? parseInt(r.fileSize) : null,
        recordCount: r.recordCount ? parseInt(r.recordCount) : null,
      })),
      total: totalResult.count,
      hasMore: offset + rows.length < totalResult.count,
    };
  }

  async getFilterOptions(tenantId: string): Promise<AuditFilterOptions> {
    const actionTypes = await this.db
      .selectDistinct({ actionType: auditLogs.actionType })
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, tenantId))
      .orderBy(auditLogs.actionType);

    const resourceTypes = await this.db
      .selectDistinct({ resourceType: auditLogs.resourceType })
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, tenantId))
      .orderBy(auditLogs.resourceType);

    return {
      actionTypes: actionTypes.map((r: any) => r.actionType),
      resourceTypes: resourceTypes.map((r: any) => r.resourceType),
    };
  }

  async cleanupOldLogs(tenantId: string): Promise<number> {
    const policies = await this.db
      .select()
      .from(auditLogRetentionPolicies)
      .where(eq(auditLogRetentionPolicies.tenantId, tenantId));

    let totalDeleted = 0;

    for (const policy of policies) {
      if (policy.immutable === 'true') continue;

      const retentionDays = parseInt(policy.retentionDays);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const deleted = await this.db
        .delete(auditLogs)
        .where(and(
          eq(auditLogs.tenantId, tenantId),
          eq(auditLogs.resourceType, policy.resourceType),
          lte(auditLogs.createdAt, cutoffDate)
        ));

      totalDeleted += deleted.rowCount || 0;
    }

    await this.ctx.emit('audit.cleanup.completed', { tenantId, deletedCount: totalDeleted });
    return totalDeleted;
  }
}
