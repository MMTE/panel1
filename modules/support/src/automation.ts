import type { ModuleContext } from '@panel1/types';
import { eq, and, sql } from 'drizzle-orm';
import {
  supportAutomationRules,
  supportTickets,
  ticketMessages,
} from './schema.js';
import type { SupportTicket, TicketMessage, SupportAutomationRule } from './schema.js';

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
  private db: any;
  private ctx: ModuleContext;

  constructor(ctx: ModuleContext) {
    this.ctx = ctx;
    this.db = ctx.db;
  }

  async processTicketEvent(
    eventType: string,
    ticket: SupportTicket,
    tenantId: string,
  ): Promise<void> {
    this.ctx.logger.info(`Processing automation for ticket event: ${eventType} - ${ticket.ticketNumber}`);

    try {
      const rules = await this.db
        .select()
        .from(supportAutomationRules)
        .where(and(
          eq(supportAutomationRules.tenantId, tenantId),
          eq(supportAutomationRules.isActive, true),
          eq(supportAutomationRules.triggerEvent, eventType),
        ))
        .orderBy(supportAutomationRules.priority);

      for (const rule of rules) {
        if (this.evaluateConditions(rule.conditions as AutomationCondition[], ticket)) {
          if (rule.maxExecutions && (rule.executionCount ?? 0) >= rule.maxExecutions) {
            this.ctx.logger.debug(`Skipping rule ${rule.name} - execution limit reached`);
            continue;
          }

          this.ctx.logger.info(`Executing automation rule: ${rule.name}`);
          await this.executeActions(rule.actions as AutomationAction[], ticket, tenantId);

          await this.db
            .update(supportAutomationRules)
            .set({
              executionCount: (rule.executionCount ?? 0) + 1,
              updatedAt: new Date(),
            })
            .where(eq(supportAutomationRules.id, rule.id));
        }
      }
    } catch (error) {
      this.ctx.logger.error(`Automation processing failed for ${ticket.ticketNumber}:`, error);
    }
  }

  async processMessageEvent(
    eventType: string,
    ticket: SupportTicket,
    message: TicketMessage,
    tenantId: string,
  ): Promise<void> {
    this.ctx.logger.info(`Processing automation for message event: ${eventType} - ${ticket.ticketNumber}`);

    try {
      const rules = await this.db
        .select()
        .from(supportAutomationRules)
        .where(and(
          eq(supportAutomationRules.tenantId, tenantId),
          eq(supportAutomationRules.isActive, true),
          eq(supportAutomationRules.triggerEvent, eventType),
        ))
        .orderBy(supportAutomationRules.priority);

      for (const rule of rules) {
        if (this.evaluateMessageConditions(rule.conditions as AutomationCondition[], ticket, message)) {
          if (rule.maxExecutions && (rule.executionCount ?? 0) >= rule.maxExecutions) continue;

          this.ctx.logger.info(`Executing automation rule: ${rule.name}`);
          await this.executeActions(rule.actions as AutomationAction[], ticket, tenantId, message);

          await this.db
            .update(supportAutomationRules)
            .set({
              executionCount: (rule.executionCount ?? 0) + 1,
              updatedAt: new Date(),
            })
            .where(eq(supportAutomationRules.id, rule.id));
        }
      }
    } catch (error) {
      this.ctx.logger.error(`Message automation processing failed:`, error);
    }
  }

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
    tenantId: string,
  ): Promise<SupportAutomationRule> {
    const [rule] = await this.db
      .insert(supportAutomationRules)
      .values({ ...ruleData, tenantId })
      .returning();

    this.ctx.logger.info(`Created automation rule: ${rule.name}`);
    return rule;
  }

  async getAutomationRules(tenantId: string): Promise<SupportAutomationRule[]> {
    return await this.db
      .select()
      .from(supportAutomationRules)
      .where(eq(supportAutomationRules.tenantId, tenantId))
      .orderBy(supportAutomationRules.priority);
  }

  private evaluateConditions(conditions: AutomationCondition[], ticket: SupportTicket): boolean {
    for (const condition of conditions) {
      if (!this.evaluateCondition(condition, ticket)) return false;
    }
    return true;
  }

  private evaluateMessageConditions(
    conditions: AutomationCondition[],
    ticket: SupportTicket,
    message: TicketMessage,
  ): boolean {
    for (const condition of conditions) {
      if (condition.field.startsWith('message.')) {
        const messageField = condition.field.substring(8);
        const fieldValue = (message as any)[messageField];
        if (!this.evaluateOperator(condition.operator, fieldValue, condition.value)) return false;
      } else {
        if (!this.evaluateCondition(condition, ticket)) return false;
      }
    }
    return true;
  }

  private evaluateCondition(condition: AutomationCondition, ticket: SupportTicket): boolean {
    const { field, operator, value } = condition;
    let fieldValue: any;

    switch (field) {
      case 'status': fieldValue = ticket.status; break;
      case 'priority': fieldValue = ticket.priority; break;
      case 'categoryId': fieldValue = ticket.categoryId; break;
      case 'assignedToId': fieldValue = ticket.assignedToId; break;
      case 'tags': fieldValue = ticket.tags; break;
      case 'escalationLevel': fieldValue = ticket.escalationLevel; break;
      case 'minutesSinceCreated':
        fieldValue = ticket.createdAt ? Math.floor((Date.now() - new Date(ticket.createdAt).getTime()) / 60000) : 0;
        break;
      case 'minutesSinceLastActivity':
        fieldValue = ticket.lastActivityAt ? Math.floor((Date.now() - new Date(ticket.lastActivityAt).getTime()) / 60000) : 0;
        break;
      default:
        fieldValue = ticket.customFields?.[field];
        break;
    }

    return this.evaluateOperator(operator, fieldValue, value);
  }

  private evaluateOperator(operator: string, fieldValue: any, value: any): boolean {
    switch (operator) {
      case 'equals': return fieldValue === value;
      case 'not_equals': return fieldValue !== value;
      case 'contains':
        return Array.isArray(fieldValue)
          ? fieldValue.includes(value)
          : String(fieldValue).includes(value);
      case 'not_contains':
        return Array.isArray(fieldValue)
          ? !fieldValue.includes(value)
          : !String(fieldValue).includes(value);
      case 'greater_than': return Number(fieldValue) > Number(value);
      case 'less_than': return Number(fieldValue) < Number(value);
      case 'is_empty': return !fieldValue || (Array.isArray(fieldValue) && fieldValue.length === 0);
      case 'is_not_empty': return fieldValue && (!Array.isArray(fieldValue) || fieldValue.length > 0);
      default: return false;
    }
  }

  private async executeActions(
    actions: AutomationAction[],
    ticket: SupportTicket,
    tenantId: string,
    _message?: TicketMessage,
  ): Promise<void> {
    for (const action of actions) {
      try {
        await this.executeAction(action, ticket, tenantId);
      } catch (error) {
        this.ctx.logger.error(`Failed to execute action ${action.type}:`, error);
      }
    }
  }

  private async executeAction(
    action: AutomationAction,
    ticket: SupportTicket,
    tenantId: string,
  ): Promise<void> {
    const { type, parameters } = action;

    switch (type) {
      case 'assign_ticket':
        await this.db
          .update(supportTickets)
          .set({ assignedToId: parameters.assignedToId, lastActivityAt: new Date(), updatedAt: new Date() })
          .where(and(eq(supportTickets.id, ticket.id), eq(supportTickets.tenantId, tenantId)));
        await this.db.insert(ticketMessages).values({
          ticketId: ticket.id,
          content: 'Ticket automatically assigned by automation rule',
          messageType: 'SYSTEM_MESSAGE',
          isInternal: true,
          tenantId,
        });
        break;

      case 'change_status':
        await this.db
          .update(supportTickets)
          .set({ status: parameters.status, lastActivityAt: new Date(), updatedAt: new Date() })
          .where(and(eq(supportTickets.id, ticket.id), eq(supportTickets.tenantId, tenantId)));
        break;

      case 'change_priority':
        await this.db
          .update(supportTickets)
          .set({ priority: parameters.priority, lastActivityAt: new Date(), updatedAt: new Date() })
          .where(and(eq(supportTickets.id, ticket.id), eq(supportTickets.tenantId, tenantId)));
        break;

      case 'add_tags': {
        const [current] = await this.db
          .select({ tags: supportTickets.tags })
          .from(supportTickets)
          .where(and(eq(supportTickets.id, ticket.id), eq(supportTickets.tenantId, tenantId)))
          .limit(1);
        if (current) {
          const merged = [...new Set([...(current.tags || []), ...parameters.tags])];
          await this.db
            .update(supportTickets)
            .set({ tags: merged, updatedAt: new Date() })
            .where(and(eq(supportTickets.id, ticket.id), eq(supportTickets.tenantId, tenantId)));
        }
        break;
      }

      case 'add_internal_note':
        await this.db.insert(ticketMessages).values({
          ticketId: ticket.id,
          content: parameters.content,
          messageType: 'INTERNAL_NOTE',
          isInternal: true,
          tenantId,
        });
        break;

      case 'send_auto_response':
        await this.db.insert(ticketMessages).values({
          ticketId: ticket.id,
          content: this.getAutoResponseTemplate(parameters.template),
          messageType: 'AUTO_RESPONSE',
          isInternal: false,
          tenantId,
        });
        break;

      case 'escalate_ticket':
        await this.escalateTicket(ticket, 'Automation rule triggered', tenantId);
        break;

      default:
        this.ctx.logger.warn(`Unknown automation action: ${type}`);
        break;
    }
  }

  private async escalateTicket(ticket: SupportTicket, reason: string, tenantId: string): Promise<void> {
    const newLevel = (ticket.escalationLevel || 0) + 1;
    const newPriority = ticket.priority === 'LOW' ? 'MEDIUM'
      : ticket.priority === 'MEDIUM' ? 'HIGH' : 'URGENT';

    await this.db
      .update(supportTickets)
      .set({
        escalationLevel: newLevel,
        priority: newPriority,
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(supportTickets.id, ticket.id), eq(supportTickets.tenantId, tenantId)));

    await this.db.insert(ticketMessages).values({
      ticketId: ticket.id,
      content: `Ticket escalated to level ${newLevel}. Reason: ${reason}`,
      messageType: 'SYSTEM_MESSAGE',
      isInternal: true,
      tenantId,
    });

    await this.ctx.emit('support.ticket.escalated', {
      ticketId: ticket.id,
      level: newLevel,
      reason,
    });

    this.ctx.logger.info(`Ticket ${ticket.ticketNumber} escalated to level ${newLevel}`);
  }

  private getAutoResponseTemplate(template: string): string {
    const templates: Record<string, string> = {
      acknowledgment: 'Thank you for contacting our support team. We have received your ticket and will respond as soon as possible.',
      business_hours: 'Thank you for your message. Our support team is currently outside of business hours. We will respond to your inquiry during our next business day.',
      password_reset: 'We have received your password reset request. Please check your email for instructions on how to reset your password.',
      billing_inquiry: 'Thank you for your billing inquiry. Our billing team will review your account and respond within 24 hours.',
    };
    return templates[template] || 'Thank you for contacting support. We will respond to your inquiry as soon as possible.';
  }
}
