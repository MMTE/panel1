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

export interface PaginatedTickets {
  tickets: SupportTicketRow[];
  total: number;
  hasMore: boolean;
}

export const supportApi = {
  async getStats(): Promise<SupportStats> {
    return fetchJson<SupportStats>(`${base()}/stats`);
  },

  async listTickets(params: {
    search?: string;
    status?: string;
    priority?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedTickets> {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.status && params.status !== 'all') qs.set('status', params.status);
    if (params.priority && params.priority !== 'all') qs.set('priority', params.priority);
    qs.set('limit', String(params.limit ?? 50));
    qs.set('offset', String(params.offset ?? 0));
    return fetchJson<PaginatedTickets>(`${base()}/tickets?${qs.toString()}`);
  },
};
