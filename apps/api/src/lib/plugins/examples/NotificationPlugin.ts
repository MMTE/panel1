import { Plugin, PluginContext, type Panel1EventMap } from '@panel1/plugin-sdk';

interface NotificationConfig {
  channels: {
    email?: {
      enabled: boolean;
      from: string;
    };
    slack?: {
      enabled: boolean;
      webhookUrl: string;
    };
    sms?: {
      enabled: boolean;
      apiKey: string;
      from: string;
    };
  };
  templates: Record<string, {
    subject: string;
    body: string;
  }>;
}

interface NotificationContext {
  type: string;
  recipient: string;
  subject: string;
  body: string;
  metadata?: Record<string, any>;
}

export class NotificationPlugin implements Plugin {
  metadata = {
    name: 'notification-plugin',
    version: '0.1.0',
    description: 'Provides multi-channel notification capabilities',
    author: 'Panel1 Team',
    panel1: '>=0.1.0',
    permissions: ['notifications.send', 'notifications.configure'],
  };

  private notificationQueue: NotificationContext[] = [];
  private config: NotificationConfig | null = null;
  private processorInterval: NodeJS.Timeout | null = null;

  async onInstall(ctx: PluginContext) {
    ctx.logger.info('Installing notification plugin...');
    await ctx.createSettings({
      channels: {
        email: {
          enabled: true,
          from: process.env.NOTIFICATION_EMAIL_FROM || 'noreply@panel1.dev',
        },
        slack: {
          enabled: false,
          webhookUrl: '',
        },
        sms: {
          enabled: false,
          apiKey: '',
          from: '',
        },
      },
      templates: {},
    });
    ctx.logger.info('Notification plugin installed successfully');
  }

  async onEnable(ctx: PluginContext) {
    ctx.logger.info('Enabling notification plugin...');
    this.config = await ctx.getPluginConfig();
    this.startNotificationProcessor();
    ctx.logger.info('Notification plugin enabled');
  }

  async onDisable(ctx: PluginContext) {
    ctx.logger.info('Disabling notification plugin...');
    this.stopNotificationProcessor();
    ctx.logger.info('Notification plugin disabled');
  }

  async onUninstall(ctx: PluginContext) {
    ctx.logger.info('Uninstalling notification plugin...');
    this.stopNotificationProcessor();
    await ctx.deleteSettings();
    ctx.logger.info('Notification plugin uninstalled');
  }

  hooks = {
    'user.created': async ({ user, context }: Parameters<Panel1EventMap['user.created']>[0]) => {
      await this.queueNotification({
        type: 'email',
        recipient: user.email,
        subject: 'Welcome to Panel1',
        body: `Welcome ${user.firstName}! Your account has been created successfully.`,
        metadata: { userId: user.id }
      });
    },

    'subscription.created': async ({ subscription, context }: Parameters<Panel1EventMap['subscription.created']>[0]) => {
      await this.queueNotification({
        type: 'email',
        recipient: subscription.user.email,
        subject: 'Subscription Activated',
        body: `Your subscription has been activated successfully.`,
        metadata: { subscriptionId: subscription.id }
      });
    },

    'invoice.paid': async ({ invoice, context }: Parameters<Panel1EventMap['invoice.paid']>[0]) => {
      await this.queueNotification({
        type: 'email',
        recipient: invoice.client.email,
        subject: 'Payment Received',
        body: `We've received your payment for invoice #${invoice.number}.`,
        metadata: { invoiceId: invoice.id }
      });
    }
  };

  private startNotificationProcessor() {
    if (this.processorInterval) return;
    
    this.processorInterval = setInterval(() => {
      this.processNotificationQueue().catch(console.error);
    }, 5000); // Process every 5 seconds
  }

  private stopNotificationProcessor() {
    if (this.processorInterval) {
      clearInterval(this.processorInterval);
      this.processorInterval = null;
    }
  }

  private async processNotificationQueue() {
    while (this.notificationQueue.length > 0) {
      const notification = this.notificationQueue.shift();
      if (!notification) continue;

      try {
        // Here you would implement the actual sending logic
        console.log('Processing notification:', notification);
      } catch (error) {
        console.error('Failed to process notification:', error);
        // Could implement retry logic here
      }
    }
  }

  private async queueNotification(notification: NotificationContext) {
    this.notificationQueue.push(notification);
  }
} 