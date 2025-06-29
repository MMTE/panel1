import nodemailer from 'nodemailer';

export interface DunningEmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
}

export type DunningEmailType = 
  | 'payment_failed_day_1' 
  | 'payment_failed_day_3' 
  | 'payment_failed_day_7'
  | 'gentle_reminder_day_2'
  | 'gentle_reminder_day_7'
  | 'gentle_reminder_day_14'
  | 'urgent_payment_day_1'
  | 'urgent_payment_day_3'
  | 'immediate_payment_required'
  | 'grace_period_notice'
  | 'suspension_notice'
  | 'cancellation_notice';

export class DunningEmailService {
  private static transporter: nodemailer.Transporter | null = null;

  static async initialize(config: DunningEmailConfig): Promise<void> {
    const transportOptions: any = {
      host: config.host,
      port: config.port,
      secure: config.secure,
    };

    // Only add auth if user/pass are provided (MailHog doesn't need auth)
    if (config.auth.user && config.auth.pass) {
      transportOptions.auth = config.auth;
    }

    this.transporter = nodemailer.createTransport(transportOptions);

    try {
      await this.transporter.verify();
      console.log('✅ Dunning email service initialized successfully');
    } catch (error) {
      console.error('❌ Dunning email service initialization failed:', error);
      throw error;
    }
  }

  static async sendDunningEmail(
    subscriptionData: any,
    clientData: any,
    template: DunningEmailType,
    emailConfig: DunningEmailConfig,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.transporter) {
      await this.initialize(emailConfig);
    }

    const { subject, html, text } = this.generateDunningEmailContent(
      subscriptionData,
      clientData,
      template,
      metadata
    );
    
    const mailOptions: nodemailer.SendMailOptions = {
      from: emailConfig.from,
      to: clientData.user?.email,
      subject,
      text,
      html,
    };

    try {
      await this.transporter!.sendMail(mailOptions);
      console.log(`📧 Dunning email sent: ${template} to ${clientData.user?.email}`);
    } catch (error) {
      console.error('❌ Failed to send dunning email:', error);
      throw error;
    }
  }

  private static generateDunningEmailContent(
    subscription: any,
    client: any,
    template: DunningEmailType,
    metadata?: Record<string, any>
  ): {
    subject: string;
    html: string;
    text: string;
  } {
    const clientName = client?.companyName || 
                      `${client?.user?.firstName || ''} ${client?.user?.lastName || ''}`.trim() ||
                      'Valued Customer';

    const amount = this.formatCurrency(parseFloat(subscription.unitPrice || '0'));
    const subscriptionId = subscription.id;

    switch (template) {
      case 'payment_failed_day_1':
        return {
          subject: `Payment Failed - Immediate Action Required`,
          html: this.getEmailTemplate('payment_failed', {
            clientName,
            amount,
            subscriptionId,
            dayNumber: '1',
            urgency: 'low',
            graceDays: metadata?.graceDays || 0,
          }),
          text: `Dear ${clientName}, Your payment of ${amount} for subscription ${subscriptionId} has failed. Please update your payment method immediately.`,
        };

      case 'payment_failed_day_3':
        return {
          subject: `Payment Failed - Action Required`,
          html: this.getEmailTemplate('payment_failed', {
            clientName,
            amount,
            subscriptionId,
            dayNumber: '3',
            urgency: 'medium',
            graceDays: metadata?.graceDays || 0,
          }),
          text: `Dear ${clientName}, Your payment of ${amount} for subscription ${subscriptionId} failed 3 days ago. Please update your payment method to avoid service interruption.`,
        };

      case 'payment_failed_day_7':
        return {
          subject: `Payment Failed - Final Notice`,
          html: this.getEmailTemplate('payment_failed', {
            clientName,
            amount,
            subscriptionId,
            dayNumber: '7',
            urgency: 'high',
            graceDays: metadata?.graceDays || 0,
          }),
          text: `Dear ${clientName}, Your payment of ${amount} for subscription ${subscriptionId} failed 7 days ago. This is your final notice before service suspension.`,
        };

      case 'gentle_reminder_day_2':
        return {
          subject: `Gentle Reminder - Payment Update Needed`,
          html: this.getEmailTemplate('gentle_reminder', {
            clientName,
            amount,
            subscriptionId,
            dayNumber: '2',
          }),
          text: `Dear ${clientName}, We noticed your payment of ${amount} needs attention. Please update your payment method when convenient.`,
        };

      case 'grace_period_notice':
        return {
          subject: `Grace Period Activated - Please Update Payment`,
          html: this.getEmailTemplate('grace_period', {
            clientName,
            amount,
            subscriptionId,
            graceDays: metadata?.graceDays || 3,
          }),
          text: `Dear ${clientName}, We've activated a ${metadata?.graceDays || 3}-day grace period for your subscription. Please update your payment method.`,
        };

      case 'suspension_notice':
        return {
          subject: `Service Suspended - Payment Required`,
          html: this.getEmailTemplate('suspension', {
            clientName,
            amount,
            subscriptionId,
          }),
          text: `Dear ${clientName}, Your subscription has been suspended due to failed payment of ${amount}. Please update your payment method to restore service.`,
        };

      case 'cancellation_notice':
        return {
          subject: `Subscription Cancelled - Final Notice`,
          html: this.getEmailTemplate('cancellation', {
            clientName,
            amount,
            subscriptionId,
          }),
          text: `Dear ${clientName}, Your subscription has been cancelled due to non-payment. Contact us if you'd like to reactivate your service.`,
        };

      default:
        return {
          subject: `Payment Reminder`,
          html: `<p>Dear ${clientName},</p><p>This is a payment reminder for your subscription.</p>`,
          text: `Dear ${clientName}, This is a payment reminder for your subscription.`,
        };
    }
  }

  private static getEmailTemplate(type: string, data: any): string {
    const baseStyle = `
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .content { background: white; padding: 20px; border: 1px solid #e9ecef; border-radius: 8px; }
        .urgency-low { border-left: 4px solid #28a745; }
        .urgency-medium { border-left: 4px solid #ffc107; }
        .urgency-high { border-left: 4px solid #dc3545; }
        .cta-button { 
          display: inline-block; 
          padding: 12px 24px; 
          background: #007bff; 
          color: white; 
          text-decoration: none; 
          border-radius: 4px; 
          margin: 20px 0;
        }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; font-size: 14px; color: #6c757d; }
      </style>
    `;

    switch (type) {
      case 'payment_failed':
        return `
          ${baseStyle}
          <div class="container">
            <div class="header">
              <h2>Payment Failed - Day ${data.dayNumber}</h2>
            </div>
            <div class="content urgency-${data.urgency}">
              <p>Dear ${data.clientName},</p>
              <p>We were unable to process your payment of <strong>${data.amount}</strong> for subscription <code>${data.subscriptionId}</code>.</p>
              <p>This happened <strong>${data.dayNumber} day(s) ago</strong>. Please update your payment method to avoid service interruption.</p>
              ${data.graceDays > 0 ? `<p><em>You have ${data.graceDays} grace days remaining.</em></p>` : ''}
              <a href="#" class="cta-button">Update Payment Method</a>
              <p>If you have any questions, please contact our support team.</p>
            </div>
            <div class="footer">
              <p>This is an automated message from Panel1. Please do not reply directly to this email.</p>
            </div>
          </div>
        `;

      case 'gentle_reminder':
        return `
          ${baseStyle}
          <div class="container">
            <div class="header">
              <h2>Gentle Payment Reminder</h2>
            </div>
            <div class="content">
              <p>Dear ${data.clientName},</p>
              <p>We hope you're doing well! We noticed that your payment of <strong>${data.amount}</strong> needs attention.</p>
              <p>There's no rush - please update your payment method when it's convenient for you.</p>
              <a href="#" class="cta-button">Update Payment Method</a>
              <p>Thank you for being a valued customer!</p>
            </div>
            <div class="footer">
              <p>This is an automated message from Panel1. Please do not reply directly to this email.</p>
            </div>
          </div>
        `;

      case 'grace_period':
        return `
          ${baseStyle}
          <div class="container">
            <div class="header">
              <h2>Grace Period Activated</h2>
            </div>
            <div class="content">
              <p>Dear ${data.clientName},</p>
              <p>We've activated a <strong>${data.graceDays}-day grace period</strong> for your subscription.</p>
              <p>Your service will continue uninterrupted while you update your payment method.</p>
              <p>Amount due: <strong>${data.amount}</strong></p>
              <a href="#" class="cta-button">Update Payment Method</a>
              <p>Thank you for your prompt attention to this matter.</p>
            </div>
            <div class="footer">
              <p>This is an automated message from Panel1. Please do not reply directly to this email.</p>
            </div>
          </div>
        `;

      case 'suspension':
        return `
          ${baseStyle}
          <div class="container">
            <div class="header">
              <h2>Service Suspended</h2>
            </div>
            <div class="content urgency-high">
              <p>Dear ${data.clientName},</p>
              <p>Your subscription has been <strong>suspended</strong> due to failed payment.</p>
              <p>Amount due: <strong>${data.amount}</strong></p>
              <p>To restore your service immediately, please update your payment method.</p>
              <a href="#" class="cta-button">Restore Service</a>
              <p>Contact our support team if you need assistance.</p>
            </div>
            <div class="footer">
              <p>This is an automated message from Panel1. Please do not reply directly to this email.</p>
            </div>
          </div>
        `;

      case 'cancellation':
        return `
          ${baseStyle}
          <div class="container">
            <div class="header">
              <h2>Subscription Cancelled</h2>
            </div>
            <div class="content">
              <p>Dear ${data.clientName},</p>
              <p>Your subscription has been cancelled due to non-payment.</p>
              <p>We're sorry to see you go. If you'd like to reactivate your service, please contact us.</p>
              <a href="#" class="cta-button">Contact Support</a>
              <p>Thank you for the time you spent with us.</p>
            </div>
            <div class="footer">
              <p>This is an automated message from Panel1. Please do not reply directly to this email.</p>
            </div>
          </div>
        `;

      default:
        return `<p>Default email template</p>`;
    }
  }

  private static formatCurrency(amount: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  }
} 