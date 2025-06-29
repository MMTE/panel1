import { db } from '../../db';
import { 
  subscriptions, 
  dunningAttempts, 
  clients, 
  users,
  NewDunningAttempt 
} from '../../db/schema';
import { eq, and, lte, isNull } from 'drizzle-orm';

export interface DunningStrategy {
  name: string;
  attempts: DunningAttempt[];
}

export interface DunningAttempt {
  dayOffset: number; // Days after failed payment
  action: 'email_reminder' | 'grace_period' | 'suspension' | 'cancellation';
  template?: string;
  metadata?: Record<string, any>;
}

export class DunningManager {
  private strategies: Map<string, DunningStrategy> = new Map();

  constructor() {
    this.initializeDefaultStrategies();
  }

  private initializeDefaultStrategies(): void {
    // Default dunning strategy
    const defaultStrategy: DunningStrategy = {
      name: 'default',
      attempts: [
        { dayOffset: 1, action: 'email_reminder', template: 'payment_failed_day_1' },
        { dayOffset: 3, action: 'email_reminder', template: 'payment_failed_day_3' },
        { dayOffset: 7, action: 'email_reminder', template: 'payment_failed_day_7' },
        { dayOffset: 14, action: 'grace_period', metadata: { graceDays: 3 } },
        { dayOffset: 17, action: 'suspension' },
        { dayOffset: 30, action: 'cancellation' }
      ]
    };

    // Gentle dunning strategy
    const gentleStrategy: DunningStrategy = {
      name: 'gentle',
      attempts: [
        { dayOffset: 2, action: 'email_reminder', template: 'gentle_reminder_day_2' },
        { dayOffset: 7, action: 'email_reminder', template: 'gentle_reminder_day_7' },
        { dayOffset: 14, action: 'email_reminder', template: 'gentle_reminder_day_14' },
        { dayOffset: 21, action: 'grace_period', metadata: { graceDays: 7 } },
        { dayOffset: 28, action: 'suspension' },
        { dayOffset: 45, action: 'cancellation' }
      ]
    };

    // Aggressive dunning strategy
    const aggressiveStrategy: DunningStrategy = {
      name: 'aggressive',
      attempts: [
        { dayOffset: 0, action: 'email_reminder', template: 'immediate_payment_required' },
        { dayOffset: 1, action: 'email_reminder', template: 'urgent_payment_day_1' },
        { dayOffset: 3, action: 'email_reminder', template: 'urgent_payment_day_3' },
        { dayOffset: 5, action: 'grace_period', metadata: { graceDays: 2 } },
        { dayOffset: 7, action: 'suspension' },
        { dayOffset: 14, action: 'cancellation' }
      ]
    };

    this.strategies.set('default', defaultStrategy);
    this.strategies.set('gentle', gentleStrategy);
    this.strategies.set('aggressive', aggressiveStrategy);
  }

  async startDunningCampaign(subscriptionId: string, tenantId: string, strategyName: string = 'default'): Promise<void> {
    console.log(`🎯 Starting dunning campaign for subscription: ${subscriptionId}`);

    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      throw new Error(`Dunning strategy '${strategyName}' not found`);
    }

    const subscription = await this.getSubscription(subscriptionId, tenantId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Check if campaign already exists
    const existingCampaign = await this.getActiveDunningCampaign(subscriptionId, tenantId);
    if (existingCampaign) {
      console.log(`⚠️ Dunning campaign already active for subscription: ${subscriptionId}`);
      return;
    }

    // Schedule all dunning attempts
    const baseDate = subscription.pastDueDate || new Date();
    
    for (const attempt of strategy.attempts) {
      const scheduledAt = new Date(baseDate);
      scheduledAt.setDate(scheduledAt.getDate() + attempt.dayOffset);

      await this.scheduleDunningAttempt(subscriptionId, attempt, scheduledAt, tenantId);
    }

    console.log(`✅ Dunning campaign scheduled for subscription: ${subscriptionId}`);
  }

  async executeDunningAttempt(attemptId: string, tenantId: string): Promise<void> {
    console.log(`⚡ Executing dunning attempt: ${attemptId}`);

    const attempt = await this.getDunningAttempt(attemptId, tenantId);
    if (!attempt) {
      throw new Error('Dunning attempt not found');
    }

    const subscription = await this.getSubscription(attempt.subscriptionId, tenantId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    try {
      switch (attempt.campaignType) {
        case 'email_reminder':
          await this.executeEmailReminder(subscription, attempt);
          break;
        case 'grace_period':
          await this.executeGracePeriod(subscription, attempt);
          break;
        case 'suspension':
          await this.executeSuspension(subscription, attempt);
          break;
        case 'cancellation':
          await this.executeCancellation(subscription, attempt);
          break;
        default:
          throw new Error(`Unknown dunning action: ${attempt.campaignType}`);
      }

      // Mark attempt as completed
      await this.markDunningAttemptCompleted(attemptId, tenantId);

      console.log(`✅ Dunning attempt completed: ${attemptId}`);

    } catch (error) {
      console.error(`❌ Dunning attempt failed: ${attemptId}`, error);
      
      // Mark attempt as failed
      await this.markDunningAttemptFailed(attemptId, error instanceof Error ? error.message : 'Unknown error', tenantId);

      throw error;
    }
  }

  async processScheduledDunningAttempts(): Promise<void> {
    console.log('📧 Processing scheduled dunning attempts...');

    const now = new Date();
    const dueAttempts = await db
      .select()
      .from(dunningAttempts)
      .where(
        and(
          eq(dunningAttempts.status, 'pending'),
          lte(dunningAttempts.scheduledAt, now)
        )
      )
      .limit(50); // Process in batches

    console.log(`📊 Found ${dueAttempts.length} dunning attempts to process`);

    for (const attempt of dueAttempts) {
      try {
        await this.executeDunningAttempt(attempt.id, attempt.tenantId);
      } catch (error) {
        console.error(`❌ Failed to execute dunning attempt ${attempt.id}:`, error);
      }
    }
  }

  private async executeEmailReminder(subscription: any, attempt: any): Promise<void> {
    console.log(`📧 Sending email reminder for subscription: ${subscription.id}`);

    const client = await this.getClient(subscription.clientId);
    if (!client) {
      throw new Error('Client not found');
    }

    const template = attempt.metadata?.template || 'payment_failed_day_1';
    
    // Import DunningEmailService dynamically to avoid circular dependencies
    const { DunningEmailService } = await import('../dunning/DunningEmailService');
    
    // Email configuration for MailHog
    const emailConfig = {
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '1025'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER || 'test@panel1.dev',
        pass: process.env.SMTP_PASS || '',
      },
      from: process.env.SMTP_FROM || 'Panel1 <noreply@panel1.dev>',
    };

    try {
      // Send actual email if enabled, otherwise just log
      if (process.env.ENABLE_EMAIL_SENDING === 'true') {
        await DunningEmailService.sendDunningEmail(
          subscription,
          client,
          template as any,
          emailConfig,
          attempt.metadata
        );
      } else {
        console.log(`🎭 Email disabled: Would send '${template}' to ${client.user?.email}`);
      }
    } catch (error) {
      console.error(`❌ Failed to send dunning email: ${error}`);
      // Don't throw - log the error but continue with dunning process
    }
  }

  private async executeGracePeriod(subscription: any, attempt: any): Promise<void> {
    console.log(`⏳ Applying grace period for subscription: ${subscription.id}`);

    const graceDays = attempt.metadata?.graceDays || 3;
    const graceEndDate = new Date();
    graceEndDate.setDate(graceEndDate.getDate() + graceDays);

    // Update subscription with grace period
    await db
      .update(subscriptions)
      .set({
        metadata: {
          ...subscription.metadata,
          gracePeriodEnd: graceEndDate.toISOString(),
          gracePeriodReason: 'dunning_grace_period'
        },
        updatedAt: new Date()
      })
      .where(eq(subscriptions.id, subscription.id));

    // Send grace period notification
    const client = await this.getClient(subscription.clientId);
    if (client) {
      console.log(`📧 Would send grace period notification to ${client.user?.email}`);
    }
  }

  private async executeSuspension(subscription: any, attempt: any): Promise<void> {
    console.log(`⏸️ Suspending subscription: ${subscription.id}`);

    // Update subscription status
    await db
      .update(subscriptions)
      .set({
        status: 'PAUSED',
        suspendedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(subscriptions.id, subscription.id));

    // Send suspension notification
    const client = await this.getClient(subscription.clientId);
    if (client) {
      console.log(`📧 Would send suspension notification to ${client.user?.email}`);
    }
  }

  private async executeCancellation(subscription: any, attempt: any): Promise<void> {
    console.log(`🚫 Canceling subscription due to dunning: ${subscription.id}`);

    // Update subscription status
    await db
      .update(subscriptions)
      .set({
        status: 'CANCELLED',
        canceledAt: new Date(),
        cancellationReason: 'dunning_cancellation',
        updatedAt: new Date()
      })
      .where(eq(subscriptions.id, subscription.id));

    // Send cancellation notification
    const client = await this.getClient(subscription.clientId);
    if (client) {
      console.log(`📧 Would send cancellation notification to ${client.user?.email}`);
    }
  }

  private async scheduleDunningAttempt(
    subscriptionId: string,
    attempt: DunningAttempt,
    scheduledAt: Date,
    tenantId: string
  ): Promise<void> {
    const dunningAttempt: NewDunningAttempt = {
      subscriptionId,
      campaignType: attempt.action,
      attemptNumber: 1, // TODO: Implement proper attempt numbering
      status: 'pending',
      scheduledAt,
      metadata: attempt.metadata,
      tenantId,
    };

    await db.insert(dunningAttempts).values(dunningAttempt);
  }

  private async getDunningAttempt(attemptId: string, tenantId: string) {
    const [attempt] = await db
      .select()
      .from(dunningAttempts)
      .where(
        and(
          eq(dunningAttempts.id, attemptId),
          eq(dunningAttempts.tenantId, tenantId)
        )
      )
      .limit(1);

    return attempt || null;
  }

  private async getSubscription(subscriptionId: string, tenantId: string) {
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.id, subscriptionId),
          eq(subscriptions.tenantId, tenantId)
        )
      )
      .limit(1);

    return subscription || null;
  }

  private async getClient(clientId: string) {
    const [client] = await db
      .select({
        id: clients.id,
        companyName: clients.companyName,
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        }
      })
      .from(clients)
      .leftJoin(users, eq(clients.userId, users.id))
      .where(eq(clients.id, clientId))
      .limit(1);

    return client || null;
  }

  private async getActiveDunningCampaign(subscriptionId: string, tenantId: string) {
    const [campaign] = await db
      .select()
      .from(dunningAttempts)
      .where(
        and(
          eq(dunningAttempts.subscriptionId, subscriptionId),
          eq(dunningAttempts.tenantId, tenantId),
          eq(dunningAttempts.status, 'pending')
        )
      )
      .limit(1);

    return campaign || null;
  }

  private calculateDaysPastDue(subscription: any): number {
    if (!subscription.pastDueDate) return 0;
    const now = new Date();
    const pastDue = new Date(subscription.pastDueDate);
    return Math.floor((now.getTime() - pastDue.getTime()) / (1000 * 60 * 60 * 24));
  }

  private async markDunningAttemptCompleted(attemptId: string, tenantId: string): Promise<void> {
    await db
      .update(dunningAttempts)
      .set({
        status: 'completed',
        executedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(dunningAttempts.id, attemptId),
          eq(dunningAttempts.tenantId, tenantId)
        )
      );
  }

  private async markDunningAttemptFailed(attemptId: string, error: string, tenantId: string): Promise<void> {
    await db
      .update(dunningAttempts)
      .set({
        status: 'failed',
        errorMessage: error,
        executedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(dunningAttempts.id, attemptId),
          eq(dunningAttempts.tenantId, tenantId)
        )
      );
  }

  getStrategy(strategyName: string): DunningStrategy | undefined {
    return this.strategies.get(strategyName);
  }

  getAllStrategies(): DunningStrategy[] {
    return Array.from(this.strategies.values());
  }

  registerStrategy(strategy: DunningStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }
}

export const dunningManager = new DunningManager(); 