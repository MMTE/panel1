import { Queue, Worker, Job } from 'bullmq';
import cron from 'node-cron';
import { db } from '../../db';
import { subscriptions, scheduledJobs, payments, dunningAttempts } from '../../db/schema';
import { eq, and, lte, gte, isNull, lt } from 'drizzle-orm';

export interface JobData {
  type: string;
  payload: any;
  tenantId: string;
  attemptNumber?: number;
  maxAttempts?: number;
}

export class JobScheduler {
  private static instance: JobScheduler;
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private initialized = false;
  
  private redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  };

  private constructor() {}

  static getInstance(): JobScheduler {
    if (!JobScheduler.instance) {
      JobScheduler.instance = new JobScheduler();
    }
    return JobScheduler.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('🔄 Initializing Job Scheduler...');

    try {
      // Test Redis connection first
      await this.testRedisConnection();
      
      // Initialize job queues
      this.createQueue('subscription-renewal');
      this.createQueue('invoice-generation');
      this.createQueue('payment-retry');
      this.createQueue('dunning-management');
      
      // Provisioning queues
      this.createQueue('provisioning-provision');
      this.createQueue('provisioning-suspend');
      this.createQueue('provisioning-unsuspend');
      this.createQueue('provisioning-terminate');
      this.createQueue('provisioning-modify');
      this.createQueue('provisioning-sync');
      this.createQueue('provisioning-health-check');
      
      // Setup cron jobs
      this.setupCronJobs();
      
      this.initialized = true;
      console.log('✅ Job Scheduler initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Job Scheduler:', error);
      console.error('💡 Make sure Redis is running: redis-server');
      console.error('💡 Or install Redis: sudo apt install redis-server (Ubuntu) or brew install redis (macOS)');
      
      // Don't throw error - allow system to continue without job scheduling
      console.log('⚠️ Job Scheduler will run in fallback mode (cron only)');
      this.setupCronJobs();
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
    
    // Add error handling
    queue.on('error', (error) => {
      console.error(`Queue ${queueName} error:`, error);
    });
    
    this.queues.set(queueName, queue);
    return queue;
  }

  private setupCronJobs(): void {
    // Daily: Check for subscription renewals (runs at 1 AM)
    cron.schedule('0 1 * * *', async () => {
      console.log('🔄 Running daily subscription renewal check');
      try {
        await this.scheduleSubscriptionRenewals();
      } catch (error) {
        console.error('❌ Daily renewal check failed:', error);
      }
    }, {
      timezone: 'UTC'
    });

    // Hourly: Process failed payments
    cron.schedule('0 * * * *', async () => {
      console.log('🔄 Running hourly failed payment processing');
      try {
        await this.processFailedPayments();
      } catch (error) {
        console.error('❌ Failed payment processing failed:', error);
      }
    }, {
      timezone: 'UTC'
    });

    // Every 6 hours: Dunning management
    cron.schedule('0 */6 * * *', async () => {
      console.log('🔄 Running dunning management');
      try {
        await this.processDunningCampaigns();
      } catch (error) {
        console.error('❌ Dunning management failed:', error);
      }
    }, {
      timezone: 'UTC'
    });

    // Every 30 minutes: Process scheduled jobs
    cron.schedule('*/30 * * * *', async () => {
      console.log('🔄 Processing scheduled jobs');
      try {
        await this.processScheduledJobs();
      } catch (error) {
        console.error('❌ Scheduled job processing failed:', error);
      }
    }, {
      timezone: 'UTC'
    });

    console.log('⏰ Cron jobs scheduled successfully');
  }

  async addJob(queueName: string, jobData: JobData, options: any = {}): Promise<string> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    // Create job record in database
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

    // Add job to queue with database ID
    await queue.add(jobData.type, {
      ...jobData,
      jobId: jobRecord.id,
    }, {
      attempts: jobData.maxAttempts || 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      delay: options.delay || 0,
      ...options
    });

    return jobRecord.id;
  }

  async scheduleSubscriptionRenewals(): Promise<void> {
    console.log('📅 Checking for subscriptions due for renewal...');

    // Get subscriptions due for renewal in next 24 hours
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

    // Get payments that failed and haven't exceeded max retry attempts
    const failedPayments = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.status, 'FAILED'),
          lt(payments.attemptCount, 5) // Max 5 attempts
        )
      );

    console.log(`📊 Found ${failedPayments.length} failed payments to retry`);
    
    for (const payment of failedPayments) {
      try {
        // Calculate delay based on attempt number (exponential backoff)
        const delayMinutes = Math.pow(2, payment.attemptCount) * 60; // 1h, 2h, 4h, 8h, 16h
        const delay = delayMinutes * 60 * 1000; // Convert to milliseconds

        await this.addJob('payment-retry', {
          type: 'PAYMENT_RETRY',
          payload: { paymentId: payment.id },
          tenantId: payment.tenantId!,
          attemptNumber: payment.attemptCount + 1,
          maxAttempts: 5,
        }, { delay });
        
        console.log(`✅ Scheduled payment retry for payment: ${payment.id} (attempt ${payment.attemptCount + 1})`);
      } catch (error) {
        console.error(`❌ Failed to schedule payment retry for payment ${payment.id}:`, error);
      }
    }
  }

  async processDunningCampaigns(): Promise<void> {
    console.log('📧 Processing dunning campaigns...');

    // Get subscriptions that are past due and need dunning management
    const pastDueSubscriptions = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.status, 'PAST_DUE'),
          isNull(subscriptions.canceledAt)
        )
      );

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
      .where(
        and(
          eq(scheduledJobs.status, 'pending'),
          lte(scheduledJobs.scheduledAt, now)
        )
      )
      .limit(50); // Process in batches

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
        console.error(`❌ Failed to process scheduled job ${job.id}:`, error);
        await this.markJobFailed(job.id, error.message);
      }
    }
  }

  private async markJobStarted(jobId: string): Promise<void> {
    try {
      await db
        .update(scheduledJobs)
        .set({
          status: 'running',
          startedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(scheduledJobs.id, jobId));
    } catch (error) {
      console.error(`Failed to mark job ${jobId} as started:`, error);
    }
  }

  private async markJobCompleted(jobId: string): Promise<void> {
    try {
      await db
        .update(scheduledJobs)
        .set({
          status: 'completed',
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(scheduledJobs.id, jobId));
    } catch (error) {
      console.error(`Failed to mark job ${jobId} as completed:`, error);
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
    console.log('🔄 Shutting down Job Scheduler...');
    
    // Close workers first
    for (const [workerName, worker] of this.workers) {
      await worker.close();
      console.log(`✅ Worker ${workerName} closed`);
    }
    
    // Then close queues
    for (const [queueName, queue] of this.queues) {
      await queue.close();
      console.log(`✅ Queue ${queueName} closed`);
    }
    
    this.initialized = false;
    console.log('✅ Job Scheduler shut down successfully');
  }
}

export const jobScheduler = JobScheduler.getInstance(); 