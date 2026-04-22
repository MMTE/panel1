import { fetchBlob, fetchJson, getApiBaseUrl } from './http';

const base = () => `${getApiBaseUrl()}/api/audit`;

export interface AuditLogRow {
  id: string;
  actionType: string;
  resourceType: string;
  resourceId: string | null;
  userId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  oldValues: unknown;
  newValues: unknown;
  metadata: unknown;
  createdAt: string;
}

export interface AuditLogsResult {
  logs: AuditLogRow[];
  total: number;
  hasMore: boolean;
}

export interface AuditFilterOptions {
  actionTypes: string[];
  resourceTypes: string[];
}

export interface AuditExportListItem {
  id: string;
  status: string;
  format: string;
  startDate: string;
  endDate: string;
  downloadUrl: string | null;
  fileSize: number | null;
  recordCount: number | null;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string | null;
}

export interface AuditExportStatus {
  id: string;
  status: string;
  format: string;
  downloadUrl: string | null;
  fileSize: number | null;
  recordCount: number | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string | null;
}

export interface AuditStats {
  totalEvents: number;
  period: number;
  eventsByAction: { actionType: string; count: number }[];
  eventsByResource: { resourceType: string; count: number }[];
  dailyEvents: { date: string; count: number }[];
}

export const auditApi = {
  async queryLogs(params: {
    page?: number;
    limit?: number;
    actionTypes?: string;
    resourceTypes?: string;
    userId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<AuditLogsResult> {
    const limit = params.limit ?? 20;
    const page = params.page ?? 1;
    const offset = (page - 1) * limit;
    const qs = new URLSearchParams();
    qs.set('limit', String(limit));
    qs.set('offset', String(offset));
    qs.set('orderBy', 'desc');
    if (params.actionTypes && params.actionTypes !== 'all') {
      qs.set('actionTypes', params.actionTypes);
    }
    if (params.resourceTypes && params.resourceTypes !== 'all') {
      qs.set('resourceTypes', params.resourceTypes);
    }
    if (params.userId && params.userId !== 'all') qs.set('userId', params.userId);
    if (params.startDate) qs.set('startDate', params.startDate);
    if (params.endDate) qs.set('endDate', params.endDate);
    return fetchJson<AuditLogsResult>(`${base()}/logs?${qs.toString()}`);
  },

  async getFilterOptions(): Promise<AuditFilterOptions> {
    return fetchJson<AuditFilterOptions>(`${base()}/filter-options`);
  },

  async getStats(days = 30): Promise<AuditStats> {
    return fetchJson<AuditStats>(`${base()}/stats?days=${days}`);
  },

  async logEvent(body: {
    actionType: string;
    resourceType: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ eventId: string; success: boolean }> {
    return fetchJson<{ eventId: string; success: boolean }>(`${base()}/events`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async createExport(body: {
    startDate: string;
    endDate: string;
    format: 'json' | 'csv';
    resourceTypes?: string[];
  }): Promise<{ exportId: string; status: string; message: string }> {
    return fetchJson(`${base()}/exports`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async listExports(params?: { limit?: number; offset?: number }): Promise<{
    exports: AuditExportListItem[];
    total: number;
    hasMore: boolean;
  }> {
    const qs = new URLSearchParams();
    qs.set('limit', String(params?.limit ?? 20));
    qs.set('offset', String(params?.offset ?? 0));
    return fetchJson(`${base()}/exports?${qs.toString()}`);
  },

  async getExportStatus(exportId: string): Promise<AuditExportStatus> {
    return fetchJson<AuditExportStatus>(`${base()}/exports/${encodeURIComponent(exportId)}`);
  },

  /** Poll until completed/failed or maxAttempts */
  async waitForExportReady(
    exportId: string,
    options?: { intervalMs?: number; maxAttempts?: number },
  ): Promise<AuditExportStatus> {
    const intervalMs = options?.intervalMs ?? 800;
    const maxAttempts = options?.maxAttempts ?? 60;
    for (let i = 0; i < maxAttempts; i++) {
      const s = await this.getExportStatus(exportId);
      if (s.status === 'completed' || s.status === 'failed') return s;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return this.getExportStatus(exportId);
  },

  async downloadExportBlob(exportId: string): Promise<Blob> {
    const url = `${getApiBaseUrl()}/api/audit/exports/${encodeURIComponent(exportId)}/download`;
    return fetchBlob(url);
  },
};
