import { Queue, Worker } from 'bullmq';
import { db } from '../../db';
import { subscriptions, scheduledJobs, payments } from '../../db/schema';
import { eq, and, lte, isNull, lt } from 'drizzle-orm';

/**
 * Legacy operational BullMQ queues (subscription renewal, invoicing, provisioning, etc.).
 * Cron schedules for enqueueing work are registered on the core `@panel1/core` JobScheduler via `legacyBridge.ts`.
 */
export interface JobData {
  type: string;
  payload: any;
  tenantId: string;
  attemptNumber?: number;
  maxAttempts?: number;
}

export class OperationalQueues {
  private static instance: OperationalQueues;
  private queues: Map<string, Queue> = new Map();
  /** Workers registered by JobProcessor (legacy processors). */
  workers = new Map<string, Worker>();
  private initialized = false;

  private redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  };

  private constructor() {}

  static getInstance(): OperationalQueues {
    if (!OperationalQueues.instance) {
      OperationalQueues.instance = new OperationalQueues();
    }
    return OperationalQueues.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('🔄 Initializing operational BullMQ queues...');

    try {
      await this.testRedisConnection();

      this.createQueue('subscription-renewal');
      this.createQueue('invoice-generation');
      this.createQueue('payment-retry');
      this.createQueue('dunning-management');

      this.createQueue('provisioning-provision');
      this.createQueue('provisioning-suspend');
      this.createQueue('provisioning-unsuspend');
      this.createQueue('provisioning-terminate');
      this.createQueue('provisioning-modify');
      this.createQueue('provisioning-sync');
      this.createQueue('provisioning-health-check');

      this.initialized = true;
      console.log('✅ Operational queues initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize operational queues:', error);
      console.error('💡 Ensure Redis is running for background jobs.');
      console.log('⚠️ Operational queues unavailable — renewal/invoice workers may not run.');
      this.initialized = true;
    }
  }

  private async testRedisConnection(): Promise<void> {
    const { createClient } = await import('redis');
    const client = createClient({
      socket: {
        host: this.redisConfig.host,
        port: this.redisConfig.port,
      },
      password: this.redisConfig.password,
    });

    try {
      await client.connect();
      await client.ping();
      await client.disconnect();
      console.log('✅ Redis connection successful');
    } catch (error) {
      throw new Error(`Redis connection failed: ${error}`);
    }
  }

  private createQueue(queueName: string): Queue {
    const queue = new Queue(queueName, {
      connection: this.redisConfig,
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 5,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    queue.on('error', (error) => {
      console.error(`Queue ${queueName} error:`, error);
    });

    this.queues.set(queueName, queue);
    return queue;
  }

  async addJob(queueName: string, jobData: JobData, options: any = {}): Promise<string> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const [jobRecord] = await db
      .insert(scheduledJobs)
      .values({
        jobType: jobData.type,
        queueName,
        payload: jobData.payload,
        status: 'pending',
        scheduledAt: new Date(),
        attemptNumber: jobData.attemptNumber || 1,
        maxAttempts: jobData.maxAttempts || 3,
        tenantId: jobData.tenantId,
      })
      .returning();

    await queue.add(
      jobData.type,
      {
        ...jobData,
        jobId: jobRecord.id,
      },
      {
        attempts: jobData.maxAttempts || 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        delay: options.delay || 0,
        ...options,
      }
    );

    return jobRecord.id;
  }

  async scheduleSubscriptionRenewals(): Promise<void> {
    console.log('📅 Checking for subscriptions due for renewal...');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);

    const subscriptionsDue = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.status, 'ACTIVE'),
          lte(subscriptions.nextBillingDate, tomorrow),
          isNull(subscriptions.canceledAt)
        )
      );

    console.log(`📊 Found ${subscriptionsDue.length} subscriptions due for renewal`);

    for (const subscription of subscriptionsDue) {
      try {
        await this.addJob('subscription-renewal', {
          type: 'SUBSCRIPTION_RENEWAL',
          payload: { subscriptionId: subscription.id },
          tenantId: subscription.tenantId!,
        });

        console.log(`✅ Scheduled renewal for subscription: ${subscription.id}`);
      } catch (error) {
        console.error(`❌ Failed to schedule renewal for subscription ${subscription.id}:`, error);
      }
    }
  }

  async processFailedPayments(): Promise<void> {
    console.log('💳 Processing failed payments...');

    const failedPayments = await db
      .select()
      .from(payments)
      .where(and(eq(payments.status, 'FAILED'), lt(payments.attemptCount, 5)));

    console.log(`📊 Found ${failedPayments.length} failed payments to retry`);

    for (const payment of failedPayments) {
      try {
        const delayMinutes = Math.pow(2, payment.attemptCount) * 60;
        const delay = delayMinutes * 60 * 1000;

        await this.addJob(
          'payment-retry',
          {
            type: 'PAYMENT_RETRY',
            payload: { paymentId: payment.id },
            tenantId: payment.tenantId!,
            attemptNumber: payment.attemptCount + 1,
            maxAttempts: 5,
          },
          { delay }
        );

        console.log(`✅ Scheduled payment retry for payment: ${payment.id} (attempt ${payment.attemptCount + 1})`);
      } catch (error) {
        console.error(`❌ Failed to schedule payment retry for payment ${payment.id}:`, error);
      }
    }
  }

  async processDunningCampaigns(): Promise<void> {
    console.log('📧 Processing dunning campaigns...');

    const pastDueSubscriptions = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.status, 'PAST_DUE'), isNull(subscriptions.canceledAt)));

    console.log(`📊 Found ${pastDueSubscriptions.length} past due subscriptions`);

    for (const subscription of pastDueSubscriptions) {
      try {
        await this.addJob('dunning-management', {
          type: 'DUNNING_CAMPAIGN',
          payload: { subscriptionId: subscription.id },
          tenantId: subscription.tenantId!,
        });

        console.log(`✅ Scheduled dunning campaign for subscription: ${subscription.id}`);
      } catch (error) {
        console.error(`❌ Failed to schedule dunning campaign for subscription ${subscription.id}:`, error);
      }
    }
  }

  async processScheduledJobs(): Promise<void> {
    console.log('⏰ Processing scheduled jobs...');

    const now = new Date();
    const overdueJobs = await db
      .select()
      .from(scheduledJobs)
      .where(and(eq(scheduledJobs.status, 'pending'), lte(scheduledJobs.scheduledAt, now)))
      .limit(50);

    console.log(`📊 Found ${overdueJobs.length} overdue jobs to process`);

    for (const job of overdueJobs) {
      try {
        const queue = this.queues.get(job.queueName);
        if (!queue) {
          console.error(`❌ Queue ${job.queueName} not found for job ${job.id}`);
          continue;
        }

        await queue.add(job.jobType, {
          type: job.jobType,
          payload: job.payload,
          tenantId: job.tenantId,
          jobId: job.id,
        });

        console.log(`✅ Processed scheduled job: ${job.id}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`❌ Failed to process scheduled job ${job.id}:`, error);
        await this.markJobFailed(job.id, msg);
      }
    }
  }

  private async markJobFailed(jobId: string, errorMessage: string): Promise<void> {
    try {
      await db
        .update(scheduledJobs)
        .set({
          status: 'failed',
          failedAt: new Date(),
          errorMessage,
          updatedAt: new Date(),
        })
        .where(eq(scheduledJobs.id, jobId));
    } catch (error) {
      console.error(`Failed to mark job ${jobId} as failed:`, error);
    }
  }

  async getQueueStats(): Promise<Record<string, any>> {
    const stats: Record<string, any> = {};

    for (const [queueName, queue] of this.queues) {
      const waiting = await queue.getWaiting();
      const active = await queue.getActive();
      const completed = await queue.getCompleted();
      const failed = await queue.getFailed();

      stats[queueName] = {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
      };
    }

    return stats;
  }

  async shutdown(): Promise<void> {
    console.log('🔄 Shutting down operational queues...');

    for (const [, worker] of this.workers) {
      await worker.close();
    }

    for (const [, queue] of this.queues) {
      await queue.close();
    }

    this.initialized = false;
    console.log('✅ Operational queues shut down successfully');
  }
}

export const operationalQueues = OperationalQueues.getInstance();
