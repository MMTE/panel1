import { fetchJson, getApiBaseUrl } from './http';

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

export const auditApi = {
  async queryLogs(params: {
    page?: number;
    limit?: number;
    actionTypes?: string;
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
    if (params.userId && params.userId !== 'all') qs.set('userId', params.userId);
    if (params.startDate) qs.set('startDate', params.startDate);
    if (params.endDate) qs.set('endDate', params.endDate);
    return fetchJson<AuditLogsResult>(`${base()}/logs?${qs.toString()}`);
  },
};
