import { InvoiceEmailService, EmailConfig } from './InvoiceEmailService.js';
import { db, invoices, clients, users, tenants } from '../../db/index.js';
import { eq, and } from 'drizzle-orm';

// MailHog email configuration for development/testing
const getEmailConfig = (): EmailConfig => ({
  host: process.env.SMTP_HOST || 'localhost',
  port: parseInt(process.env.SMTP_PORT || '1025'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || 'test@panel1.dev',
    pass: process.env.SMTP_PASS || '', // MailHog doesn't require authentication
  },
  from: process.env.SMTP_FROM || 'Panel1 <noreply@panel1.dev>',
});

export class InvoiceEventHandler {
  /**
   * Handle invoice created event
   */
  static async handleInvoiceCreated(invoiceId: string, tenantId: string): Promise<void> {
    console.log(`📧 Handling invoice created event: ${invoiceId}`);
    
    try {
      const invoiceData = await this.getInvoiceData(invoiceId, tenantId);
      if (!invoiceData) {
        console.error('Invoice not found for email notification');
        return;
      }

      // Send email if enabled
      if (process.env.ENABLE_EMAIL_SENDING === 'true') {
        await InvoiceEmailService.sendInvoiceEmail(invoiceData, 'created', getEmailConfig());
        console.log(`📧 Invoice created email sent for ${invoiceData.invoiceNumber} to ${invoiceData.client.user.email}`);
      } else {
        console.log(`🎭 Email disabled: Would send "created" email for invoice ${invoiceData.invoiceNumber} to ${invoiceData.client.user.email}`);
      }
    } catch (error) {
      console.error('Failed to send invoice created email:', error);
    }
  }

  /**
   * Handle invoice paid event
   */
  static async handleInvoicePaid(invoiceId: string, tenantId: string): Promise<void> {
    console.log(`📧 Handling invoice paid event: ${invoiceId}`);
    
    try {
      const invoiceData = await this.getInvoiceData(invoiceId, tenantId);
      if (!invoiceData) {
        console.error('Invoice not found for email notification');
        return;
      }

      // Send email if enabled
      if (process.env.ENABLE_EMAIL_SENDING === 'true') {
        await InvoiceEmailService.sendInvoiceEmail(invoiceData, 'paid', getEmailConfig());
        console.log(`📧 Invoice paid email sent for ${invoiceData.invoiceNumber} to ${invoiceData.client.user.email}`);
      } else {
        console.log(`🎭 Email disabled: Would send "paid" email for invoice ${invoiceData.invoiceNumber} to ${invoiceData.client.user.email}`);
      }
    } catch (error) {
      console.error('Failed to send invoice paid email:', error);
    }
  }

  /**
   * Handle invoice overdue event
   */
  static async handleInvoiceOverdue(invoiceId: string, tenantId: string): Promise<void> {
    console.log(`📧 Handling invoice overdue event: ${invoiceId}`);
    
    try {
      const invoiceData = await this.getInvoiceData(invoiceId, tenantId);
      if (!invoiceData) {
        console.error('Invoice not found for email notification');
        return;
      }

      // Send email if enabled
      if (process.env.ENABLE_EMAIL_SENDING === 'true') {
        await InvoiceEmailService.sendInvoiceEmail(invoiceData, 'overdue', getEmailConfig());
        console.log(`📧 Invoice overdue email sent for ${invoiceData.invoiceNumber} to ${invoiceData.client.user.email}`);
      } else {
        console.log(`🎭 Email disabled: Would send "overdue" email for invoice ${invoiceData.invoiceNumber} to ${invoiceData.client.user.email}`);
      }
    } catch (error) {
      console.error('Failed to send invoice overdue email:', error);
    }
  }

  /**
   * Get invoice data for email notifications
   */
  private static async getInvoiceData(invoiceId: string, tenantId: string): Promise<any | null> {
    const [invoice] = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        status: invoices.status,
        total: invoices.total,
        currency: invoices.currency,
        dueDate: invoices.dueDate,
        createdAt: invoices.createdAt,
        client: {
          companyName: clients.companyName,
          user: {
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
          },
        },
        tenant: {
          name: tenants.name,
          domain: tenants.domain,
        },
      })
      .from(invoices)
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .leftJoin(users, eq(clients.userId, users.id))
      .leftJoin(tenants, eq(invoices.tenantId, tenants.id))
      .where(and(
        eq(invoices.id, invoiceId),
        eq(invoices.tenantId, tenantId)
      ))
      .limit(1);

    return invoice || null;
  }
} 