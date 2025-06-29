import { Job } from 'bullmq';
import { supportService } from '../../support/SupportService.js';
import { SupportAutomationEngine } from '../../support/SupportAutomationEngine.js';
import { SlaManager } from '../../support/SlaManager.js';
import { SupportEmailService } from '../../support/SupportEmailService.js';

export interface SupportJobData {
  type: 'escalation' | 'sla_check' | 'auto_response' | 'ticket_reminder' | 'satisfaction_survey';
  tenantId: string;
  ticketId?: string;
  escalationLevel?: number;
  reminderType?: string;
  metadata?: Record<string, any>;
}

export class SupportProcessor {
  private automationEngine: SupportAutomationEngine;
  private slaManager: SlaManager;
  private emailService: SupportEmailService;

  constructor() {
    this.automationEngine = SupportAutomationEngine.getInstance();
    this.slaManager = SlaManager.getInstance();
    this.emailService = SupportEmailService.getInstance();
  }

  async processJob(job: Job<SupportJobData>): Promise<void> {
    const { type, tenantId, ticketId, escalationLevel, reminderType, metadata } = job.data;

    console.log(`🎫 Processing support job: ${type} for tenant ${tenantId}`);

    try {
      switch (type) {
        case 'escalation':
          await this.processEscalation(tenantId, ticketId, escalationLevel, metadata);
          break;

        case 'sla_check':
          await this.processSlaCheck(tenantId, metadata);
          break;

        case 'auto_response':
          await this.processAutoResponse(tenantId, ticketId, metadata);
          break;

        case 'ticket_reminder':
          await this.processTicketReminder(tenantId, ticketId, reminderType, metadata);
          break;

        case 'satisfaction_survey':
          await this.processSatisfactionSurvey(tenantId, ticketId, metadata);
          break;

        default:
          throw new Error(`Unknown support job type: ${type}`);
      }

      console.log(`✅ Support job completed: ${type}`);

    } catch (error) {
      console.error(`❌ Support job failed: ${type}`, error);
      throw error;
    }
  }

  /**
   * Process ticket escalation
   */
  private async processEscalation(
    tenantId: string,
    ticketId?: string,
    escalationLevel?: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    console.log(`🚨 Processing escalation for tenant: ${tenantId}`);

    if (ticketId) {
      // Escalate specific ticket
      const ticketData = await supportService.getTicketWithMessages(ticketId, tenantId, true);
      if (ticketData) {
        // Update escalation level
        await supportService.updateTicketStatus(
          ticketId,
          ticketData.ticket.status,
          tenantId,
          undefined,
          `Escalated to level ${escalationLevel || 1}`
        );

        // Send escalation notification
        await this.emailService.sendEscalationNotice(
          ticketData.ticket,
          escalationLevel || 1,
          tenantId
        );
      }
    } else {
      // Process all escalations for tenant
      await this.automationEngine.processEscalations(tenantId);
    }
  }

  /**
   * Process SLA checks
   */
  private async processSlaCheck(
    tenantId: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    console.log(`⏰ Processing SLA checks for tenant: ${tenantId}`);

    // Check for SLA breaches and at-risk tickets
    await this.slaManager.processSlalations(tenantId);

    // Get tickets at risk of SLA breach
    const atRiskTickets = await this.slaManager.getTicketsAtRisk(tenantId);
    
    for (const ticket of atRiskTickets) {
      // Send at-risk notification to assigned agent
      console.log(`⚠️ Ticket ${ticket.ticketNumber} is at risk of SLA breach`);
      
      // Could trigger additional actions like:
      // - Email notifications to supervisors
      // - Slack/Teams notifications
      // - Automatic priority increase
      // - Reassignment to available agents
    }
  }

  /**
   * Process auto-responses
   */
  private async processAutoResponse(
    tenantId: string,
    ticketId?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    console.log(`🤖 Processing auto-responses for tenant: ${tenantId}`);

    if (ticketId && metadata?.responseType) {
      // Send specific auto-response
      const ticketData = await supportService.getTicketWithMessages(ticketId, tenantId);
      if (ticketData) {
        await supportService.addMessage(
          ticketId,
          {
            content: this.getAutoResponseContent(metadata.responseType),
            messageType: 'AUTO_RESPONSE',
            isInternal: false,
          },
          tenantId
        );
      }
    } else {
      // Process general auto-responses
      await this.automationEngine.processAutoResponses(tenantId);
    }
  }

  /**
   * Process ticket reminders
   */
  private async processTicketReminder(
    tenantId: string,
    ticketId?: string,
    reminderType?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    console.log(`🔔 Processing ticket reminder: ${reminderType} for tenant ${tenantId}`);

    if (!ticketId) return;

    const ticketData = await supportService.getTicketWithMessages(ticketId, tenantId);
    if (!ticketData) return;

    switch (reminderType) {
      case 'customer_follow_up':
        // Send follow-up reminder to customer
        await supportService.addMessage(
          ticketId,
          {
            content: 'We wanted to follow up on your support request. Please let us know if you need any additional assistance.',
            messageType: 'AUTO_RESPONSE',
            isInternal: false,
          },
          tenantId
        );
        break;

      case 'agent_reminder':
        // Send reminder to assigned agent
        await supportService.addMessage(
          ticketId,
          {
            content: `Reminder: This ticket requires attention. Last activity: ${ticketData.ticket.lastActivityAt}`,
            messageType: 'INTERNAL_NOTE',
            isInternal: true,
          },
          tenantId
        );
        break;

      case 'waiting_customer_reminder':
        // Remind customer to respond
        await supportService.addMessage(
          ticketId,
          {
            content: 'This ticket is waiting for your response. Please reply with any additional information or let us know if the issue has been resolved.',
            messageType: 'AUTO_RESPONSE',
            isInternal: false,
          },
          tenantId
        );
        break;

      default:
        console.warn(`Unknown reminder type: ${reminderType}`);
    }
  }

  /**
   * Process satisfaction surveys
   */
  private async processSatisfactionSurvey(
    tenantId: string,
    ticketId?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    console.log(`📊 Processing satisfaction survey for ticket: ${ticketId}`);

    if (!ticketId) return;

    const ticketData = await supportService.getTicketWithMessages(ticketId, tenantId);
    if (!ticketData || ticketData.ticket.status !== 'RESOLVED') return;

    // Send satisfaction survey
    const surveyContent = this.generateSatisfactionSurvey(ticketData.ticket);
    
    await supportService.addMessage(
      ticketId,
      {
        content: surveyContent,
        messageType: 'AUTO_RESPONSE',
        isInternal: false,
      },
      tenantId
    );
  }

  /**
   * Get auto-response content based on type
   */
  private getAutoResponseContent(responseType: string): string {
    const responses: Record<string, string> = {
      'acknowledgment': 'Thank you for contacting our support team. We have received your ticket and will respond as soon as possible during our business hours.',
      
      'business_hours': 'Thank you for your message. Our support team is currently outside of business hours (Monday-Friday, 9 AM - 5 PM). We will respond to your inquiry during our next business day.',
      
      'password_reset': 'We have received your password reset request. For security reasons, please check your registered email address for password reset instructions.',
      
      'billing_inquiry': 'Thank you for your billing inquiry. Our billing team will review your account and respond within 24 hours with the requested information.',
      
      'technical_support': 'We have received your technical support request. To help us resolve your issue quickly, please provide:\n\n1. Steps to reproduce the issue\n2. Any error messages you see\n3. Your operating system and browser version\n\nOur technical team will respond within 2 hours.',
      
      'feature_request': 'Thank you for your feature request! We appreciate your feedback and will review your suggestion. Feature requests are evaluated monthly and prioritized based on customer demand.',
      
      'account_issue': 'We have received your account-related inquiry. For security reasons, we may need to verify your identity before making any account changes. Our team will respond within 1 hour.',
    };

    return responses[responseType] || responses['acknowledgment'];
  }

  /**
   * Generate satisfaction survey content
   */
  private generateSatisfactionSurvey(ticket: any): string {
    const surveyUrl = `${process.env.FRONTEND_URL}/survey/${ticket.id}`;
    
    return `Hello! We've marked your support ticket "${ticket.subject}" as resolved.

We'd love to hear about your experience! Please take a moment to rate our support:

⭐ How satisfied were you with our response time?
⭐ How satisfied were you with the solution provided?
⭐ How satisfied were you with our support team's professionalism?

Rate your experience (1-5 stars): ${surveyUrl}

Your feedback helps us improve our service. Thank you for choosing our support!

If you have any additional questions or if the issue persists, please feel free to reply to this ticket.`;
  }

  /**
   * Schedule follow-up jobs
   */
  async scheduleFollowUpJobs(
    tenantId: string,
    ticketId: string,
    ticketStatus: string
  ): Promise<void> {
    // This would integrate with the JobScheduler to schedule follow-up jobs
    // Based on ticket status and SLA profiles
    
    console.log(`📅 Scheduling follow-up jobs for ticket: ${ticketId}, status: ${ticketStatus}`);
    
    // Example scheduling logic:
    // - If status is 'WAITING_CUSTOMER', schedule reminder in 3 days
    // - If status is 'RESOLVED', schedule satisfaction survey in 1 hour
    // - If status is 'OPEN' and no first response, schedule escalation
  }
}

// Export singleton instance
export const supportProcessor = new SupportProcessor(); 