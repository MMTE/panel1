import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { ModuleContext } from '@panel1/types';
import type {
  IAuditService, AuditEvent, AuditQuery, AuditQueryResult, AuditStats,
  AuditExportRequest, AuditExportDetail, AuditExportsResult, AuditFilterOptions,
} from './types.js';
import { auditLogs, auditLogRetentionPolicies, auditLogExports } from './schema.js';
import { eq, and, gte, lte, desc, asc, count, sql, inArray, lt, isNotNull } from 'drizzle-orm';

const EXPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function exportDiskPath(tenantId: string, exportId: string, format: string): string {
  const base = process.env.AUDIT_EXPORT_DIR || path.join(process.cwd(), 'data', 'audit-exports');
  const ext = format === 'csv' ? 'csv' : 'json';
  return path.join(base, tenantId, `${exportId}.${ext}`);
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function logsToCsv(logs: { id: string; actionType: string; resourceType: string; resourceId: string | null; userId: string | null; createdAt: Date; metadata: unknown }[]): string {
  const header = ['id', 'actionType', 'resourceType', 'resourceId', 'userId', 'createdAt', 'metadata'];
  const lines = [header.join(',')];
  for (const row of logs) {
    lines.push([
      escapeCsvCell(row.id),
      escapeCsvCell(row.actionType),
      escapeCsvCell(row.resourceType),
      escapeCsvCell(row.resourceId),
      escapeCsvCell(row.userId),
      escapeCsvCell(row.createdAt?.toISOString?.() ?? row.createdAt),
      escapeCsvCell(row.metadata),
    ].join(','));
  }
  return lines.join('\n');
}

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

    const id = exportReq.id;
    void this.processExportJob(id).catch((err) => {
      this.ctx.logger.error('audit export job failed', err);
    });

    return id;
  }

  /** Background: query logs, write JSON/CSV under AUDIT_EXPORT_DIR, update row. */
  private async processExportJob(exportId: string): Promise<void> {
    const [row] = await this.db
      .select()
      .from(auditLogExports)
      .where(eq(auditLogExports.id, exportId))
      .limit(1);

    if (!row || row.status !== 'pending') {
      return;
    }

    await this.db
      .update(auditLogExports)
      .set({ status: 'processing' })
      .where(eq(auditLogExports.id, exportId));

    try {
      const tenantId = row.tenantId;
      const conditions = [
        eq(auditLogs.tenantId, tenantId),
        gte(auditLogs.createdAt, row.startDate),
        lte(auditLogs.createdAt, row.endDate),
      ];
      const resourceTypes = row.resourceTypes as string[] | null;
      if (resourceTypes?.length) {
        conditions.push(inArray(auditLogs.resourceType, resourceTypes));
      }

      const logs = await this.db
        .select()
        .from(auditLogs)
        .where(and(...conditions))
        .orderBy(desc(auditLogs.createdAt));

      const base = process.env.AUDIT_EXPORT_DIR || path.join(process.cwd(), 'data', 'audit-exports');
      const tenantDir = path.join(base, tenantId);
      await mkdir(tenantDir, { recursive: true });

      const fmt = row.format === 'csv' ? 'csv' : 'json';
      const relativeKey = path.join(tenantId, `${exportId}.${fmt}`);
      const absPath = path.join(base, relativeKey);

      const recordCount = logs.length;
      let body: string;
      if (fmt === 'csv') {
        body = logsToCsv(logs as any);
      } else {
        body = JSON.stringify(
          {
            exportId,
            tenantId,
            generatedAt: new Date().toISOString(),
            recordCount,
            logs,
          },
          null,
          2
        );
      }

      await writeFile(absPath, body, 'utf8');
      const statSize = Buffer.byteLength(body, 'utf8');
      const expiresAt = new Date(Date.now() + EXPORT_TTL_MS);

      await this.db
        .update(auditLogExports)
        .set({
          status: 'completed',
          fileUrl: relativeKey.replace(/\\/g, '/'),
          fileSize: String(statSize),
          recordCount: String(recordCount),
          completedAt: new Date(),
          expiresAt,
          errorMessage: null,
        })
        .where(eq(auditLogExports.id, exportId));

      await this.ctx.emit('audit.export.completed', { exportId, recordCount });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.db
        .update(auditLogExports)
        .set({
          status: 'failed',
          errorMessage: message,
          completedAt: new Date(),
        })
        .where(eq(auditLogExports.id, exportId));
      await this.ctx.emit('audit.export.failed', { exportId, error: message });
    }
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
    const downloadUrl =
      row.status === 'completed' ? `/api/audit/exports/${row.id}/download` : null;
    return {
      id: row.id,
      status: row.status,
      format: row.format,
      downloadUrl,
      fileSize: row.fileSize ? parseInt(row.fileSize, 10) : null,
      recordCount: row.recordCount ? parseInt(row.recordCount, 10) : null,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      expiresAt: row.expiresAt,
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
        id: r.id,
        status: r.status,
        format: r.format,
        startDate: r.startDate,
        endDate: r.endDate,
        downloadUrl: r.status === 'completed' ? `/api/audit/exports/${r.id}/download` : null,
        fileSize: r.fileSize ? parseInt(r.fileSize, 10) : null,
        recordCount: r.recordCount ? parseInt(r.recordCount, 10) : null,
        createdAt: r.createdAt,
        completedAt: r.completedAt,
        expiresAt: r.expiresAt,
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

  async cleanupExpiredExportFiles(): Promise<number> {
    const base = process.env.AUDIT_EXPORT_DIR || path.join(process.cwd(), 'data', 'audit-exports');
    const now = new Date();
    const stale = await this.db
      .select({
        id: auditLogExports.id,
        fileUrl: auditLogExports.fileUrl,
        expiresAt: auditLogExports.expiresAt,
      })
      .from(auditLogExports)
      .where(
        and(
          isNotNull(auditLogExports.expiresAt),
          lt(auditLogExports.expiresAt, now),
          eq(auditLogExports.status, 'completed')
        )
      );

    let purged = 0;
    for (const r of stale) {
      if (r.fileUrl) {
        const abs = path.join(base, r.fileUrl);
        try {
          await unlink(abs);
        } catch {
          /* ignore missing file */
        }
      }
      await this.db.delete(auditLogExports).where(eq(auditLogExports.id, r.id));
      purged++;
    }
    return purged;
  }

  async runWeeklyMaintenance(): Promise<{ logsDeleted: number; exportsPurged: number }> {
    const tenantRows = await this.db
      .selectDistinct({ tenantId: auditLogs.tenantId })
      .from(auditLogs);

    let logsDeleted = 0;
    for (const t of tenantRows) {
      logsDeleted += await this.cleanupOldLogs(t.tenantId);
    }

    const exportsPurged = await this.cleanupExpiredExportFiles();
    return { logsDeleted, exportsPurged };
  }

  async getExportDownloadPayload(
    exportId: string,
    tenantId: string
  ): Promise<{ absolutePath: string; mime: string; filename: string } | null> {
    const [row] = await this.db
      .select({
        status: auditLogExports.status,
        format: auditLogExports.format,
        fileUrl: auditLogExports.fileUrl,
      })
      .from(auditLogExports)
      .where(and(eq(auditLogExports.id, exportId), eq(auditLogExports.tenantId, tenantId)))
      .limit(1);

    if (!row || row.status !== 'completed' || !row.fileUrl) {
      return null;
    }

    const base = process.env.AUDIT_EXPORT_DIR || path.join(process.cwd(), 'data', 'audit-exports');
    const absolutePath = path.join(base, row.fileUrl);
    const fmt = row.format === 'csv' ? 'csv' : 'json';
    const mime = fmt === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8';
    const filename = `audit-export-${exportId.slice(0, 8)}.${fmt}`;
    return { absolutePath, mime, filename };
  }
}
