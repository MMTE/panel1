import { SupportTicket, TicketMessage } from '../../db/schema';
import { emailService, EmailMessage } from '../email/EmailService';

interface EmailConfig {
  from: string;
  replyTo?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
}

type SupportEmailType = 'ticket_created' | 'message_reply' | 'status_changed' | 'assignment_notification' | 'escalation_notice';

export class SupportEmailService {
  private static instance: SupportEmailService;

  private constructor() {}

  static getInstance(): SupportEmailService {
    if (!SupportEmailService.instance) {
      SupportEmailService.instance = new SupportEmailService();
    }
    return SupportEmailService.instance;
  }

  /**
   * Send notification when a new ticket is created
   */
  async sendTicketCreatedNotification(
    ticket: SupportTicket,
    tenantId: string
  ): Promise<void> {
    try {
      const ticketData = await this.getTicketData(ticket.id, tenantId);
      const config = this.getEmailConfig();
      
      await this.sendSupportEmail(ticketData, 'ticket_created', config);
      
      console.log(`✅ Ticket created notification sent for ${ticket.ticketNumber}`);
    } catch (error) {
      console.error(`❌ Failed to send ticket created notification for ${ticket.ticketNumber}:`, error);
      throw error;
    }
  }

  /**
   * Send notification when a message is added to a ticket
   */
  async sendMessageNotification(
    ticket: SupportTicket,
    message: TicketMessage,
    tenantId: string
  ): Promise<void> {
    try {
      const ticketData = await this.getTicketData(ticket.id, tenantId);
      const config = this.getEmailConfig();
      
      await this.sendSupportEmail(ticketData, 'message_reply', config, message);
      
      console.log(`✅ Message notification sent for ${ticket.ticketNumber}`);
    } catch (error) {
      console.error(`❌ Failed to send message notification for ${ticket.ticketNumber}:`, error);
      throw error;
    }
  }

  /**
   * Send notification when ticket status changes
   */
  async sendStatusChangeNotification(
    ticket: SupportTicket,
    oldStatus: string,
    tenantId: string
  ): Promise<void> {
    try {
      const ticketData = await this.getTicketData(ticket.id, tenantId);
      const config = this.getEmailConfig();
      
      await this.sendSupportEmail(
        ticketData, 
        'status_changed', 
        config, 
        undefined, 
        { oldStatus }
      );
      
      console.log(`✅ Status change notification sent for ${ticket.ticketNumber}`);
    } catch (error) {
      console.error(`❌ Failed to send status change notification for ${ticket.ticketNumber}:`, error);
      throw error;
    }
  }

  /**
   * Send notification when ticket is assigned
   */
  async sendAssignmentNotification(
    ticket: SupportTicket,
    tenantId: string
  ): Promise<void> {
    try {
      const ticketData = await this.getTicketData(ticket.id, tenantId);
      const config = this.getEmailConfig();
      
      await this.sendSupportEmail(ticketData, 'assignment_notification', config);
      
      console.log(`✅ Assignment notification sent for ${ticket.ticketNumber}`);
    } catch (error) {
      console.error(`❌ Failed to send assignment notification for ${ticket.ticketNumber}:`, error);
      throw error;
    }
  }

  /**
   * Send escalation notice
   */
  async sendEscalationNotice(
    ticket: SupportTicket,
    escalationLevel: number,
    tenantId: string
  ): Promise<void> {
    try {
      const ticketData = await this.getTicketData(ticket.id, tenantId);
      const config = this.getEmailConfig();
      
      await this.sendSupportEmail(
        ticketData, 
        'escalation_notice', 
        config, 
        undefined, 
        { escalationLevel }
      );
      
      console.log(`✅ Escalation notice sent for ${ticket.ticketNumber} (Level ${escalationLevel})`);
    } catch (error) {
      console.error(`❌ Failed to send escalation notice for ${ticket.ticketNumber}:`, error);
      throw error;
    }
  }

  /**
   * Send support email using the unified email service
   */
  private async sendSupportEmail(
    ticket: any,
    type: SupportEmailType,
    config: EmailConfig,
    message?: TicketMessage,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!emailService.isInitialized()) {
      throw new Error('Email service not initialized. Please initialize the email service first.');
    }

    const content = this.generateEmailContent(ticket, type, message, metadata);
    const clientEmail = ticket.client?.user?.email;

    if (!clientEmail) {
      throw new Error('Client email not found for ticket');
    }

    const emailMessage: EmailMessage = {
      to: clientEmail,
      subject: content.subject,
      html: content.html,
      text: content.text,
      headers: {
        'X-Ticket-ID': ticket.id,
        'X-Ticket-Number': ticket.ticketNumber,
        'X-Support-Type': type,
      },
      metadata: {
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        type: 'support',
        emailType: type,
        tenantId: ticket.tenantId,
        ...metadata,
      }
    };

    await emailService.sendEmail(emailMessage);
  }

  /**
   * Generate email content based on type
   */
  private generateEmailContent(
    ticket: any,
    type: SupportEmailType,
    message?: TicketMessage,
    metadata?: Record<string, any>
  ): {
    subject: string;
    html: string;
    text: string;
  } {
    const clientName = ticket.client?.companyName || 
                      `${ticket.client?.user?.firstName || ''} ${ticket.client?.user?.lastName || ''}`.trim() ||
                      'Valued Customer';

    const ticketUrl = `${process.env.FRONTEND_URL || 'https://panel1.dev'}/support/tickets/${ticket.ticketNumber}`;

    switch (type) {
      case 'ticket_created':
        return {
          subject: `Support Ticket Created: ${ticket.ticketNumber} - ${ticket.subject}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #6366f1;">Support Ticket Created</h2>
              <p>Dear ${clientName},</p>
              <p>Your support ticket has been created successfully.</p>
              <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <strong>Ticket Number:</strong> ${ticket.ticketNumber}<br>
                <strong>Subject:</strong> ${ticket.subject}<br>
                <strong>Priority:</strong> ${ticket.priority}<br>
                <strong>Status:</strong> ${ticket.status}
              </div>
              <p>We will respond to your ticket as soon as possible. You can track the progress of your ticket using the link below:</p>
              <p><a href="${ticketUrl}" style="background: #6366f1; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Ticket</a></p>
              <p>Thank you for contacting our support team!</p>
              <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
              <p style="font-size: 12px; color: #6b7280;">This is an automated message. Please do not reply to this email directly.</p>
            </div>
          `,
          text: `Support Ticket Created: ${ticket.ticketNumber}\n\nDear ${clientName},\n\nYour support ticket "${ticket.subject}" has been created successfully.\n\nTicket Number: ${ticket.ticketNumber}\nPriority: ${ticket.priority}\nStatus: ${ticket.status}\n\nWe will respond as soon as possible. Track your ticket at: ${ticketUrl}\n\nThank you for contacting our support team!`,
        };

      case 'message_reply':
        const authorName = message?.authorId ? 'Support Team' : (message?.authorName || 'Support');
        return {
          subject: `Re: ${ticket.ticketNumber} - ${ticket.subject}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #6366f1;">New Response to Your Support Ticket</h2>
              <p>Dear ${clientName},</p>
              <p>You have received a new response to your support ticket <strong>${ticket.ticketNumber}</strong>.</p>
              <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <strong>From:</strong> ${authorName}<br>
                <strong>Date:</strong> ${new Date().toLocaleString()}<br>
                <strong>Message:</strong><br>
                <div style="margin-top: 10px; padding: 10px; background: white; border-left: 3px solid #6366f1;">
                  ${message?.htmlContent || message?.content || ''}
                </div>
              </div>
              <p><a href="${ticketUrl}" style="background: #6366f1; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Full Conversation</a></p>
              <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
              <p style="font-size: 12px; color: #6b7280;">This is an automated message. Please do not reply to this email directly.</p>
            </div>
          `,
          text: `New Response to Support Ticket ${ticket.ticketNumber}\n\nDear ${clientName},\n\nFrom: ${authorName}\nDate: ${new Date().toLocaleString()}\nMessage: ${message?.content || ''}\n\nView full conversation: ${ticketUrl}`,
        };

      case 'status_changed':
        return {
          subject: `Ticket Status Updated: ${ticket.ticketNumber} - ${ticket.subject}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #6366f1;">Ticket Status Updated</h2>
              <p>Dear ${clientName},</p>
              <p>The status of your support ticket <strong>${ticket.ticketNumber}</strong> has been updated.</p>
              <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <strong>Previous Status:</strong> ${metadata?.oldStatus || 'Unknown'}<br>
                <strong>New Status:</strong> ${ticket.status}
              </div>
              ${ticket.status === 'RESOLVED' ? 
                '<div style="background: #d1fae5; padding: 15px; border-radius: 5px; margin: 15px 0;"><p style="color: #065f46; margin: 0;"><strong>Great news!</strong> Your ticket has been resolved! If you have any additional questions or if the issue persists, please feel free to reply to this ticket.</p></div>' :
                '<p>We will continue working on your ticket and keep you updated on any progress.</p>'
              }
              <p><a href="${ticketUrl}" style="background: #6366f1; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Ticket</a></p>
              <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
              <p style="font-size: 12px; color: #6b7280;">This is an automated message. Please do not reply to this email directly.</p>
            </div>
          `,
          text: `Ticket Status Updated: ${ticket.ticketNumber}\n\nDear ${clientName},\n\nStatus changed from ${metadata?.oldStatus || 'Unknown'} to ${ticket.status}.\n\n${ticket.status === 'RESOLVED' ? 'Your ticket has been resolved! If you have any additional questions, please reply to this ticket.' : 'We will continue working on your ticket.'}\n\nView ticket: ${ticketUrl}`,
        };

      case 'assignment_notification':
        return {
          subject: `Ticket Assigned: ${ticket.ticketNumber} - ${ticket.subject}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #6366f1;">Ticket Assigned to Support Agent</h2>
              <p>Dear ${clientName},</p>
              <p>Your support ticket <strong>${ticket.ticketNumber}</strong> has been assigned to a support agent and is being reviewed.</p>
              <div style="background: #fef3c7; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <p style="color: #92400e; margin: 0;"><strong>Status:</strong> Your ticket is now being actively worked on by our support team.</p>
              </div>
              <p>You can expect a response soon. We appreciate your patience!</p>
              <p><a href="${ticketUrl}" style="background: #6366f1; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Ticket</a></p>
              <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
              <p style="font-size: 12px; color: #6b7280;">This is an automated message. Please do not reply to this email directly.</p>
            </div>
          `,
          text: `Ticket Assigned: ${ticket.ticketNumber}\n\nDear ${clientName},\n\nYour ticket has been assigned to a support agent and is being reviewed. You can expect a response soon.\n\nView ticket: ${ticketUrl}`,
        };

      case 'escalation_notice':
        return {
          subject: `Urgent: Ticket Escalated - ${ticket.ticketNumber}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #dc2626;">🚨 Ticket Escalation Notice</h2>
              <p>Dear ${clientName},</p>
              <p>Your support ticket <strong>${ticket.ticketNumber}</strong> has been escalated to our senior support team for urgent attention.</p>
              <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <strong style="color: #991b1b;">Escalation Level:</strong> ${metadata?.escalationLevel || 1}<br>
                <strong style="color: #991b1b;">Priority:</strong> ${ticket.priority}<br>
                <strong style="color: #991b1b;">Status:</strong> High Priority Review
              </div>
              <p><strong>We are prioritizing your case and will provide an update as soon as possible.</strong></p>
              <p><a href="${ticketUrl}" style="background: #dc2626; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Ticket</a></p>
              <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;">
              <p style="font-size: 12px; color: #6b7280;">This is an automated message. Please do not reply to this email directly.</p>
            </div>
          `,
          text: `URGENT: Ticket Escalated - ${ticket.ticketNumber}\n\nDear ${clientName},\n\nYour ticket has been escalated to our senior support team (Level ${metadata?.escalationLevel || 1}). We are prioritizing your case and will provide an update ASAP.\n\nView ticket: ${ticketUrl}`,
        };

      default:
        throw new Error(`Unknown email type: ${type}`);
    }
  }

  /**
   * Get ticket data with relations for email content
   */
  private async getTicketData(ticketId: string, tenantId: string): Promise<any> {
    // For now, return mock data. In production, this would query the database
    // TODO: Implement database query to get ticket with relations
    return {
      id: ticketId,
      ticketNumber: 'TKT-2025-000001',
      subject: 'Sample Ticket',
      status: 'OPEN',
      priority: 'MEDIUM',
      tenantId,
      client: {
        companyName: 'Sample Company',
        user: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com'
        }
      },
      tenant: {
        name: 'Panel1',
        settings: {}
      }
    };
  }

  /**
   * Get email configuration
   */
  private getEmailConfig(): EmailConfig {
    return {
      from: process.env.SUPPORT_FROM_EMAIL || 'support@panel1.dev',
      replyTo: process.env.SUPPORT_REPLY_TO_EMAIL,
      smtpHost: process.env.SMTP_HOST || 'localhost',
      smtpPort: parseInt(process.env.SMTP_PORT || '1025'),
      smtpUser: process.env.SMTP_USER,
      smtpPass: process.env.SMTP_PASS,
    };
  }

  /**
   * Format date for email display
   */
  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
} 