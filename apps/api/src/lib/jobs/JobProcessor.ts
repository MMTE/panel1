import { Worker, Job } from 'bullmq';
import { operationalQueues } from './OperationalQueues';
import { SubscriptionRenewalProcessor } from './processors/SubscriptionRenewalProcessor';
import { subscriptionService } from '../subscription/SubscriptionService';
import { dunningManager } from '../subscription/DunningManager';

export class JobProcessor {
  private static instance: JobProcessor;
  private initialized = false;

  private constructor() {}

  static getInstance(): JobProcessor {
    if (!JobProcessor.instance) {
      JobProcessor.instance = new JobProcessor();
    }
    return JobProcessor.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('🔄 Initializing Job Processors...');

    try {
      await operationalQueues.initialize();

      const hasRedis = operationalQueues && (operationalQueues as any).queues?.size > 0;

      if (hasRedis) {
        this.registerSubscriptionRenewalProcessor();
        this.registerInvoiceGenerationProcessor();
        this.registerPaymentRetryProcessor();
        this.registerDunningManagementProcessor();
        console.log('✅ Job Processors initialized with Redis queues');
      } else {
        console.log('⚠️ Job Processors initialized in fallback mode (cron-only)');
      }

      this.initialized = true;
      console.log('✅ Job Processors initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Job Processors:', error);
      throw error;
    }
  }

  private registerSubscriptionRenewalProcessor(): void {
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
    };

    const worker = new Worker('subscription-renewal', async (job: Job) => {
      console.log(`🔄 Processing subscription renewal job: ${job.id}`);
      
      try {
        const { subscriptionId } = job.data.payload;
        const { tenantId } = job.data;

        const result = await subscriptionService.processRenewal(subscriptionId, tenantId);
        
        if (!result.success) {
          throw new Error(result.error || 'Renewal failed');
        }

        // Mark job as completed in database
        await this.markJobCompleted(job.data.jobId);
        
        console.log(`✅ Subscription renewal job completed: ${job.id}`);
        return result;
      } catch (error) {
        // Mark job as failed in database
        await this.markJobFailed(job.data.jobId, error instanceof Error ? error.message : 'Unknown error');
        
        console.error(`❌ Subscription renewal job failed: ${job.id}`, error);
        throw error;
      }
    }, {
      connection: redisConfig,
      concurrency: 5,
    });

    worker.on('completed', (job) => {
      console.log(`✅ Job ${job.id} completed in subscription-renewal queue`);
    });

    worker.on('failed', (job, err) => {
      console.error(`❌ Job ${job?.id} failed in subscription-renewal queue:`, err);
    });

    worker.on('active', (job) => {
      console.log(`🔄 Job ${job.id} started in subscription-renewal queue`);
      this.markJobStarted(job.data.jobId);
    });

    operationalQueues.workers.set('subscription-renewal', worker);

    console.log('✅ Subscription renewal processor registered');
  }

  private registerInvoiceGenerationProcessor(): void {
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
    };

    const worker = new Worker('invoice-generation', async (job: Job) => {
      console.log(`🔄 Processing invoice generation job: ${job.id}`);
      
      try {
        const { subscriptionId, type } = job.data.payload;
        const { tenantId } = job.data;

        // TODO: Implement InvoiceService integration
        console.log(`📄 Would generate ${type} invoice for subscription: ${subscriptionId}`);

        await this.markJobCompleted(job.data.jobId);
        console.log(`✅ Invoice generation job completed: ${job.id}`);
        return { success: true };
      } catch (error) {
        await this.markJobFailed(job.data.jobId, error instanceof Error ? error.message : 'Unknown error');
        console.error(`❌ Invoice generation job failed: ${job.id}`, error);
        throw error;
      }
    }, {
      connection: redisConfig,
      concurrency: 3,
    });

    operationalQueues.workers.set('invoice-generation', worker);

    console.log('✅ Invoice generation processor registered');
  }

  private registerPaymentRetryProcessor(): void {
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
    };

    const worker = new Worker('payment-retry', async (job: Job) => {
      console.log(`🔄 Processing payment retry job: ${job.id}`);
      
      try {
        const { paymentId } = job.data.payload;
        const { tenantId, attemptNumber } = job.data;

        // TODO: Implement PaymentService integration
        console.log(`💳 Would retry payment ${paymentId} (attempt ${attemptNumber})`);

        await this.markJobCompleted(job.data.jobId);
        console.log(`✅ Payment retry job completed: ${job.id}`);
        return { success: true };
      } catch (error) {
        await this.markJobFailed(job.data.jobId, error instanceof Error ? error.message : 'Unknown error');
        console.error(`❌ Payment retry job failed: ${job.id}`, error);
        throw error;
      }
    }, {
      connection: redisConfig,
      concurrency: 3,
    });

    worker.on('completed', (job) => {
      console.log(`✅ Payment retry job ${job.id} completed successfully`);
    });

    worker.on('failed', (job, err) => {
      console.error(`❌ Payment retry job ${job?.id} failed:`, err);
    });

    worker.on('active', (job) => {
      console.log(`🔄 Payment retry job ${job.id} started`);
      this.markJobStarted(job.data.jobId);
    });

    operationalQueues.workers.set('payment-retry', worker);

    console.log('✅ Payment retry processor registered');
  }

  private registerDunningManagementProcessor(): void {
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
    };

    const worker = new Worker('dunning-management', async (job: Job) => {
      console.log(`🔄 Processing dunning management job: ${job.id}`);
      
      try {
        const { type } = job.data;
        const { tenantId } = job.data;

        if (type === 'DUNNING_CAMPAIGN') {
          const { subscriptionId } = job.data.payload;
          await dunningManager.startDunningCampaign(subscriptionId, tenantId);
        } else if (type === 'DUNNING_ATTEMPT') {
          const { attemptId } = job.data.payload;
          await dunningManager.executeDunningAttempt(attemptId, tenantId);
        }

        await this.markJobCompleted(job.data.jobId);
        console.log(`✅ Dunning management job completed: ${job.id}`);
        return { success: true };
      } catch (error) {
        await this.markJobFailed(job.data.jobId, error instanceof Error ? error.message : 'Unknown error');
        console.error(`❌ Dunning management job failed: ${job.id}`, error);
        throw error;
      }
    }, {
      connection: redisConfig,
      concurrency: 2,
    });

    worker.on('completed', (job) => {
      console.log(`✅ Dunning management job ${job.id} completed successfully`);
    });

    worker.on('failed', (job, err) => {
      console.error(`❌ Dunning management job ${job?.id} failed:`, err);
    });

    worker.on('active', (job) => {
      console.log(`🔄 Dunning management job ${job.id} started`);
      this.markJobStarted(job.data.jobId);
    });

    operationalQueues.workers.set('dunning-management', worker);

    console.log('✅ Dunning management processor registered');
  }

  async getJobStats(): Promise<Record<string, any>> {
    return await operationalQueues.getQueueStats();
  }

  private async markJobStarted(jobId: string): Promise<void> {
    try {
      const { db } = await import('../../db');
      const { scheduledJobs } = await import('../../db/schema');
      const { eq } = await import('drizzle-orm');
      
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
    if (!jobId) return;
    try {
      const { db } = await import('../../db');
      const { scheduledJobs } = await import('../../db/schema');
      const { eq } = await import('drizzle-orm');
      
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
      const { db } = await import('../../db');
      const { scheduledJobs } = await import('../../db/schema');
      const { eq } = await import('drizzle-orm');
      
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

  async shutdown(): Promise<void> {
    console.log('🔄 Shutting down Job Processors...');
    
    await operationalQueues.shutdown();
    
    this.initialized = false;
    console.log('✅ Job Processors shut down successfully');
  }
}

export const jobProcessor = JobProcessor.getInstance(); 