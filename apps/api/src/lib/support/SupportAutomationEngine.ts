import { db } from '../../db';
import { eq, and, lt, sql } from 'drizzle-orm';
import { 
  supportAutomationRules, 
  supportTickets, 
  ticketMessages,
  supportAgentProfiles,
  SupportTicket,
  TicketMessage,
  SupportAutomationRule
} from '../../db/schema';

interface AutomationCondition {
  field: string;
  operator: string;
  value: any;
}

interface AutomationAction {
  type: string;
  parameters: Record<string, any>;
}

export class SupportAutomationEngine {
  private static instance: SupportAutomationEngine;

  private constructor() {}

  static getInstance(): SupportAutomationEngine {
    if (!SupportAutomationEngine.instance) {
      SupportAutomationEngine.instance = new SupportAutomationEngine();
    }
    return SupportAutomationEngine.instance;
  }

  /**
   * Process ticket event and execute matching automation rules
   */
  async processTicketEvent(
    eventType: string,
    ticket: SupportTicket,
    tenantId: string
  ): Promise<void> {
    console.log(`🤖 Processing automation for ticket event: ${eventType} - ${ticket.ticketNumber}`);

    try {
      // Get active automation rules for this event type
      const rules = await db
        .select()
        .from(supportAutomationRules)
        .where(and(
          eq(supportAutomationRules.tenantId, tenantId),
          eq(supportAutomationRules.isActive, true),
          eq(supportAutomationRules.triggerEvent, eventType)
        ))
        .orderBy(supportAutomationRules.priority);

      for (const rule of rules) {
        // Check if rule conditions are met
        if (await this.evaluateConditions(rule.conditions, ticket, tenantId)) {
          // Check execution limits
          if (rule.maxExecutions && rule.executionCount >= rule.maxExecutions) {
            console.log(`⏭️ Skipping rule ${rule.name} - execution limit reached`);
            continue;
          }

          console.log(`✅ Executing automation rule: ${rule.name}`);
          
          // Execute actions
          await this.executeActions(rule.actions, ticket, tenantId);
          
          // Update execution count
          await db
            .update(supportAutomationRules)
            .set({
              executionCount: rule.executionCount + 1,
              updatedAt: new Date(),
            })
            .where(eq(supportAutomationRules.id, rule.id));
        }
      }
    } catch (error) {
      console.error(`❌ Automation processing failed for ${ticket.ticketNumber}:`, error);
    }
  }

  /**
   * Process message event and execute matching automation rules
   */
  async processMessageEvent(
    eventType: string,
    ticket: SupportTicket,
    message: TicketMessage,
    tenantId: string
  ): Promise<void> {
    console.log(`🤖 Processing automation for message event: ${eventType} - ${ticket.ticketNumber}`);

    try {
      const rules = await db
        .select()
        .from(supportAutomationRules)
        .where(and(
          eq(supportAutomationRules.tenantId, tenantId),
          eq(supportAutomationRules.isActive, true),
          eq(supportAutomationRules.triggerEvent, eventType)
        ))
        .orderBy(supportAutomationRules.priority);

      for (const rule of rules) {
        // Check conditions (can access both ticket and message)
        if (await this.evaluateMessageConditions(rule.conditions, ticket, message, tenantId)) {
          if (rule.maxExecutions && rule.executionCount >= rule.maxExecutions) {
            continue;
          }

          console.log(`✅ Executing automation rule: ${rule.name}`);
          
          await this.executeActions(rule.actions, ticket, tenantId, message);
          
          await db
            .update(supportAutomationRules)
            .set({
              executionCount: rule.executionCount + 1,
              updatedAt: new Date(),
            })
            .where(eq(supportAutomationRules.id, rule.id));
        }
      }
    } catch (error) {
      console.error(`❌ Message automation processing failed:`, error);
    }
  }

  /**
   * Create a new automation rule
   */
  async createAutomationRule(
    ruleData: {
      name: string;
      description?: string;
      triggerEvent: string;
      conditions: AutomationCondition[];
      actions: AutomationAction[];
      priority?: number;
      maxExecutions?: number;
    },
    tenantId: string
  ): Promise<SupportAutomationRule> {
    const [rule] = await db
      .insert(supportAutomationRules)
      .values({
        ...ruleData,
        tenantId,
      })
      .returning();

    console.log(`📋 Created automation rule: ${rule.name}`);
    return rule;
  }

  /**
   * Get all automation rules for a tenant
   */
  async getAutomationRules(tenantId: string): Promise<SupportAutomationRule[]> {
    return await db
      .select()
      .from(supportAutomationRules)
      .where(eq(supportAutomationRules.tenantId, tenantId))
      .orderBy(supportAutomationRules.priority);
  }

  /**
   * Check for overdue tickets that need escalation
   */
  async processEscalations(tenantId: string): Promise<void> {
    console.log(`🚨 Processing ticket escalations for tenant: ${tenantId}`);

    try {
      // Find tickets that are overdue for first response
      const overdueFirstResponse = await db
        .select()
        .from(supportTickets)
        .where(and(
          eq(supportTickets.tenantId, tenantId),
          sql`${supportTickets.status} IN ('OPEN', 'IN_PROGRESS')`,
          sql`${supportTickets.firstResponseDue} < NOW()`,
          sql`${supportTickets.firstResponseAt} IS NULL`
        ));

      for (const ticket of overdueFirstResponse) {
        await this.escalateTicket(ticket, 'first_response_overdue', tenantId);
      }

      // Find tickets that are overdue for resolution
      const overdueResolution = await db
        .select()
        .from(supportTickets)
        .where(and(
          eq(supportTickets.tenantId, tenantId),
          sql`${supportTickets.status} NOT IN ('RESOLVED', 'CLOSED')`,
          sql`${supportTickets.resolutionDue} < NOW()`,
          sql`${supportTickets.resolvedAt} IS NULL`
        ));

      for (const ticket of overdueResolution) {
        await this.escalateTicket(ticket, 'resolution_overdue', tenantId);
      }

    } catch (error) {
      console.error(`❌ Escalation processing failed:`, error);
    }
  }

  /**
   * Process auto-responses for common scenarios
   */
  async processAutoResponses(tenantId: string): Promise<void> {
    console.log(`🤖 Processing auto-responses for tenant: ${tenantId}`);

    // This could include:
    // - Out of office responses
    // - Acknowledgment messages
    // - FAQ responses based on keywords
    // - Business hours notifications

    // Implementation would go here based on specific requirements
  }

  // Private helper methods

  private async evaluateConditions(
    conditions: AutomationCondition[],
    ticket: SupportTicket,
    tenantId: string
  ): Promise<boolean> {
    for (const condition of conditions) {
      if (!await this.evaluateCondition(condition, ticket, tenantId)) {
        return false; // All conditions must be true
      }
    }
    return true;
  }

  private async evaluateMessageConditions(
    conditions: AutomationCondition[],
    ticket: SupportTicket,
    message: TicketMessage,
    tenantId: string
  ): Promise<boolean> {
    for (const condition of conditions) {
      if (!await this.evaluateMessageCondition(condition, ticket, message, tenantId)) {
        return false;
      }
    }
    return true;
  }

  private async evaluateCondition(
    condition: AutomationCondition,
    ticket: SupportTicket,
    tenantId: string
  ): Promise<boolean> {
    const { field, operator, value } = condition;
    
    let fieldValue: any;
    
    // Get field value from ticket
    switch (field) {
      case 'status':
        fieldValue = ticket.status;
        break;
      case 'priority':
        fieldValue = ticket.priority;
        break;
      case 'categoryId':
        fieldValue = ticket.categoryId;
        break;
      case 'assignedToId':
        fieldValue = ticket.assignedToId;
        break;
      case 'tags':
        fieldValue = ticket.tags;
        break;
      case 'escalationLevel':
        fieldValue = ticket.escalationLevel;
        break;
      case 'minutesSinceCreated':
        fieldValue = Math.floor((Date.now() - new Date(ticket.createdAt).getTime()) / 60000);
        break;
      case 'minutesSinceLastActivity':
        fieldValue = Math.floor((Date.now() - new Date(ticket.lastActivityAt).getTime()) / 60000);
        break;
      default:
        // Check custom fields
        fieldValue = ticket.customFields?.[field];
        break;
    }

    // Evaluate condition based on operator
    switch (operator) {
      case 'equals':
        return fieldValue === value;
      case 'not_equals':
        return fieldValue !== value;
      case 'contains':
        return Array.isArray(fieldValue) 
          ? fieldValue.includes(value)
          : String(fieldValue).includes(value);
      case 'not_contains':
        return Array.isArray(fieldValue) 
          ? !fieldValue.includes(value)
          : !String(fieldValue).includes(value);
      case 'greater_than':
        return Number(fieldValue) > Number(value);
      case 'less_than':
        return Number(fieldValue) < Number(value);
      case 'is_empty':
        return !fieldValue || (Array.isArray(fieldValue) && fieldValue.length === 0);
      case 'is_not_empty':
        return fieldValue && (!Array.isArray(fieldValue) || fieldValue.length > 0);
      default:
        console.warn(`Unknown condition operator: ${operator}`);
        return false;
    }
  }

  private async evaluateMessageCondition(
    condition: AutomationCondition,
    ticket: SupportTicket,
    message: TicketMessage,
    tenantId: string
  ): Promise<boolean> {
    const { field, operator, value } = condition;
    
    let fieldValue: any;
    
    // Get field value from message or ticket
    if (field.startsWith('message.')) {
      const messageField = field.substring(8); // Remove 'message.' prefix
      switch (messageField) {
        case 'content':
          fieldValue = message.content;
          break;
        case 'messageType':
          fieldValue = message.messageType;
          break;
        case 'isInternal':
          fieldValue = message.isInternal;
          break;
        case 'authorId':
          fieldValue = message.authorId;
          break;
        default:
          fieldValue = undefined;
          break;
      }
    } else {
      // Fall back to ticket condition evaluation
      return await this.evaluateCondition(condition, ticket, tenantId);
    }

    // Same operator logic as ticket conditions
    switch (operator) {
      case 'equals':
        return fieldValue === value;
      case 'contains':
        return String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
      case 'not_contains':
        return !String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
      default:
        return false;
    }
  }

  private async executeActions(
    actions: AutomationAction[],
    ticket: SupportTicket,
    tenantId: string,
    message?: TicketMessage
  ): Promise<void> {
    for (const action of actions) {
      try {
        await this.executeAction(action, ticket, tenantId, message);
      } catch (error) {
        console.error(`❌ Failed to execute action ${action.type}:`, error);
      }
    }
  }

  private async executeAction(
    action: AutomationAction,
    ticket: SupportTicket,
    tenantId: string,
    message?: TicketMessage
  ): Promise<void> {
    const { type, parameters } = action;

    switch (type) {
      case 'assign_ticket':
        await this.assignTicketAction(ticket.id, parameters.assignedToId, tenantId);
        break;

      case 'change_status':
        await this.changeStatusAction(ticket.id, parameters.status, tenantId);
        break;

      case 'change_priority':
        await this.changePriorityAction(ticket.id, parameters.priority, tenantId);
        break;

      case 'add_tags':
        await this.addTagsAction(ticket.id, parameters.tags, tenantId);
        break;

      case 'add_internal_note':
        await this.addInternalNoteAction(ticket.id, parameters.content, tenantId);
        break;

      case 'send_auto_response':
        await this.sendAutoResponseAction(ticket.id, parameters.template, tenantId);
        break;

      case 'escalate_ticket':
        await this.escalateTicketAction(ticket, parameters.level || 1, tenantId);
        break;

      case 'notify_users':
        await this.notifyUsersAction(ticket, parameters.userIds, parameters.message, tenantId);
        break;

      default:
        console.warn(`Unknown automation action: ${type}`);
        break;
    }
  }

  // Action implementations

  private async assignTicketAction(ticketId: string, assignedToId: string, tenantId: string): Promise<void> {
    await db
      .update(supportTickets)
      .set({
        assignedToId,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(supportTickets.id, ticketId),
        eq(supportTickets.tenantId, tenantId)
      ));

    // Add system message
    await db
      .insert(ticketMessages)
      .values({
        ticketId,
        content: 'Ticket automatically assigned by automation rule',
        messageType: 'SYSTEM_MESSAGE',
        isInternal: true,
        tenantId,
      });
  }

  private async changeStatusAction(ticketId: string, status: string, tenantId: string): Promise<void> {
    await db
      .update(supportTickets)
      .set({
        status: status as any,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(supportTickets.id, ticketId),
        eq(supportTickets.tenantId, tenantId)
      ));
  }

  private async changePriorityAction(ticketId: string, priority: string, tenantId: string): Promise<void> {
    await db
      .update(supportTickets)
      .set({
        priority: priority as any,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(supportTickets.id, ticketId),
        eq(supportTickets.tenantId, tenantId)
      ));
  }

  private async addTagsAction(ticketId: string, newTags: string[], tenantId: string): Promise<void> {
    // Get current tags and merge with new ones
    const [ticket] = await db
      .select({ tags: supportTickets.tags })
      .from(supportTickets)
      .where(and(
        eq(supportTickets.id, ticketId),
        eq(supportTickets.tenantId, tenantId)
      ))
      .limit(1);

    if (ticket) {
      const currentTags = ticket.tags || [];
      const mergedTags = [...new Set([...currentTags, ...newTags])];

      await db
        .update(supportTickets)
        .set({
          tags: mergedTags,
          updatedAt: new Date(),
        })
        .where(and(
          eq(supportTickets.id, ticketId),
          eq(supportTickets.tenantId, tenantId)
        ));
    }
  }

  private async addInternalNoteAction(ticketId: string, content: string, tenantId: string): Promise<void> {
    await db
      .insert(ticketMessages)
      .values({
        ticketId,
        content,
        messageType: 'INTERNAL_NOTE',
        isInternal: true,
        tenantId,
      });
  }

  private async sendAutoResponseAction(ticketId: string, template: string, tenantId: string): Promise<void> {
    // Get predefined response template
    const responseContent = this.getAutoResponseTemplate(template);
    
    await db
      .insert(ticketMessages)
      .values({
        ticketId,
        content: responseContent,
        messageType: 'AUTO_RESPONSE',
        isInternal: false,
        tenantId,
      });
  }

  private async escalateTicket(ticket: SupportTicket, reason: string, tenantId: string): Promise<void> {
    const newEscalationLevel = (ticket.escalationLevel || 0) + 1;

    await db
      .update(supportTickets)
      .set({
        escalationLevel: newEscalationLevel,
        priority: ticket.priority === 'LOW' ? 'MEDIUM' : 
                 ticket.priority === 'MEDIUM' ? 'HIGH' : 'URGENT',
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(supportTickets.id, ticket.id),
        eq(supportTickets.tenantId, tenantId)
      ));

    // Add escalation note
    await db
      .insert(ticketMessages)
      .values({
        ticketId: ticket.id,
        content: `Ticket escalated to level ${newEscalationLevel}. Reason: ${reason}`,
        messageType: 'SYSTEM_MESSAGE',
        isInternal: true,
        tenantId,
      });

    console.log(`🚨 Ticket ${ticket.ticketNumber} escalated to level ${newEscalationLevel}`);
  }

  private async escalateTicketAction(ticket: SupportTicket, level: number, tenantId: string): Promise<void> {
    await this.escalateTicket(ticket, 'Automation rule triggered', tenantId);
  }

  private async notifyUsersAction(
    ticket: SupportTicket,
    userIds: string[],
    message: string,
    tenantId: string
  ): Promise<void> {
    // Implementation would send notifications to specified users
    console.log(`📢 Notifying users ${userIds.join(', ')} about ticket ${ticket.ticketNumber}: ${message}`);
  }

  private getAutoResponseTemplate(template: string): string {
    const templates: Record<string, string> = {
      'acknowledgment': 'Thank you for contacting our support team. We have received your ticket and will respond as soon as possible.',
      'business_hours': 'Thank you for your message. Our support team is currently outside of business hours. We will respond to your inquiry during our next business day.',
      'password_reset': 'We have received your password reset request. Please check your email for instructions on how to reset your password.',
      'billing_inquiry': 'Thank you for your billing inquiry. Our billing team will review your account and respond within 24 hours.',
    };

    return templates[template] || 'Thank you for contacting support. We will respond to your inquiry as soon as possible.';
  }
} 