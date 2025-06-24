import nodemailer from 'nodemailer';

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
}

export type EmailType = 'created' | 'paid' | 'overdue' | 'reminder';

export class InvoiceEmailService {
  private static transporter: nodemailer.Transporter | null = null;

  static async initialize(config: EmailConfig): Promise<void> {
    this.transporter = nodemailer.createTransporter({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
    });

    try {
      await this.transporter.verify();
      console.log('✅ Email service initialized successfully');
    } catch (error) {
      console.error('❌ Email service initialization failed:', error);
      throw error;
    }
  }

  static async sendInvoiceEmail(
    invoiceData: any,
    type: EmailType,
    emailConfig: EmailConfig
  ): Promise<void> {
    if (!this.transporter) {
      await this.initialize(emailConfig);
    }

    const { subject, html, text } = this.generateEmailContent(invoiceData, type);
    
    const mailOptions: nodemailer.SendMailOptions = {
      from: emailConfig.from,
      to: invoiceData.client.user.email,
      subject,
      text,
      html,
    };

    try {
      await this.transporter!.sendMail(mailOptions);
      console.log(`✅ Invoice email sent: ${type} for ${invoiceData.invoiceNumber}`);
    } catch (error) {
      console.error('❌ Failed to send invoice email:', error);
      throw error;
    }
  }

  private static generateEmailContent(invoice: any, type: EmailType): {
    subject: string;
    html: string;
    text: string;
  } {
    const clientName = invoice.client?.companyName || 
                      `${invoice.client?.user?.firstName || ''} ${invoice.client?.user?.lastName || ''}`.trim() ||
                      'Valued Customer';

    const amount = this.formatCurrency(parseFloat(invoice.total), invoice.currency);
    const dueDate = this.formatDate(invoice.dueDate);

    switch (type) {
      case 'created':
        return {
          subject: `Invoice ${invoice.invoiceNumber} from ${invoice.tenant?.name || 'Panel1'}`,
          html: `<h2>New Invoice</h2><p>Dear ${clientName},</p><p>Invoice #${invoice.invoiceNumber} for ${amount} is due ${dueDate}.</p><p>Thank you!</p>`,
          text: `Dear ${clientName}, Invoice #${invoice.invoiceNumber} for ${amount} is due ${dueDate}. Thank you!`,
        };

      case 'paid':
        return {
          subject: `Payment Received - Invoice ${invoice.invoiceNumber}`,
          html: `<h2>Payment Received</h2><p>Dear ${clientName},</p><p>Payment received for Invoice #${invoice.invoiceNumber} (${amount}).</p><p>Thank you!</p>`,
          text: `Dear ${clientName}, Payment received for Invoice #${invoice.invoiceNumber} (${amount}). Thank you!`,
        };

      case 'overdue':
        return {
          subject: `Overdue Notice - Invoice ${invoice.invoiceNumber}`,
          html: `<h2>Overdue Notice</h2><p>Dear ${clientName},</p><p>Invoice #${invoice.invoiceNumber} (${amount}) is overdue. Please submit payment immediately.</p>`,
          text: `Dear ${clientName}, Invoice #${invoice.invoiceNumber} (${amount}) is overdue. Please submit payment immediately.`,
        };

      case 'reminder':  
        return {
          subject: `Payment Reminder - Invoice ${invoice.invoiceNumber}`,
          html: `<h2>Payment Reminder</h2><p>Dear ${clientName},</p><p>Reminder: Invoice #${invoice.invoiceNumber} (${amount}) is due ${dueDate}.</p><p>Thank you!</p>`,
          text: `Dear ${clientName}, Reminder: Invoice #${invoice.invoiceNumber} (${amount}) is due ${dueDate}. Thank you!`,
        };

      default:
        throw new Error(`Unknown email type: ${type}`);
    }
  }

  private static formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long', 
      day: 'numeric',
    });
  }

  private static formatCurrency(amount: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  }
}
