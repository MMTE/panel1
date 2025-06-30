import { db } from '../../db';
import { eq, and, or, desc, asc, count, sql, isNull } from 'drizzle-orm';
import { 
  supportTickets, 
  ticketMessages, 
  supportCategories,
  supportAgentProfiles,
  supportSlaProfiles,
  NewSupportTicket,
  NewTicketMessage,
  SupportTicket,
  TicketMessage,
  SupportCategory,
  SupportAgentProfile
} from '../../db/schema';
import { TicketNumberService } from './TicketNumberService';
import { SupportEmailService } from './SupportEmailService';
import { SupportAutomationEngine } from './SupportAutomationEngine';
import { SlaManager } from './SlaManager';

export interface CreateTicketParams {
  subject: string;
  content: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
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

export interface AddMessageParams {
  content: string;
  htmlContent?: string;
  messageType?: 'CUSTOMER_MESSAGE' | 'STAFF_REPLY' | 'INTERNAL_NOTE' | 'SYSTEM_MESSAGE' | 'AUTO_RESPONSE';
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
  timeSpent?: number; // Minutes
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

interface TicketAssignmentScore {
  agentId: string;
  score: number;
  factors: {
    skillMatch: number;
    workload: number;
    availability: number;
    categoryExperience: number;
  };
}

export class SupportService {
  private static instance: SupportService;
  private emailService: SupportEmailService;
  private automationEngine: SupportAutomationEngine;
  private slaManager: SlaManager;

  private constructor() {
    this.emailService = SupportEmailService.getInstance();
    this.automationEngine = SupportAutomationEngine.getInstance();
    this.slaManager = SlaManager.getInstance();
  }

  static getInstance(): SupportService {
    if (!SupportService.instance) {
      SupportService.instance = new SupportService();
    }
    return SupportService.instance;
  }

  /**
   * Create a new support ticket
   */
  async createTicket(
    params: CreateTicketParams,
    tenantId: string,
    createdById: string
  ): Promise<SupportTicket> {
    console.log(`🎫 Creating new ticket: ${params.subject}`);

    return await db.transaction(async (tx) => {
      // Generate ticket number
      const ticketNumber = await TicketNumberService.generateTicketNumber(tenantId);

      // Auto-assign if no assignee specified
      let assignedToId = params.assignedToId;
      if (!assignedToId && params.categoryId) {
        assignedToId = await this.autoAssignTicket(params.categoryId, tenantId, tx);
      }

      // Get SLA profile for due dates
      const slaProfile = await this.slaManager.getSlaProfileForTicket(
        { categoryId: params.categoryId, priority: params.priority },
        tenantId,
        tx
      );

      const now = new Date();
      const firstResponseDue = slaProfile 
        ? new Date(now.getTime() + slaProfile.firstResponseTime * 60000)
        : undefined;
      const resolutionDue = slaProfile
        ? new Date(now.getTime() + slaProfile.resolutionTime * 60000)
        : undefined;

      // Create ticket
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

      // Create initial message
      await tx
        .insert(ticketMessages)
        .values({
          ticketId: ticket.id,
          content: params.content,
          messageType: 'CUSTOMER_MESSAGE',
          authorId: createdById,
          attachments: params.attachments?.map(att => ({
            ...att,
            uploadedAt: new Date().toISOString()
          })) || [],
          tenantId,
        });

      console.log(`✅ Ticket created: ${ticketNumber}`);

      // Trigger automation and notifications
      await this.handleTicketCreated(ticket, tenantId);

      return ticket;
    });
  }

  /**
   * Add a message to a ticket
   */
  async addMessage(
    ticketId: string,
    params: AddMessageParams,
    tenantId: string
  ): Promise<TicketMessage> {
    return await db.transaction(async (tx) => {
      // Get ticket
      const [ticket] = await tx
        .select()
        .from(supportTickets)
        .where(and(
          eq(supportTickets.id, ticketId),
          eq(supportTickets.tenantId, tenantId)
        ))
        .limit(1);

      if (!ticket) {
        throw new Error('Ticket not found');
      }

      // Create message
      const [message] = await tx
        .insert(ticketMessages)
        .values({
          ticketId: ticket.id,
          content: params.content,
          htmlContent: params.htmlContent,
          messageType: params.messageType || 'STAFF_REPLY',
          isInternal: params.isInternal || false,
          authorId: params.authorId,
          authorEmail: params.authorEmail,
          authorName: params.authorName,
          attachments: params.attachments?.map(att => ({
            ...att,
            uploadedAt: new Date().toISOString()
          })) || [],
          timeSpent: params.timeSpent,
          tenantId,
        })
        .returning();

      // Update ticket activity
      await tx
        .update(supportTickets)
        .set({
          lastActivityAt: new Date(),
          // Set first response time if this is first staff reply
          ...(params.messageType === 'STAFF_REPLY' && !ticket.firstResponseAt 
            ? { firstResponseAt: new Date() }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(supportTickets.id, ticketId));

      // Update agent ticket count if staff reply
      if (params.authorId && params.messageType === 'STAFF_REPLY') {
        await this.updateAgentActivityStats(params.authorId, tenantId, tx);
      }

      // Trigger automation and notifications
      await this.handleMessageAdded(ticket, message, tenantId);

      return message;
    });
  }

  /**
   * Update ticket status
   */
  async updateTicketStatus(
    ticketId: string,
    status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'WAITING_STAFF' | 'RESOLVED' | 'CLOSED',
    tenantId: string,
    userId?: string,
    reason?: string
  ): Promise<SupportTicket> {
    return await db.transaction(async (tx) => {
      const [ticket] = await tx
        .select()
        .from(supportTickets)
        .where(and(
          eq(supportTickets.id, ticketId),
          eq(supportTickets.tenantId, tenantId)
        ))
        .limit(1);

      if (!ticket) {
        throw new Error('Ticket not found');
      }

      const now = new Date();
      const updateData: Partial<SupportTicket> = {
        status,
        lastActivityAt: now,
        updatedAt: now,
      };

      // Set resolution/close timestamps
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

      // Add system message for status change
      if (reason) {
        await tx
          .insert(ticketMessages)
          .values({
            ticketId: ticket.id,
            content: `Ticket status changed to ${status}. Reason: ${reason}`,
            messageType: 'SYSTEM_MESSAGE',
            authorId: userId,
            isInternal: false,
            tenantId,
          });
      }

      // Trigger automation and notifications
      await this.handleTicketStatusChanged(updatedTicket, ticket.status, tenantId);

      return updatedTicket;
    });
  }

  /**
   * Intelligently assign a ticket to the most suitable agent
   */
  async assignTicket(ticketId: string, tenantId: string): Promise<string | null> {
    try {
      // Get ticket details
      const [ticket] = await db
        .select()
        .from(supportTickets)
        .where(and(
          eq(supportTickets.id, ticketId),
          eq(supportTickets.tenantId, tenantId)
        ))
        .limit(1);

      if (!ticket) {
        throw new Error('Ticket not found');
      }

      // Get all available agents
      const agents = await db
        .select()
        .from(supportAgentProfiles)
        .where(and(
          eq(supportAgentProfiles.tenantId, tenantId),
          eq(supportAgentProfiles.isCurrentlyAvailable, true)
        ));

      if (!agents.length) {
        console.warn('No available agents found');
        return null;
      }

      // Calculate assignment scores for each agent
      const scores: TicketAssignmentScore[] = await Promise.all(
        agents.map(async (agent) => {
          const score = await this.calculateAgentScore(agent, ticket);
          return {
            agentId: agent.userId,
            score: score.total,
            factors: score.factors
          };
        })
      );

      // Sort by score and get the best match
      scores.sort((a, b) => b.score - a.score);
      const bestMatch = scores[0];

      if (bestMatch && bestMatch.score > 0) {
        // Assign ticket to the best matching agent
        await db
          .update(supportTickets)
          .set({ 
            assignedToId: bestMatch.agentId,
            assignedAt: new Date()
          })
          .where(eq(supportTickets.id, ticketId));

        return bestMatch.agentId;
      }

      return null;
    } catch (error) {
      console.error('Failed to assign ticket:', error);
      throw error;
    }
  }

  /**
   * Calculate an agent's suitability score for a ticket
   */
  private async calculateAgentScore(
    agent: SupportAgentProfile,
    ticket: SupportTicket
  ): Promise<{ 
    total: number;
    factors: {
      skillMatch: number;
      workload: number;
      availability: number;
      categoryExperience: number;
    }
  }> {
    const factors = {
      skillMatch: 0,
      workload: 0,
      availability: 0,
      categoryExperience: 0
    };

    // Calculate workload score based on current ticket count
    factors.workload = agent.currentTicketCount ? 1 / (1 + agent.currentTicketCount) : 1;

    // Calculate availability score
    factors.availability = agent.isCurrentlyAvailable ? 1 : 0;

    // Calculate category experience score
    if (ticket.categoryId && agent.categoryExperience?.[ticket.categoryId]) {
      factors.categoryExperience = Math.min(agent.categoryExperience[ticket.categoryId] / 100, 1);
    }

    // Calculate total score
    const total = Object.values(factors).reduce((sum, score) => sum + score, 0);

    return {
      total,
      factors
    };
  }

  /**
   * Get tickets with filters and pagination
   */
  async getTickets(
    filters: TicketFilters = {},
    tenantId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<{
    tickets: SupportTicket[];
    total: number;
    hasMore: boolean;
  }> {
    const conditions = [eq(supportTickets.tenantId, tenantId)];

    // Apply filters
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
          sql`${supportTickets.ticketNumber} ILIKE ${`%${filters.search}%`}`
        )
      );
    }

    // Get tickets
    const tickets = await db
      .select()
      .from(supportTickets)
      .where(and(...conditions))
      .orderBy(desc(supportTickets.lastActivityAt))
      .limit(limit)
      .offset(offset);

    // Get total count
    const [{ total }] = await db
      .select({ total: count() })
      .from(supportTickets)
      .where(and(...conditions));

    return {
      tickets,
      total,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Get ticket by ID with messages
   */
  async getTicketWithMessages(
    ticketId: string,
    tenantId: string,
    includeInternal: boolean = false
  ): Promise<{
    ticket: SupportTicket;
    messages: TicketMessage[];
  } | null> {
    const [ticket] = await db
      .select()
      .from(supportTickets)
      .where(and(
        eq(supportTickets.id, ticketId),
        eq(supportTickets.tenantId, tenantId)
      ))
      .limit(1);

    if (!ticket) {
      return null;
    }

    const messageConditions = [
      eq(ticketMessages.ticketId, ticketId),
      eq(ticketMessages.tenantId, tenantId)
    ];

    if (!includeInternal) {
      messageConditions.push(eq(ticketMessages.isInternal, false));
    }

    const messages = await db
      .select()
      .from(ticketMessages)
      .where(and(...messageConditions))
      .orderBy(asc(ticketMessages.createdAt));

    return { ticket, messages };
  }

  /**
   * Get support statistics for dashboard
   */
  async getSupportStats(tenantId: string): Promise<{
    totalTickets: number;
    openTickets: number;
    inProgressTickets: number;
    averageFirstResponseTime: number; // minutes
    averageResolutionTime: number; // minutes
    satisfactionScore: number; // 1-5
    ticketsByPriority: Record<string, number>;
    ticketsByCategory: Record<string, number>;
  }> {
    // Get basic counts
    const [totalResult] = await db
      .select({ count: count() })
      .from(supportTickets)
      .where(eq(supportTickets.tenantId, tenantId));

    const [openResult] = await db
      .select({ count: count() })
      .from(supportTickets)
      .where(and(
        eq(supportTickets.tenantId, tenantId),
        eq(supportTickets.status, 'OPEN')
      ));

    const [inProgressResult] = await db
      .select({ count: count() })
      .from(supportTickets)
      .where(and(
        eq(supportTickets.tenantId, tenantId),
        eq(supportTickets.status, 'IN_PROGRESS')
      ));

    // Calculate averages (simplified for now)
    const avgFirstResponse = await db
      .select({
        avg: sql<number>`AVG(EXTRACT(EPOCH FROM (${supportTickets.firstResponseAt} - ${supportTickets.createdAt})) / 60)`
      })
      .from(supportTickets)
      .where(and(
        eq(supportTickets.tenantId, tenantId),
        sql`${supportTickets.firstResponseAt} IS NOT NULL`
      ));

    const avgResolution = await db
      .select({
        avg: sql<number>`AVG(EXTRACT(EPOCH FROM (${supportTickets.resolvedAt} - ${supportTickets.createdAt})) / 60)`
      })
      .from(supportTickets)
      .where(and(
        eq(supportTickets.tenantId, tenantId),
        sql`${supportTickets.resolvedAt} IS NOT NULL`
      ));

    const avgSatisfaction = await db
      .select({
        avg: sql<number>`AVG(${supportTickets.satisfactionRating})`
      })
      .from(supportTickets)
      .where(and(
        eq(supportTickets.tenantId, tenantId),
        sql`${supportTickets.satisfactionRating} IS NOT NULL`
      ));

    return {
      totalTickets: totalResult.count,
      openTickets: openResult.count,
      inProgressTickets: inProgressResult.count,
      averageFirstResponseTime: Math.round(avgFirstResponse[0]?.avg || 0),
      averageResolutionTime: Math.round(avgResolution[0]?.avg || 0),
      satisfactionScore: Number((avgSatisfaction[0]?.avg || 0).toFixed(1)),
      ticketsByPriority: {}, // TODO: Implement grouping
      ticketsByCategory: {}, // TODO: Implement grouping
    };
  }

  // Private helper methods

  private async autoAssignTicket(
    categoryId: string,
    tenantId: string,
    tx = db
  ): Promise<string | undefined> {
    // Get category with auto-assignment rules
    const [category] = await tx
      .select()
      .from(supportCategories)
      .where(and(
        eq(supportCategories.id, categoryId),
        eq(supportCategories.tenantId, tenantId)
      ))
      .limit(1);

    if (!category) return undefined;

    // Try default assignee first
    if (category.defaultAssigneeId) {
      const canAssign = await this.canAssignToAgent(category.defaultAssigneeId, tenantId, tx);
      if (canAssign) {
        return category.defaultAssigneeId;
      }
    }

    // TODO: Implement intelligent assignment based on workload, skills, etc.
    return undefined;
  }

  private async canAssignToAgent(
    agentId: string,
    tenantId: string,
    tx = db
  ): Promise<boolean> {
    const [profile] = await tx
      .select()
      .from(supportAgentProfiles)
      .where(and(
        eq(supportAgentProfiles.userId, agentId),
        eq(supportAgentProfiles.tenantId, tenantId),
        eq(supportAgentProfiles.isActive, true),
        eq(supportAgentProfiles.isCurrentlyAvailable, true)
      ))
      .limit(1);

    if (!profile) return false;

    return profile.currentTickets < profile.maxTickets;
  }

  private async updateAgentTicketCounts(
    agentId: string,
    tenantId: string,
    tx = db
  ): Promise<void> {
    // Count current open tickets for agent
    const [result] = await tx
      .select({ count: count() })
      .from(supportTickets)
      .where(and(
        eq(supportTickets.assignedToId, agentId),
        eq(supportTickets.tenantId, tenantId),
        sql`${supportTickets.status} NOT IN ('RESOLVED', 'CLOSED')`
      ));

    // Update agent profile
    await tx
      .update(supportAgentProfiles)
      .set({
        currentTickets: result.count,
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(supportAgentProfiles.userId, agentId),
        eq(supportAgentProfiles.tenantId, tenantId)
      ));
  }

  private async updateAgentActivityStats(
    agentId: string,
    tenantId: string,
    tx = db
  ): Promise<void> {
    // Update last active time
    await tx
      .update(supportAgentProfiles)
      .set({
        lastActiveAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(supportAgentProfiles.userId, agentId),
        eq(supportAgentProfiles.tenantId, tenantId)
      ));
  }

  // Event handlers for automation and notifications

  private async handleTicketCreated(ticket: SupportTicket, tenantId: string): Promise<void> {
    // Email notifications
    await this.emailService.sendTicketCreatedNotification(ticket, tenantId);

    // Trigger automation rules
    await this.automationEngine.processTicketEvent('ticket.created', ticket, tenantId);

    // Plugin hooks (will be implemented)
    // await this.executePluginHook('ticket.created', { ticket, tenantId });
  }

  private async handleMessageAdded(
    ticket: SupportTicket,
    message: TicketMessage,
    tenantId: string
  ): Promise<void> {
    // Email notifications
    await this.emailService.sendMessageNotification(ticket, message, tenantId);

    // Trigger automation rules
    await this.automationEngine.processMessageEvent('message.added', ticket, message, tenantId);

    // Plugin hooks
    // await this.executePluginHook('ticket.message.added', { ticket, message, tenantId });
  }

  private async handleTicketStatusChanged(
    ticket: SupportTicket,
    oldStatus: string,
    tenantId: string
  ): Promise<void> {
    // Email notifications
    await this.emailService.sendStatusChangeNotification(ticket, oldStatus, tenantId);

    // Trigger automation rules
    await this.automationEngine.processTicketEvent('ticket.status.changed', ticket, tenantId);

    // Plugin hooks
    // await this.executePluginHook('ticket.status.changed', { ticket, oldStatus, tenantId });
  }

  /**
   * Group tickets by priority and category
   */
  async groupTickets(tenantId: string): Promise<void> {
    try {
      // Get all ungrouped tickets
      const ungroupedTickets = await db
        .select()
        .from(supportTickets)
        .where(and(
          eq(supportTickets.tenantId, tenantId),
          eq(supportTickets.status, 'OPEN'),
          isNull(supportTickets.groupId)
        ));

      // Group by priority and category
      const groups = new Map<string, SupportTicket[]>();
      
      for (const ticket of ungroupedTickets) {
        const key = `${ticket.priority}-${ticket.categoryId}`;
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(ticket);
      }

      // Create or update ticket groups
      for (const [key, tickets] of groups.entries()) {
        const [priority, categoryId] = key.split('-');
        
        if (tickets.length >= 2) { // Only create groups with 2+ tickets
          // Create new group
          const [group] = await db
            .insert(supportTicketGroups)
            .values({
              name: `${priority} ${categoryId} Group`,
              priority: priority as any,
              categoryId,
              tenantId,
              ticketCount: tickets.length,
              createdAt: new Date(),
              updatedAt: new Date()
            })
            .returning();

          // Update tickets with group ID
          await db
            .update(supportTickets)
            .set({ 
              groupId: group.id,
              updatedAt: new Date()
            })
            .where(
              and(
                eq(supportTickets.tenantId, tenantId),
                sql`id = ANY(${tickets.map(t => t.id)})`
              )
            );
        }
      }
    } catch (error) {
      console.error('Failed to group tickets:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const supportService = SupportService.getInstance(); 