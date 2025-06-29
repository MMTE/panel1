// import { supabase } from '../supabase'; // TODO: Replace with tRPC
import { tenantManager } from '../tenant/TenantManager';

export interface AuditEvent {
  user_id?: string;
  action_type: string;
  resource_type: string;
  resource_id?: string;
  old_values?: any;
  new_values?: any;
  ip_address?: string;
  user_agent?: string;
  tenant_id?: string;
  timestamp: string;
}

/**
 * Audit logging system for Panel1
 * Provides comprehensive audit trails for security and compliance
 * TODO: Implement persistent storage with tRPC + Drizzle
 */
export class AuditLogger {
  private static instance: AuditLogger;
  private auditEvents: AuditEvent[] = [];

  private constructor() {}

  static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }

  /**
   * Log an authentication event
   */
  async logAuth(
    action: 'login' | 'logout' | 'failed_login' | 'password_change' | 'impersonate' | 'failed_impersonate',
    userId?: string,
    metadata: any = {}
  ): Promise<void> {
    const event: AuditEvent = {
      user_id: userId,
      action_type: `auth.${action}`,
      resource_type: 'user',
      resource_id: userId,
      new_values: metadata,
      ip_address: this.getClientIP(),
      user_agent: this.getUserAgent(),
      timestamp: new Date().toISOString(),
    };

    await this.logEvent(event);
  }

  /**
   * Log a data change event
   */
  async logDataChange(
    action: 'create' | 'update' | 'delete',
    resourceType: string,
    resourceId: string,
    oldValues: any = null,
    newValues: any = null
  ): Promise<void> {
    const event: AuditEvent = {
      action_type: `data.${action}`,
      resource_type: resourceType,
      resource_id: resourceId,
      old_values: oldValues,
      new_values: newValues,
      ip_address: this.getClientIP(),
      user_agent: this.getUserAgent(),
      timestamp: new Date().toISOString(),
    };

    await this.logEvent(event);
  }

  /**
   * Log a system event
   */
  async logSystem(
    action: string,
    metadata: any = {}
  ): Promise<void> {
    const event: AuditEvent = {
      action_type: `system.${action}`,
      resource_type: 'system',
      new_values: metadata,
      ip_address: this.getClientIP(),
      user_agent: this.getUserAgent(),
      timestamp: new Date().toISOString(),
    };

    await this.logEvent(event);
  }

  /**
   * Store audit event
   * TODO: Implement with tRPC + Drizzle
   */
  private async logEvent(event: AuditEvent): Promise<void> {
    try {
      // Console logging for development
      console.log('📋 Audit Event:', event);
      
      // Store in memory for demo purposes
      this.auditEvents.push(event);
      
      // Keep only last 1000 events in memory
      if (this.auditEvents.length > 1000) {
        this.auditEvents = this.auditEvents.slice(-1000);
      }
      
      // TODO: Replace with tRPC call to store in PostgreSQL
      console.log('TODO: Store audit event in database via tRPC');
    } catch (error) {
      console.error('Error logging audit event:', error);
    }
  }

  /**
   * Get audit trail for resource
   * TODO: Implement with tRPC + Drizzle
   */
  async getAuditTrail(options: {
    resourceType?: string;
    resourceId?: string;
    userId?: string;
    actionType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  } = {}): Promise<AuditEvent[]> {
    try {
      console.log('TODO: Fetch audit trail from database via tRPC:', options);
      
      // For now, return in-memory events with basic filtering
      let filtered = [...this.auditEvents];
      
      if (options.resourceType) {
        filtered = filtered.filter(e => e.resource_type === options.resourceType);
      }
      
      if (options.resourceId) {
        filtered = filtered.filter(e => e.resource_id === options.resourceId);
      }
      
      if (options.userId) {
        filtered = filtered.filter(e => e.user_id === options.userId);
      }
      
      if (options.actionType) {
        filtered = filtered.filter(e => e.action_type === options.actionType);
      }
      
      // Sort by timestamp (newest first)
      filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      // Apply limit and offset
      const offset = options.offset || 0;
      const limit = options.limit || filtered.length;
      
      return filtered.slice(offset, offset + limit);
    } catch (error) {
      console.error('Error fetching audit trail:', error);
      return [];
    }
  }

  /**
   * Get client IP address
   */
  private getClientIP(): string {
    // In a real application, this would extract from request headers
    return '127.0.0.1';
  }

  /**
   * Get user agent
   */
  private getUserAgent(): string {
    if (typeof navigator !== 'undefined') {
      return navigator.userAgent;
    }
    return 'Unknown';
  }

  /**
   * Export audit events (for compliance)
   * TODO: Implement with tRPC + Drizzle
   */
  async exportAuditEvents(options: {
    startDate: Date;
    endDate: Date;
    format?: 'json' | 'csv';
  }): Promise<string> {
    try {
      console.log('TODO: Export audit events via tRPC:', options);
      
      const events = await this.getAuditTrail({
        startDate: options.startDate,
        endDate: options.endDate,
      });
      
      if (options.format === 'csv') {
        // Simple CSV export
        const headers = ['timestamp', 'action_type', 'resource_type', 'resource_id', 'user_id'];
        const rows = events.map(event => [
          event.timestamp,
          event.action_type,
          event.resource_type,
          event.resource_id || '',
          event.user_id || ''
        ]);
        
        return [headers, ...rows].map(row => row.join(',')).join('\n');
      } else {
        return JSON.stringify(events, null, 2);
      }
    } catch (error) {
      console.error('Error exporting audit events:', error);
      return '';
    }
  }
}

// Singleton instance
const auditLogger = AuditLogger.getInstance();

export { auditLogger };

// Convenience functions with tenant context
export const logAuth = (action: 'login' | 'logout' | 'failed_login' | 'impersonate' | 'failed_impersonate', userId?: string, metadata?: any) =>
  auditLogger.logAuth(action, userId, metadata);

export const logDataChange = (
  action: 'create' | 'update' | 'delete',
  resourceType: string,
  resourceId: string,
  oldValues?: any,
  newValues?: any,
  userId?: string
) => auditLogger.logDataChange(action, resourceType, resourceId, oldValues, newValues, userId);

export const logSystem = (
  action: string,
  metadata?: any
) => auditLogger.logSystem(action, metadata);

export const exportAuditEvents = (
  startDate: Date,
  endDate: Date,
  format?: 'json' | 'csv'
) => auditLogger.exportAuditEvents({ startDate, endDate, format });