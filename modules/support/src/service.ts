import type { ModuleContext } from '@panel1/types';
import { eq, and, or, desc, asc, count, sql, isNull } from 'drizzle-orm';
import {
  supportTickets,
  ticketMessages,
  supportCategories,
  supportAgentProfiles,
  supportTicketCounters,
} from './schema.js';
import type { SupportTicket, TicketMessage, SupportAgentProfile } from './schema.js';
import type {
  ISupportService,
  CreateTicketInput,
  AddMessageInput,
  TicketStatus,
  TicketFilters,
  PaginatedTickets,
  TicketWithMessages,
  SupportStats,
  SupportTicketDTO,
  TicketMessageDTO,
} from './types.js';
import { SupportAutomationEngine } from './automation.js';
import { SlaManager } from './sla.js';

export class SupportService implements ISupportService {
  private db: any;
  private ctx: ModuleContext;
  private automation: SupportAutomationEngine;
  private sla: SlaManager;

  constructor(ctx: ModuleContext) {
    this.ctx = ctx;
    this.db = ctx.db;
    this.automation = new SupportAutomationEngine(ctx);
    this.sla = new SlaManager(ctx);
  }

  get automationEngine(): SupportAutomationEngine {
    return this.automation;
  }

  get slaManager(): SlaManager {
    return this.sla;
  }

  async createTicket(
    params: CreateTicketInput,
    tenantId: string,
    createdById: string,
  ): Promise<SupportTicketDTO> {
    this.ctx.logger.info(`Creating new ticket: ${params.subject}`);

    return await this.db.transaction(async (tx: any) => {
      const ticketNumber = await this.generateTicketNumber(tenantId, tx);

      let assignedToId = params.assignedToId;
      if (!assignedToId && params.categoryId) {
        assignedToId = await this.autoAssignTicket(params.categoryId, tenantId, tx);
      }

      const slaProfile = await this.sla.getSlaProfileForTicket(
        { categoryId: params.categoryId, priority: params.priority },
        tenantId,
        tx,
      );

      const now = new Date();
      const firstResponseDue = slaProfile
        ? new Date(now.getTime() + slaProfile.firstResponseTime * 60000)
        : undefined;
      const resolutionDue = slaProfile
        ? new Date(now.getTime() + slaProfile.resolutionTime * 60000)
        : undefined;

      const [ticket] = await tx
        .insert(supportTickets)
        .values({
          ticketNumber,
          subject: params.subject,
          priority: params.priority || 'MEDIUM',
          categoryId: params.categoryId,
          clientId: params.clientId,
          assignedToId,
          createdById,
          tags: params.tags || [],
          customFields: params.customFields || {},
          firstResponseDue,
          resolutionDue,
          tenantId,
        })
        .returning();

      await tx.insert(ticketMessages).values({
        ticketId: ticket.id,
        content: params.content,
        messageType: 'CUSTOMER_MESSAGE',
        authorId: createdById,
        attachments: params.attachments?.map((att) => ({
          ...att,
          uploadedAt: new Date().toISOString(),
        })) || [],
        tenantId,
      });

      this.ctx.logger.info(`Ticket created: ${ticketNumber}`);

      await this.ctx.emit('support.ticket.created', {
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        tenantId,
      });

      await this.automation.processTicketEvent('ticket.created', ticket, tenantId);

      return ticket;
    });
  }

  async addMessage(
    ticketId: string,
    params: AddMessageInput,
    tenantId: string,
  ): Promise<TicketMessageDTO> {
    return await this.db.transaction(async (tx: any) => {
      const [ticket] = await tx
        .select()
        .from(supportTickets)
        .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.tenantId, tenantId)))
        .limit(1);

      if (!ticket) throw new Error('Ticket not found');

      const [message] = await tx.insert(ticketMessages).values({
        ticketId: ticket.id,
        content: params.content,
        htmlContent: params.htmlContent,
        messageType: params.messageType || 'STAFF_REPLY',
        isInternal: params.isInternal || false,
        authorId: params.authorId,
        authorEmail: params.authorEmail,
        authorName: params.authorName,
        attachments: params.attachments?.map((att) => ({
          ...att,
          uploadedAt: new Date().toISOString(),
        })) || [],
        timeSpent: params.timeSpent,
        tenantId,
      }).returning();

      const updateData: any = {
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      };

      if (params.messageType === 'STAFF_REPLY' && !ticket.firstResponseAt) {
        updateData.firstResponseAt = new Date();
      }

      await tx
        .update(supportTickets)
        .set(updateData)
        .where(eq(supportTickets.id, ticketId));

      if (params.authorId && params.messageType === 'STAFF_REPLY') {
        await this.updateAgentActivityStats(params.authorId, tenantId, tx);
      }

      await this.ctx.emit('support.ticket.replied', {
        ticketId: ticket.id,
        messageId: message.id,
        messageType: params.messageType || 'STAFF_REPLY',
      });

      await this.automation.processMessageEvent('message.added', ticket, message, tenantId);

      return message;
    });
  }

  async updateTicketStatus(
    ticketId: string,
    status: TicketStatus,
    tenantId: string,
    userId?: string,
    reason?: string,
  ): Promise<SupportTicketDTO> {
    return await this.db.transaction(async (tx: any) => {
      const [ticket] = await tx
        .select()
        .from(supportTickets)
        .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.tenantId, tenantId)))
        .limit(1);

      if (!ticket) throw new Error('Ticket not found');

      const now = new Date();
      const updateData: any = { status, lastActivityAt: now, updatedAt: now };

      if (status === 'RESOLVED' && !ticket.resolvedAt) {
        updateData.resolvedAt = now;
      }
      if (status === 'CLOSED' && !ticket.closedAt) {
        updateData.closedAt = now;
      }

      const [updatedTicket] = await tx
        .update(supportTickets)
        .set(updateData)
        .where(eq(supportTickets.id, ticketId))
        .returning();

      if (reason) {
        await tx.insert(ticketMessages).values({
          ticketId: ticket.id,
          content: `Ticket status changed to ${status}. Reason: ${reason}`,
          messageType: 'SYSTEM_MESSAGE',
          authorId: userId,
          isInternal: false,
          tenantId,
        });
      }

      if (status === 'RESOLVED') {
        await this.ctx.emit('support.ticket.resolved', {
          ticketId: ticket.id,
          resolvedAt: now,
        });
      } else if (status === 'CLOSED') {
        await this.ctx.emit('support.ticket.closed', {
          ticketId: ticket.id,
          closedAt: now,
        });
      }

      await this.automation.processTicketEvent('ticket.status.changed', updatedTicket, tenantId);

      return updatedTicket;
    });
  }

  async assignTicket(ticketId: string, tenantId: string): Promise<string | null> {
    try {
      const [ticket] = await this.db
        .select()
        .from(supportTickets)
        .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.tenantId, tenantId)))
        .limit(1);

      if (!ticket) throw new Error('Ticket not found');

      const agents = await this.db
        .select()
        .from(supportAgentProfiles)
        .where(and(
          eq(supportAgentProfiles.tenantId, tenantId),
          eq(supportAgentProfiles.isCurrentlyAvailable, true),
        ));

      if (!agents.length) {
        this.ctx.logger.warn('No available agents found');
        return null;
      }

      const scores = agents.map((agent: SupportAgentProfile) => {
        const workload = agent.currentTicketCount ? 1 / (1 + agent.currentTicketCount) : 1;
        const availability = agent.isCurrentlyAvailable ? 1 : 0;
        let categoryExp = 0;
        if (ticket.categoryId && agent.categoryExperience?.[ticket.categoryId]) {
          categoryExp = Math.min(agent.categoryExperience[ticket.categoryId] / 100, 1);
        }
        return { agentId: agent.userId, score: workload + availability + categoryExp };
      });

      scores.sort((a: any, b: any) => b.score - a.score);
      const bestMatch = scores[0];

      if (bestMatch && bestMatch.score > 0) {
        await this.db
          .update(supportTickets)
          .set({ assignedToId: bestMatch.agentId, assignedAt: new Date() })
          .where(eq(supportTickets.id, ticketId));

        await this.ctx.emit('support.ticket.assigned', {
          ticketId: ticket.id,
          agentId: bestMatch.agentId,
        });

        return bestMatch.agentId;
      }

      return null;
    } catch (error) {
      this.ctx.logger.error('Failed to assign ticket:', error);
      throw error;
    }
  }

  async getTickets(
    filters: TicketFilters = {},
    tenantId: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<PaginatedTickets> {
    const conditions: any[] = [eq(supportTickets.tenantId, tenantId)];

    if (filters.status?.length) {
      conditions.push(sql`${supportTickets.status} = ANY(${filters.status})`);
    }
    if (filters.priority?.length) {
      conditions.push(sql`${supportTickets.priority} = ANY(${filters.priority})`);
    }
    if (filters.categoryId) {
      conditions.push(eq(supportTickets.categoryId, filters.categoryId));
    }
    if (filters.assignedToId) {
      conditions.push(eq(supportTickets.assignedToId, filters.assignedToId));
    }
    if (filters.clientId) {
      conditions.push(eq(supportTickets.clientId, filters.clientId));
    }
    if (filters.createdAfter) {
      conditions.push(sql`${supportTickets.createdAt} >= ${filters.createdAfter}`);
    }
    if (filters.createdBefore) {
      conditions.push(sql`${supportTickets.createdAt} <= ${filters.createdBefore}`);
    }
    if (filters.search) {
      conditions.push(
        or(
          sql`${supportTickets.subject} ILIKE ${`%${filters.search}%`}`,
          sql`${supportTickets.ticketNumber} ILIKE ${`%${filters.search}%`}`,
        ),
      );
    }

    const tickets = await this.db
      .select()
      .from(supportTickets)
      .where(and(...conditions))
      .orderBy(desc(supportTickets.lastActivityAt))
      .limit(limit)
      .offset(offset);

    const [{ total }] = await this.db
      .select({ total: count() })
      .from(supportTickets)
      .where(and(...conditions));

    return { tickets, total, hasMore: offset + limit < total };
  }

  async getTicketWithMessages(
    ticketId: string,
    tenantId: string,
    includeInternal: boolean = false,
  ): Promise<TicketWithMessages | null> {
    const [ticket] = await this.db
      .select()
      .from(supportTickets)
      .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.tenantId, tenantId)))
      .limit(1);

    if (!ticket) return null;

    const messageConditions: any[] = [
      eq(ticketMessages.ticketId, ticketId),
      eq(ticketMessages.tenantId, tenantId),
    ];

    if (!includeInternal) {
      messageConditions.push(eq(ticketMessages.isInternal, false));
    }

    const messages = await this.db
      .select()
      .from(ticketMessages)
      .where(and(...messageConditions))
      .orderBy(asc(ticketMessages.createdAt));

    return { ticket, messages };
  }

  async getSupportStats(tenantId: string): Promise<SupportStats> {
    const [totalResult] = await this.db
      .select({ count: count() })
      .from(supportTickets)
      .where(eq(supportTickets.tenantId, tenantId));

    const [openResult] = await this.db
      .select({ count: count() })
      .from(supportTickets)
      .where(and(eq(supportTickets.tenantId, tenantId), eq(supportTickets.status, 'OPEN')));

    const [inProgressResult] = await this.db
      .select({ count: count() })
      .from(supportTickets)
      .where(and(eq(supportTickets.tenantId, tenantId), eq(supportTickets.status, 'IN_PROGRESS')));

    const avgFirstResponse = await this.db
      .select({
        avg: sql<number>`AVG(EXTRACT(EPOCH FROM (${supportTickets.firstResponseAt} - ${supportTickets.createdAt})) / 60)`,
      })
      .from(supportTickets)
      .where(and(
        eq(supportTickets.tenantId, tenantId),
        sql`${supportTickets.firstResponseAt} IS NOT NULL`,
      ));

    const avgResolution = await this.db
      .select({
        avg: sql<number>`AVG(EXTRACT(EPOCH FROM (${supportTickets.resolvedAt} - ${supportTickets.createdAt})) / 60)`,
      })
      .from(supportTickets)
      .where(and(
        eq(supportTickets.tenantId, tenantId),
        sql`${supportTickets.resolvedAt} IS NOT NULL`,
      ));

    const avgSatisfaction = await this.db
      .select({
        avg: sql<number>`AVG(${supportTickets.satisfactionRating})`,
      })
      .from(supportTickets)
      .where(and(
        eq(supportTickets.tenantId, tenantId),
        sql`${supportTickets.satisfactionRating} IS NOT NULL`,
      ));

    return {
      totalTickets: totalResult.count,
      openTickets: openResult.count,
      inProgressTickets: inProgressResult.count,
      averageFirstResponseTime: Math.round(avgFirstResponse[0]?.avg || 0),
      averageResolutionTime: Math.round(avgResolution[0]?.avg || 0),
      satisfactionScore: Number((avgSatisfaction[0]?.avg || 0).toFixed(1)),
      ticketsByPriority: {},
      ticketsByCategory: {},
    };
  }

  private async generateTicketNumber(tenantId: string, tx: any): Promise<string> {
    const currentYear = new Date().getFullYear();
    const prefix = 'TKT';
    const padLength = 6;

    let counter = await tx
      .select()
      .from(supportTicketCounters)
      .where(and(
        eq(supportTicketCounters.tenantId, tenantId),
        eq(supportTicketCounters.year, currentYear),
        eq(supportTicketCounters.prefix, prefix),
      ))
      .limit(1);

    if (counter.length === 0) {
      const [newCounter] = await tx
        .insert(supportTicketCounters)
        .values({ tenantId, year: currentYear, lastNumber: 1, prefix })
        .returning();
      counter = [newCounter];
    } else {
      const [updatedCounter] = await tx
        .update(supportTicketCounters)
        .set({ lastNumber: counter[0].lastNumber + 1, updatedAt: new Date() })
        .where(and(
          eq(supportTicketCounters.tenantId, tenantId),
          eq(supportTicketCounters.year, currentYear),
          eq(supportTicketCounters.prefix, prefix),
        ))
        .returning();
      counter = [updatedCounter];
    }

    const paddedNumber = counter[0].lastNumber.toString().padStart(padLength, '0');
    return `${prefix}-${currentYear}-${paddedNumber}`;
  }

  private async autoAssignTicket(
    categoryId: string,
    tenantId: string,
    tx: any,
  ): Promise<string | undefined> {
    const [category] = await tx
      .select()
      .from(supportCategories)
      .where(and(eq(supportCategories.id, categoryId), eq(supportCategories.tenantId, tenantId)))
      .limit(1);

    if (!category) return undefined;

    if (category.defaultAssigneeId) {
      const canAssign = await this.canAssignToAgent(category.defaultAssigneeId, tenantId, tx);
      if (canAssign) return category.defaultAssigneeId;
    }

    return undefined;
  }

  private async canAssignToAgent(agentId: string, tenantId: string, tx: any): Promise<boolean> {
    const [profile] = await tx
      .select()
      .from(supportAgentProfiles)
      .where(and(
        eq(supportAgentProfiles.userId, agentId),
        eq(supportAgentProfiles.tenantId, tenantId),
        eq(supportAgentProfiles.isActive, true),
        eq(supportAgentProfiles.isCurrentlyAvailable, true),
      ))
      .limit(1);

    if (!profile) return false;
    return profile.currentTickets < profile.maxTickets;
  }

  private async updateAgentActivityStats(agentId: string, tenantId: string, tx: any): Promise<void> {
    await tx
      .update(supportAgentProfiles)
      .set({ lastActiveAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(supportAgentProfiles.userId, agentId),
        eq(supportAgentProfiles.tenantId, tenantId),
      ));
  }
}
