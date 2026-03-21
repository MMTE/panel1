import { Queue, Worker } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import cron from 'node-cron';

export interface JobEntry {
  name: string;
  cron: string;
  handler: () => Promise<void>;
  moduleName: string;
}

export interface JobSchedulerOptions {
  redis?: ConnectionOptions;
  /** BullMQ queue name for module cron jobs (default: panel1-module-jobs) */
  queueName?: string;
}

/**
 * Registers module cron jobs and executes them via BullMQ repeatable jobs when Redis is available,
 * or node-cron in-process when Redis is not configured.
 */
export class JobScheduler {
  private jobs: JobEntry[] = [];
  private options: JobSchedulerOptions = {};
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private cronTasks: cron.ScheduledTask[] = [];
  private started = false;

  constructor(options: JobSchedulerOptions = {}) {
    this.options = options;
  }

  register(name: string, cronExpr: string, handler: () => Promise<void>, moduleName: string): void {
    this.jobs.push({ name, cron: cronExpr, handler, moduleName });
  }

  list(): JobEntry[] {
    return [...this.jobs];
  }

  clear(): void {
    this.jobs = [];
  }

  /**
   * Starts workers / cron schedules after all module setup() calls have registered jobs.
   */
  async start(): Promise<void> {
    if (this.started) return;

    const redis = this.options.redis;
    if (redis && this.jobs.length > 0) {
      const queueName = this.options.queueName ?? 'panel1-module-jobs';

      this.queue = new Queue(queueName, {
        connection: redis,
        defaultJobOptions: {
          removeOnComplete: 50,
          removeOnFail: 20,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      });

      for (const job of this.jobs) {
        await this.queue.add(
          job.name,
          { moduleName: job.moduleName, jobName: job.name },
          {
            repeat: { pattern: job.cron },
            jobId: `repeat-${job.name}`,
          }
        );
      }

      this.worker = new Worker(
        queueName,
        async (bullJob) => {
          const name = bullJob.name;
          const entry = this.jobs.find((j) => j.name === name);
          if (!entry) {
            console.error(`[JobScheduler] No handler registered for job name: ${name}`);
            return;
          }
          await entry.handler();
        },
        { connection: redis, concurrency: 3 }
      );

      this.worker.on('failed', (job, err) => {
        console.error(`[JobScheduler] Job ${job?.name} failed:`, err);
      });

      await this.queue.waitUntilReady();
    } else if (this.jobs.length > 0) {
      for (const job of this.jobs) {
        const task = cron.schedule(
          job.cron,
          async () => {
            try {
              await job.handler();
            } catch (e) {
              console.error(`[JobScheduler] Cron job "${job.name}" failed:`, e);
            }
          },
          { timezone: 'UTC' }
        );
        this.cronTasks.push(task);
      }
    }

    this.started = true;
  }

  async runNow(jobName: string): Promise<void> {
    const entry = this.jobs.find((j) => j.name === jobName);
    if (!entry) {
      throw new Error(`Job not registered: ${jobName}`);
    }
    await entry.handler();
  }

  async stop(): Promise<void> {
    for (const t of this.cronTasks) {
      t.stop();
    }
    this.cronTasks = [];

    await this.worker?.close();
    this.worker = null;

    if (this.queue) {
      const repeatable = await this.queue.getRepeatableJobs();
      for (const r of repeatable) {
        await this.queue.removeRepeatableByKey(r.key);
      }
      await this.queue.close();
      this.queue = null;
    }

    this.started = false;
  }

  async listJobs(): Promise<
    Array<{
      name: string;
      cron: string;
      moduleName: string;
    }>
  > {
    return this.jobs.map((j) => ({ name: j.name, cron: j.cron, moduleName: j.moduleName }));
  }
}
