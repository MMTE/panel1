// import { supabase } from '../supabase'; // TODO: Replace with tRPC
import { getCurrentTenantId } from '../tenant/TenantManager';
import { trpc } from '../../api/trpc';

export interface AuditEvent {
  action: string;
  category: string;
  targetId?: string;
  targetType?: string;
  metadata?: Record<string, any>;
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
 * Audit logging system for Panel1
 * Provides comprehensive audit trails for security and compliance
 * TODO: Implement persistent storage with tRPC + Drizzle
 */
export class AuditLogger {
  private static instance: AuditLogger;
  private trpcClient: typeof trpc;

  private constructor() {
    this.trpcClient = trpc;
  }

  static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }

  /**
   * Log an auth-related audit event
   */
  public async logAuth(action: string, userId: string = 'anonymous', metadata?: any): Promise<void> {
    const tenantId = getCurrentTenantId();
    return this.log({
      action,
      category: 'auth',
      targetId: userId,
      targetType: 'user',
      metadata: {
        ...metadata,
        tenantId,
      }
    });
  }

  /**
   * Log a data change audit event
   */
  public async logDataChange(
    action: 'create' | 'update' | 'delete',
    resourceType: string,
    resourceId: string,
    oldValues?: any,
    newValues?: any,
    userId: string = 'system'
  ): Promise<void> {
    const tenantId = getCurrentTenantId();
    return this.log({
      action,
      category: 'data',
      targetId: resourceId,
      targetType: resourceType,
      metadata: {
        userId,
        tenantId,
        oldValues,
        newValues,
      }
    });
  }

  /**
   * Log a system-level audit event
   */
  public async logSystem(action: string, metadata?: any): Promise<void> {
    const tenantId = getCurrentTenantId();
    return this.log({
      action,
      category: 'system',
      metadata: {
        ...metadata,
        tenantId,
      }
    });
  }

  /**
   * Log an audit event
   */
  public async log(event: AuditEvent): Promise<void> {
    try {
      await this.trpcClient.audit.logEvent.mutate({
        action: event.action,
        category: event.category,
        targetId: event.targetId,
        targetType: event.targetType,
        metadata: event.metadata || {},
        timestamp: event.timestamp || new Date()
      });
    } catch (error) {
      console.error('Failed to log audit event:', error);
      // Don't throw the error - we don't want audit logging failures to break the app
      // Just log it to the console
    }
  }

  /**
   * Get audit trail with filtering options
   */
  public async getAuditTrail(options: AuditTrailOptions = {}): Promise<AuditEvent[]> {
    try {
      const result = await this.trpcClient.audit.getAuditTrail.query({
        startDate: options.startDate?.toISOString(),
        endDate: options.endDate?.toISOString(),
        category: options.category,
        action: options.action,
        targetId: options.targetId,
        targetType: options.targetType,
        limit: options.limit || 50,
        offset: options.offset || 0
      });

      return result.events;
    } catch (error) {
      console.error('Failed to fetch audit trail:', error);
      throw error;
    }
  }

  /**
   * Export audit events in specified format
   */
  public async exportAuditEvents(options: ExportOptions): Promise<Blob> {
    try {
      const response = await this.trpcClient.audit.exportAuditTrail.query({
        format: options.format,
        startDate: options.startDate?.toISOString(),
        endDate: options.endDate?.toISOString(),
        category: options.category,
        action: options.action,
        targetId: options.targetId,
        targetType: options.targetType
      });

      // Convert the response to a Blob
      const blob = new Blob(
        [options.format === 'csv' ? response.csv : JSON.stringify(response.json, null, 2)],
        { type: options.format === 'csv' ? 'text/csv' : 'application/json' }
      );

      return blob;
    } catch (error) {
      console.error('Failed to export audit events:', error);
      throw error;
    }
  }
}

// Singleton instance
const auditLogger = AuditLogger.getInstance();

export { auditLogger };

// Convenience functions with tenant context
export const logAuth = async (action: string, userId: string = 'anonymous', metadata?: any) =>
  auditLogger.logAuth(action, userId, metadata);

export const logDataChange = async (
  action: 'create' | 'update' | 'delete',
  resourceType: string,
  resourceId: string,
  oldValues?: any,
  newValues?: any,
  userId?: string
) => auditLogger.logDataChange(action, resourceType, resourceId, oldValues, newValues, userId);

export const logSystem = async (action: string, metadata?: any) =>
  auditLogger.logSystem(action, metadata);

export const exportAuditEvents = (
  startDate: Date,
  endDate: Date,
  format?: 'json' | 'csv'
) => auditLogger.exportAuditEvents({ startDate, endDate, format });