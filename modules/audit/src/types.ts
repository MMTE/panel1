import type { PaginatedResult } from '@panel1/types';

export interface IAuditService {
  logEvent(event: AuditEvent): Promise<string>;
  queryLogs(query: AuditQuery): Promise<AuditQueryResult>;
  getResourceAuditTrail(tenantId: string, resourceType: string, resourceId: string, limit?: number): Promise<AuditQueryResult>;
  getStats(tenantId: string, days?: number): Promise<AuditStats>;
  createExportRequest(request: AuditExportRequest): Promise<string>;
  getExportStatus(exportId: string, tenantId: string): Promise<AuditExportDetail | null>;
  getExports(tenantId: string, limit?: number, offset?: number): Promise<AuditExportsResult>;
  getFilterOptions(tenantId: string): Promise<AuditFilterOptions>;
  cleanupOldLogs(tenantId: string): Promise<number>;
}

export interface AuditEvent {
  actionType: string;
  resourceType: string;
  resourceId?: string;
  userId?: string;
  tenantId: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  oldValues?: unknown;
  newValues?: unknown;
  metadata?: unknown;
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

export interface AuditQueryResult {
  logs: AuditLogEntry[];
  total: number;
  hasMore: boolean;
}

export interface AuditLogEntry {
  id: string;
  actionType: string;
  resourceType: string;
  resourceId: string | null;
  userId: string | null;
  tenantId: string;
  ipAddress: string | null;
  userAgent: string | null;
  sessionId: string | null;
  oldValues: unknown;
  newValues: unknown;
  metadata: unknown;
  createdAt: Date;
}

export interface AuditStats {
  totalEvents: number;
  period: number;
  eventsByAction: { actionType: string; count: number }[];
  eventsByResource: { resourceType: string; count: number }[];
  dailyEvents: { date: string; count: number }[];
}

export interface AuditExportRequest {
  tenantId: string;
  requestedBy: string;
  startDate: Date;
  endDate: Date;
  resourceTypes?: string[];
  format: 'json' | 'csv' | 'pdf';
}

export interface AuditExportDetail {
  id: string;
  status: string;
  format: string;
  fileUrl: string | null;
  fileSize: number | null;
  recordCount: number | null;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
  expiresAt: Date | null;
}

export interface AuditExportsResult {
  exports: AuditExportListItem[];
  total: number;
  hasMore: boolean;
}

export interface AuditExportListItem {
  id: string;
  status: string;
  format: string;
  startDate: Date;
  endDate: Date;
  fileSize: number | null;
  recordCount: number | null;
  createdAt: Date;
  completedAt: Date | null;
  expiresAt: Date | null;
}

export interface AuditFilterOptions {
  actionTypes: string[];
  resourceTypes: string[];
}

declare module '@panel1/types' {
  interface EventMap {
    'audit.logged': { auditLogId: string; actionType: string; resourceType: string };
    'audit.export.completed': { exportId: string; recordCount: number };
    'audit.export.failed': { exportId: string; error: string };
    'audit.cleanup.completed': { tenantId: string; deletedCount: number };
  }
}
