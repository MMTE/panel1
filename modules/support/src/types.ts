export interface ISupportService {
  createTicket(params: CreateTicketInput, tenantId: string, createdById: string): Promise<SupportTicketDTO>;
  addMessage(ticketId: string, params: AddMessageInput, tenantId: string): Promise<TicketMessageDTO>;
  updateTicketStatus(
    ticketId: string,
    status: TicketStatus,
    tenantId: string,
    userId?: string,
    reason?: string,
  ): Promise<SupportTicketDTO>;
  assignTicket(ticketId: string, tenantId: string): Promise<string | null>;
  getTickets(
    filters: TicketFilters,
    tenantId: string,
    limit?: number,
    offset?: number,
  ): Promise<PaginatedTickets>;
  getTicketWithMessages(
    ticketId: string,
    tenantId: string,
    includeInternal?: boolean,
  ): Promise<TicketWithMessages | null>;
  getSupportStats(tenantId: string): Promise<SupportStats>;
}

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'WAITING_STAFF' | 'RESOLVED' | 'CLOSED';
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type MessageType = 'CUSTOMER_MESSAGE' | 'STAFF_REPLY' | 'INTERNAL_NOTE' | 'SYSTEM_MESSAGE' | 'AUTO_RESPONSE';

export interface CreateTicketInput {
  subject: string;
  content: string;
  priority?: TicketPriority;
  categoryId?: string;
  clientId?: string;
  assignedToId?: string;
  tags?: string[];
  customFields?: Record<string, any>;
  attachments?: Array<{
    filename: string;
    fileSize: number;
    mimeType: string;
    url: string;
  }>;
}

export interface AddMessageInput {
  content: string;
  htmlContent?: string;
  messageType?: MessageType;
  isInternal?: boolean;
  authorId?: string;
  authorEmail?: string;
  authorName?: string;
  attachments?: Array<{
    filename: string;
    fileSize: number;
    mimeType: string;
    url: string;
  }>;
  timeSpent?: number;
}

export interface TicketFilters {
  status?: string[];
  priority?: string[];
  categoryId?: string;
  assignedToId?: string;
  clientId?: string;
  tags?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
  search?: string;
}

export interface SupportTicketDTO {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string | null;
  priority: string | null;
  clientId: string | null;
  categoryId: string | null;
  assignedToId: string | null;
  createdById: string | null;
  tags: string[] | null;
  customFields: Record<string, any> | null;
  firstResponseDue: Date | null;
  resolutionDue: Date | null;
  firstResponseAt: Date | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  escalationLevel: number | null;
  lastActivityAt: Date | null;
  satisfactionRating: number | null;
  satisfactionFeedback: string | null;
  tenantId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface TicketMessageDTO {
  id: string;
  ticketId: string;
  content: string;
  htmlContent: string | null;
  messageType: string | null;
  authorId: string | null;
  authorEmail: string | null;
  authorName: string | null;
  isInternal: boolean | null;
  attachments: any[] | null;
  timeSpent: number | null;
  tenantId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface TicketWithMessages {
  ticket: SupportTicketDTO;
  messages: TicketMessageDTO[];
}

export interface PaginatedTickets {
  tickets: SupportTicketDTO[];
  total: number;
  hasMore: boolean;
}

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

declare module '@panel1/types' {
  interface EventMap {
    'support.ticket.created': { ticketId: string; ticketNumber: string; tenantId: string };
    'support.ticket.replied': { ticketId: string; messageId: string; messageType: string };
    'support.ticket.resolved': { ticketId: string; resolvedAt: Date };
    'support.ticket.closed': { ticketId: string; closedAt: Date };
    'support.ticket.escalated': { ticketId: string; level: number; reason: string };
    'support.ticket.assigned': { ticketId: string; agentId: string };
    'support.sla.breached': { ticketId: string; breachType: string };
  }
}
