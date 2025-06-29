import nodemailer from 'nodemailer';
import { EventEmitter } from 'events';

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth?: {
    user: string;
    pass: string;
  };
  from: string;
  replyTo?: string;
}

export interface EmailMessage {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
  headers?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export class EmailService extends EventEmitter {
  private static instance: EmailService;
  private transporter: nodemailer.Transporter | null = null;
  private config: EmailConfig | null = null;
  private initialized = false;

  private constructor() {
    super();
  }

  static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  /**
   * Initialize email service with configuration
   */
  async initialize(config: EmailConfig): Promise<void> {
    this.config = config;

    const transportOptions: any = {
      host: config.host,
      port: config.port,
      secure: config.secure,
    };

    // Only add auth if credentials are provided (for services like MailHog)
    if (config.auth?.user && config.auth?.pass) {
      transportOptions.auth = config.auth;
    }

    this.transporter = nodemailer.createTransport(transportOptions);

    try {
      await this.transporter.verify();
      this.initialized = true;
      console.log('✅ Email service initialized successfully');
      this.emit('initialized', config);
    } catch (error) {
      console.error('❌ Email service initialization failed:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Check if email service is initialized and ready
   */
  isInitialized(): boolean {
    return this.initialized && this.transporter !== null;
  }

  /**
   * Send an email
   */
  async sendEmail(message: EmailMessage): Promise<void> {
    if (!this.isInitialized()) {
      throw new Error('Email service not initialized. Call initialize() first.');
    }

    if (!this.transporter || !this.config) {
      throw new Error('Email transporter not configured');
    }

    try {
      const mailOptions = {
        from: this.config.from,
        replyTo: this.config.replyTo,
        to: Array.isArray(message.to) ? message.to.join(', ') : message.to,
        cc: message.cc ? (Array.isArray(message.cc) ? message.cc.join(', ') : message.cc) : undefined,
        bcc: message.bcc ? (Array.isArray(message.bcc) ? message.bcc.join(', ') : message.bcc) : undefined,
        subject: message.subject,
        html: message.html,
        text: message.text,
        attachments: message.attachments,
        headers: message.headers,
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      console.log(`✅ Email sent successfully: ${message.subject} to ${message.to}`);
      this.emit('sent', { message, result, metadata: message.metadata });
      
      return result;
    } catch (error) {
      console.error(`❌ Email sending failed: ${message.subject}`, error);
      this.emit('failed', { message, error, metadata: message.metadata });
      throw error;
    }
  }

  /**
   * Send multiple emails in batch
   */
  async sendBatch(messages: EmailMessage[]): Promise<void> {
    const results = await Promise.allSettled(
      messages.map(message => this.sendEmail(message))
    );

    const failed = results.filter(result => result.status === 'rejected');
    if (failed.length > 0) {
      console.warn(`⚠️ ${failed.length} out of ${messages.length} emails failed to send`);
    }

    this.emit('batch_completed', { 
      total: messages.length, 
      successful: results.length - failed.length, 
      failed: failed.length 
    });
  }

  /**
   * Create email from template with variable substitution
   */
  createFromTemplate(
    template: EmailTemplate,
    variables: Record<string, string>
  ): { subject: string; html: string; text: string } {
    let subject = template.subject;
    let html = template.html;
    let text = template.text;

    // Replace variables in template
    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      subject = subject.replace(new RegExp(placeholder, 'g'), value);
      html = html.replace(new RegExp(placeholder, 'g'), value);
      text = text.replace(new RegExp(placeholder, 'g'), value);
    });

    return { subject, html, text };
  }

  /**
   * Get email configuration from environment variables
   */
  static getConfigFromEnv(): EmailConfig {
    return {
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '1025'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER && process.env.SMTP_PASS ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      } : undefined,
      from: process.env.SMTP_FROM || 'noreply@panel1.dev',
      replyTo: process.env.SMTP_REPLY_TO,
    };
  }

  /**
   * Test email configuration
   */
  async testConnection(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('Email connection test failed:', error);
      return false;
    }
  }

  /**
   * Send a test email
   */
  async sendTestEmail(to: string): Promise<void> {
    await this.sendEmail({
      to,
      subject: 'Panel1 Email Service Test',
      html: `
        <h2>Email Service Test</h2>
        <p>This is a test email from Panel1 to verify email functionality.</p>
        <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
        <p>If you received this email, the email service is working correctly!</p>
      `,
      text: `Panel1 Email Service Test\n\nThis is a test email to verify email functionality.\nTimestamp: ${new Date().toISOString()}\n\nIf you received this email, the email service is working correctly!`,
      metadata: { type: 'test', timestamp: new Date().toISOString() }
    });
  }
}

// Export singleton instance
export const emailService = EmailService.getInstance(); 