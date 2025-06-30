import { BasePlugin } from '../BasePlugin';
import { PluginContext, PluginMetadata } from '@panel1/plugin-sdk';
import { z } from 'zod';

interface NotificationPluginConfig {
  defaultChannel: string;
  channels: {
    email?: {
      host: string;
      port: number;
      secure: boolean;
      auth: {
        user: string;
        pass: string;
      };
    };
    slack?: {
      webhookUrl: string;
      defaultChannel: string;
    };
    discord?: {
      webhookUrl: string;
    };
  };
}

export class NotificationPlugin extends BasePlugin {
  constructor(metadata: PluginMetadata) {
    super(metadata);
  }

  protected async onInitialize(ctx: PluginContext): Promise<void> {
    // Register extension points
    this.registerExtensionPoint({
      name: 'notification.send',
      description: 'Send a notification through configured channels',
      schema: z.object({
        channel: z.enum(['email', 'slack', 'discord']).optional(),
        to: z.string(),
        subject: z.string(),
        message: z.string(),
        priority: z.enum(['low', 'normal', 'high']).optional(),
        metadata: z.record(z.any()).optional(),
      }),
    });

    // Register hooks
    this.registerHook('notification.sent', this.handleNotificationSent.bind(this));
    this.registerHook('notification.failed', this.handleNotificationFailed.bind(this));
  }

  protected async onDestroy(): Promise<void> {
    // Cleanup any resources
  }

  private async handleNotificationSent(notification: any): Promise<void> {
    this.logger.info('Notification sent successfully', { notification });
  }

  private async handleNotificationFailed(error: Error, notification: any): Promise<void> {
    this.logger.error('Failed to send notification', { error, notification });
  }
} 