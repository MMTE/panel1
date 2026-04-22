import { fetchJson, getApiBaseUrl } from './http';

const base = () => `${getApiBaseUrl()}/api/support`;

export interface SupportStats {
  totalTickets: number;
  openTickets: number;
  inProgressTickets: number;
  averageFirstResponseTime: number;
  averageResolutionTime: number;
  satisfactionScore: number;
  ticketsByPriority: Record<string, number>;
  ticketsByCategory: Record<string, number>;
}

export interface SlaMetrics {
  firstResponseSlaRate: number;
  resolutionSlaRate: number;
  averageFirstResponseTime: number;
  averageResolutionTime: number;
  breachedTickets: number;
  atRiskTickets: number;
}

export interface SupportTicketRow {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string | null;
  priority: string | null;
  clientId: string | null;
  categoryId: string | null;
  assignedToId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastActivityAt: string | null;
}

export interface SupportMessageRow {
  id: string;
  ticketId: string;
  content: string;
  htmlContent: string | null;
  messageType: string | null;
  authorId: string | null;
  authorEmail: string | null;
  authorName: string | null;
  isInternal: boolean | null;
  createdAt: string | null;
}

export interface PaginatedTickets {
  tickets: SupportTicketRow[];
  total: number;
  hasMore: boolean;
}

export interface TicketWithMessages {
  ticket: SupportTicketRow;
  messages: SupportMessageRow[];
}

export interface SupportCategoryRow {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  sortOrder: number | null;
  isActive: boolean | null;
}

export const supportApi = {
  async getStats(): Promise<SupportStats> {
    return fetchJson<SupportStats>(`${base()}/stats`);
  },

  async getSlaMetrics(params?: { startDate?: string; endDate?: string }): Promise<SlaMetrics> {
    const qs = new URLSearchParams();
    if (params?.startDate) qs.set('startDate', params.startDate);
    if (params?.endDate) qs.set('endDate', params.endDate);
    const q = qs.toString();
    return fetchJson<SlaMetrics>(`${base()}/sla/metrics${q ? `?${q}` : ''}`);
  },

  async listTickets(params: {
    search?: string;
    status?: string;
    priority?: string;
    categoryId?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedTickets> {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.status && params.status !== 'all') qs.set('status', params.status);
    if (params.priority && params.priority !== 'all') qs.set('priority', params.priority);
    if (params.categoryId && params.categoryId !== 'all') qs.set('categoryId', params.categoryId);
    qs.set('limit', String(params.limit ?? 50));
    qs.set('offset', String(params.offset ?? 0));
    return fetchJson<PaginatedTickets>(`${base()}/tickets?${qs.toString()}`);
  },

  async getTicket(id: string, includeInternal = true): Promise<TicketWithMessages> {
    const qs = new URLSearchParams();
    qs.set('includeInternal', String(includeInternal));
    return fetchJson<TicketWithMessages>(`${base()}/tickets/${encodeURIComponent(id)}?${qs.toString()}`);
  },

  async createTicket(body: {
    subject: string;
    content: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    categoryId?: string;
    clientId?: string;
    assignedToId?: string;
    tags?: string[];
  }): Promise<SupportTicketRow> {
    return fetchJson<SupportTicketRow>(`${base()}/tickets`, {
      method: 'POST',
      body: JSON.stringify({
        priority: 'MEDIUM',
        tags: [],
        customFields: {},
        attachments: [],
        ...body,
      }),
    });
  },

  async addMessage(
    ticketId: string,
    body: {
      content: string;
      htmlContent?: string;
      messageType?: string;
      isInternal?: boolean;
    },
  ): Promise<SupportMessageRow> {
    return fetchJson<SupportMessageRow>(`${base()}/tickets/${encodeURIComponent(ticketId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        messageType: 'STAFF_REPLY',
        isInternal: false,
        attachments: [],
        ...body,
      }),
    });
  },

  async updateTicketStatus(
    ticketId: string,
    status: string,
    reason?: string,
  ): Promise<SupportTicketRow> {
    return fetchJson<SupportTicketRow>(`${base()}/tickets/${encodeURIComponent(ticketId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reason }),
    });
  },

  async assignTicket(ticketId: string): Promise<{ agentId: string | null }> {
    return fetchJson<{ agentId: string | null }>(
      `${base()}/tickets/${encodeURIComponent(ticketId)}/assign`,
      { method: 'POST' },
    );
  },

  async listCategories(): Promise<SupportCategoryRow[]> {
    return fetchJson<SupportCategoryRow[]>(`${base()}/categories`);
  },

  async createCategory(body: {
    name: string;
    description?: string;
    color?: string;
    icon?: string;
    sortOrder?: number;
  }): Promise<{ id: string; name: string }> {
    return fetchJson<{ id: string; name: string }>(`${base()}/categories`, {
      method: 'POST',
      body: JSON.stringify({
        color: '#6366f1',
        icon: 'Help',
        sortOrder: 0,
        ...body,
      }),
    });
  },
};
