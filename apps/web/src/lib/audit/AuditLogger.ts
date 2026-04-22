import { getCurrentTenantId } from '../tenant/TenantManager';
import { auditApi } from '../../api/auditApi';

export interface AuditEvent {
  action: string;
  category: string;
  targetId?: string;
  targetType?: string;
  metadata?: Record<string, unknown>;
  timestamp?: Date;
}

export interface AuditTrailOptions {
  startDate?: Date;
  endDate?: Date;
  category?: string;
  action?: string;
  targetId?: string;
  targetType?: string;
  limit?: number;
  offset?: number;
}

export interface ExportOptions extends AuditTrailOptions {
  format: 'csv' | 'json';
}

/**
 * Client-side audit helper — posts to modular Hono `POST /api/audit/events`.
 * Failures are swallowed so logging never breaks UX.
 */
export class AuditLogger {
  private static instance: AuditLogger;

  static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }

  public async logAuth(action: string, userId: string = 'anonymous', metadata?: Record<string, unknown>): Promise<void> {
    const tenantId = getCurrentTenantId();
    return this.log({
      action,
      category: 'auth',
      targetId: userId,
      targetType: 'user',
      metadata: { ...metadata, tenantId },
    });
  }

  public async logDataChange(
    action: 'create' | 'update' | 'delete',
    resourceType: string,
    resourceId: string,
    oldValues?: unknown,
    newValues?: unknown,
    userId: string = 'system',
  ): Promise<void> {
    const tenantId = getCurrentTenantId();
    return this.log({
      action: `data.${action}`,
      category: 'data',
      targetId: resourceId,
      targetType: resourceType,
      metadata: { userId, tenantId, oldValues, newValues },
    });
  }

  public async logSystem(action: string, metadata?: Record<string, unknown>): Promise<void> {
    const tenantId = getCurrentTenantId();
    return this.log({
      action: `system.${action}`,
      category: 'system',
      metadata: { ...metadata, tenantId },
    });
  }

  public async log(event: AuditEvent): Promise<void> {
    try {
      const actionType = event.action.includes('.') ? event.action : `${event.category}.${event.action}`;
      await auditApi.logEvent({
        actionType,
        resourceType: event.targetType || event.category || 'app',
        resourceId: event.targetId,
        metadata: {
          ...(event.metadata || {}),
          ...(event.timestamp ? { clientTimestamp: event.timestamp.toISOString() } : {}),
        },
      });
    } catch (error) {
      console.error('Failed to log audit event:', error);
    }
  }

  public async getAuditTrail(options: AuditTrailOptions = {}): Promise<AuditEvent[]> {
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    const page = Math.floor(offset / limit) + 1;
    const result = await auditApi.queryLogs({
      page,
      limit,
      startDate: options.startDate?.toISOString(),
      endDate: options.endDate?.toISOString(),
      actionTypes: options.action,
      resourceTypes: options.targetType,
    });
    return result.logs.map((row) => ({
      action: row.actionType,
      category: row.resourceType,
      targetId: row.resourceId || undefined,
      targetType: row.resourceType,
      metadata: (row.metadata as Record<string, unknown>) || {},
      timestamp: new Date(row.createdAt),
    }));
  }

  public async exportAuditEvents(options: ExportOptions): Promise<Blob> {
    const start = options.startDate ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = options.endDate ?? new Date();
    const { exportId } = await auditApi.createExport({
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      format: options.format,
      resourceTypes: options.targetType ? [options.targetType] : undefined,
    });
    const status = await auditApi.waitForExportReady(exportId);
    if (status.status !== 'completed' || !status.downloadUrl) {
      throw new Error(status.errorMessage || 'Export did not complete');
    }
    return auditApi.downloadExportBlob(exportId);
  }
}

const auditLogger = AuditLogger.getInstance();
export { auditLogger };

export const logAuth = async (action: string, userId: string = 'anonymous', metadata?: Record<string, unknown>) =>
  auditLogger.logAuth(action, userId, metadata);

export const logDataChange = async (
  action: 'create' | 'update' | 'delete',
  resourceType: string,
  resourceId: string,
  oldValues?: unknown,
  newValues?: unknown,
  userId?: string,
) => auditLogger.logDataChange(action, resourceType, resourceId, oldValues, newValues, userId);

export const logSystem = async (action: string, metadata?: Record<string, unknown>) =>
  auditLogger.logSystem(action, metadata);

export const exportAuditEvents = (startDate: Date, endDate: Date, format?: 'json' | 'csv') =>
  auditLogger.exportAuditEvents({ startDate, endDate, format: format ?? 'json' });
