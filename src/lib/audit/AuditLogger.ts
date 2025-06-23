import { supabase } from '../supabase';
import { tenantManager } from '../tenant/TenantManager';

export interface AuditLogEntry {
  user_id?: string;
  action_type: string;
  resource_type?: string;
  resource_id?: string;
  old_values?: any;
  new_values?: any;
  ip_address?: string;
  user_agent?: string;
  tenant_id?: string;
}

/**
 * Audit logging system for compliance and security tracking
 * Now with full multi-tenant support
 */
export class AuditLogger {
  private static instance: AuditLogger;
  private isDemoMode: boolean;

  private constructor() {
    this.isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';
  }

  static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }

  /**
   * Log an audit event with automatic tenant context
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      // In demo mode, just log to console instead of writing to database
      if (this.isDemoMode) {
        console.log('🎭 Demo mode: Audit log entry:', {
          ...entry,
          timestamp: new Date().toISOString()
        });
        return;
      }

      const currentTenant = tenantManager.getCurrentTenant();
      
      // Create a function call that will be executed by a Supabase Edge Function or RPC
      // This avoids direct table access which would be blocked by RLS
      const { error } = await supabase.rpc('log_audit_event', {
        user_id: entry.user_id,
        action_type: entry.action_type,
        resource_type: entry.resource_type,
        resource_id: entry.resource_id,
        old_values: entry.old_values,
        new_values: entry.new_values,
        ip_address: entry.ip_address,
        user_agent: entry.user_agent,
        tenant_id: entry.tenant_id || currentTenant?.id,
      });

      if (error) {
        console.error('Failed to log audit event:', error);
        throw error;
      }

    } catch (error) {
      console.error('Audit logging failed:', error);
      // Don't throw here to avoid breaking the main operation
    }
  }

  /**
   * Log user authentication events
   */
  async logAuth(action: 'login' | 'logout' | 'failed_login', userId?: string, metadata?: any): Promise<void> {
    // Skip database operations in demo mode
    if (this.isDemoMode && userId === 'demo-user-id') {
      console.log(`🎭 Demo mode: Auth log - ${action}`, metadata);
      return;
    }
    
    await this.log({
      user_id: userId,
      action_type: `auth.${action}`,
      resource_type: 'user',
      resource_id: userId,
      new_values: metadata,
      ip_address: this.getClientIP(),
      user_agent: this.getUserAgent(),
    });
  }

  /**
   * Log data changes with tenant context
   */
  async logDataChange(
    action: 'create' | 'update' | 'delete',
    resourceType: string,
    resourceId: string,
    oldValues?: any,
    newValues?: any,
    userId?: string
  ): Promise<void> {
    // Skip database operations in demo mode
    if (this.isDemoMode && (userId === 'demo-user-id' || resourceId === 'demo-user-id')) {
      console.log(`🎭 Demo mode: Data change log - ${action} ${resourceType}`, {
        old: oldValues,
        new: newValues
      });
      return;
    }
    
    await this.log({
      user_id: userId,
      action_type: `data.${action}`,
      resource_type: resourceType,
      resource_id: resourceId,
      old_values: oldValues,
      new_values: newValues,
      ip_address: this.getClientIP(),
      user_agent: this.getUserAgent(),
    });
  }

  /**
   * Log administrative actions
   */
  async logAdminAction(
    action: string,
    resourceType?: string,
    resourceId?: string,
    metadata?: any,
    userId?: string
  ): Promise<void> {
    // Skip database operations in demo mode
    if (this.isDemoMode && (userId === 'demo-user-id' || resourceId === 'demo-user-id')) {
      console.log(`🎭 Demo mode: Admin action log - ${action} ${resourceType}`, metadata);
      return;
    }
    
    await this.log({
      user_id: userId,
      action_type: `admin.${action}`,
      resource_type: resourceType,
      resource_id: resourceId,
      new_values: metadata,
      ip_address: this.getClientIP(),
      user_agent: this.getUserAgent(),
    });
  }

  /**
   * Log plugin actions with tenant isolation
   */
  async logPluginAction(
    action: 'install' | 'uninstall' | 'enable' | 'disable' | 'configure',
    pluginId: string,
    metadata?: any,
    userId?: string
  ): Promise<void> {
    // Skip database operations in demo mode
    if (this.isDemoMode && userId === 'demo-user-id') {
      console.log(`🎭 Demo mode: Plugin action log - ${action} ${pluginId}`, metadata);
      return;
    }
    
    await this.log({
      user_id: userId,
      action_type: `plugin.${action}`,
      resource_type: 'plugin',
      resource_id: pluginId,
      new_values: metadata,
      ip_address: this.getClientIP(),
      user_agent: this.getUserAgent(),
    });
  }

  /**
   * Log tenant-specific actions
   */
  async logTenantAction(
    action: string,
    tenantId: string,
    metadata?: any,
    userId?: string
  ): Promise<void> {
    // Skip database operations in demo mode
    if (this.isDemoMode && userId === 'demo-user-id') {
      console.log(`🎭 Demo mode: Tenant action log - ${action} ${tenantId}`, metadata);
      return;
    }
    
    await this.log({
      user_id: userId,
      action_type: `tenant.${action}`,
      resource_type: 'tenant',
      resource_id: tenantId,
      new_values: metadata,
      ip_address: this.getClientIP(),
      user_agent: this.getUserAgent(),
      tenant_id: tenantId, // Explicit tenant for tenant management actions
    });
  }

  /**
   * Get audit logs for current tenant
   */
  async getTenantAuditLogs(
    filters: {
      startDate?: Date;
      endDate?: Date;
      userId?: string;
      actionType?: string;
      resourceType?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<any[]> {
    try {
      // In demo mode, return mock data
      if (this.isDemoMode) {
        return this.getMockAuditLogs(filters);
      }
      
      const currentTenant = tenantManager.getCurrentTenant();
      if (!currentTenant) {
        throw new Error('No tenant context available');
      }

      let query = supabase
        .from('audit_logs')
        .select(`
          *,
          users!inner(email, first_name, last_name)
        `)
        .eq('tenant_id', currentTenant.id)
        .order('occurred_at', { ascending: false });

      if (filters.startDate) {
        query = query.gte('occurred_at', filters.startDate.toISOString());
      }

      if (filters.endDate) {
        query = query.lte('occurred_at', filters.endDate.toISOString());
      }

      if (filters.userId) {
        query = query.eq('user_id', filters.userId);
      }

      if (filters.actionType) {
        query = query.eq('action_type', filters.actionType);
      }

      if (filters.resourceType) {
        query = query.eq('resource_type', filters.resourceType);
      }

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      if (filters.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      return [];
    }
  }

  /**
   * Get mock audit logs for demo mode
   */
  private getMockAuditLogs(filters: any): any[] {
    // Generate some mock audit log entries
    const mockLogs = [
      {
        id: '1',
        user_id: 'demo-user-id',
        action_type: 'auth.login',
        resource_type: 'user',
        resource_id: 'demo-user-id',
        occurred_at: new Date(Date.now() - 5 * 60000).toISOString(),
        ip_address: '127.0.0.1',
        user_agent: navigator.userAgent,
        users: {
          email: 'demo@panel1.dev',
          first_name: 'Demo',
          last_name: 'User'
        }
      },
      {
        id: '2',
        user_id: 'demo-user-id',
        action_type: 'admin.view_dashboard',
        resource_type: 'dashboard',
        occurred_at: new Date(Date.now() - 4 * 60000).toISOString(),
        ip_address: '127.0.0.1',
        user_agent: navigator.userAgent,
        users: {
          email: 'demo@panel1.dev',
          first_name: 'Demo',
          last_name: 'User'
        }
      },
      {
        id: '3',
        user_id: 'demo-user-id',
        action_type: 'data.update',
        resource_type: 'user',
        resource_id: 'demo-user-id',
        old_values: { role: 'CLIENT' },
        new_values: { role: 'ADMIN' },
        occurred_at: new Date(Date.now() - 3 * 60000).toISOString(),
        ip_address: '127.0.0.1',
        user_agent: navigator.userAgent,
        users: {
          email: 'demo@panel1.dev',
          first_name: 'Demo',
          last_name: 'User'
        }
      }
    ];

    // Apply filters (simplified)
    let filtered = [...mockLogs];
    
    if (filters.actionType) {
      filtered = filtered.filter(log => log.action_type === filters.actionType);
    }
    
    if (filters.resourceType) {
      filtered = filtered.filter(log => log.resource_type === filters.resourceType);
    }
    
    // Apply limit and offset
    const offset = filters.offset || 0;
    const limit = filters.limit || filtered.length;
    
    return filtered.slice(offset, offset + limit);
  }

  /**
   * Get client IP address (simplified for demo)
   */
  private getClientIP(): string {
    // In a real implementation, this would extract the IP from request headers
    return '127.0.0.1';
  }

  /**
   * Get user agent (simplified for demo)
   */
  private getUserAgent(): string {
    return typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';
  }
}

// Export singleton instance
export const auditLogger = AuditLogger.getInstance();

// Convenience functions with tenant context
export const logAuth = (action: 'login' | 'logout' | 'failed_login', userId?: string, metadata?: any) =>
  auditLogger.logAuth(action, userId, metadata);

export const logDataChange = (
  action: 'create' | 'update' | 'delete',
  resourceType: string,
  resourceId: string,
  oldValues?: any,
  newValues?: any,
  userId?: string
) => auditLogger.logDataChange(action, resourceType, resourceId, oldValues, newValues, userId);

export const logAdminAction = (
  action: string,
  resourceType?: string,
  resourceId?: string,
  metadata?: any,
  userId?: string
) => auditLogger.logAdminAction(action, resourceType, resourceId, metadata, userId);

export const logPluginAction = (
  action: 'install' | 'uninstall' | 'enable' | 'disable' | 'configure',
  pluginId: string,
  metadata?: any,
  userId?: string
) => auditLogger.logPluginAction(action, pluginId, metadata, userId);

export const logTenantAction = (
  action: string,
  tenantId: string,
  metadata?: any,
  userId?: string
) => auditLogger.logTenantAction(action, tenantId, metadata, userId);