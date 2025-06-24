import { InvoiceEmailService, EmailConfig } from './InvoiceEmailService.js';
import { db, invoices, clients, users, tenants } from '../../db/index.js';
import { eq, and } from 'drizzle-orm';

// Demo email configuration - in production this would come from tenant settings
const DEMO_EMAIL_CONFIG: EmailConfig = {
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || 'demo@panel1.dev',
    pass: process.env.SMTP_PASS || 'demo-password',
  },
  from: 'Panel1 <noreply@panel1.dev>',
};

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

      // In demo mode, just log instead of sending email
      if (process.env.NODE_ENV !== 'production') {
        console.log(`🎭 Demo mode: Would send "created" email for invoice ${invoiceData.invoiceNumber} to ${invoiceData.client.user.email}`);
        return;
      }

      await InvoiceEmailService.sendInvoiceEmail(invoiceData, 'created', DEMO_EMAIL_CONFIG);
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

      // In demo mode, just log instead of sending email
      if (process.env.NODE_ENV !== 'production') {
        console.log(`🎭 Demo mode: Would send "paid" email for invoice ${invoiceData.invoiceNumber} to ${invoiceData.client.user.email}`);
        return;
      }

      await InvoiceEmailService.sendInvoiceEmail(invoiceData, 'paid', DEMO_EMAIL_CONFIG);
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

      // In demo mode, just log instead of sending email
      if (process.env.NODE_ENV !== 'production') {
        console.log(`🎭 Demo mode: Would send "overdue" email for invoice ${invoiceData.invoiceNumber} to ${invoiceData.client.user.email}`);
        return;
      }

      await InvoiceEmailService.sendInvoiceEmail(invoiceData, 'overdue', DEMO_EMAIL_CONFIG);
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