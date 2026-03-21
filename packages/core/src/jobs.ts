import { Queue, Worker, QueueEvents } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import type { ModuleJobOptions } from '@panel1/types';
import cron from 'node-cron';

export interface JobEntry {
  name: string;
  cron: string;
  handler: () => Promise<void>;
  moduleName: string;
  options?: ModuleJobOptions;
}

export interface JobSchedulerOptions {
  redis?: ConnectionOptions;
  /** BullMQ queue name for module cron jobs (default: panel1-module-jobs) */
  queueName?: string;
  defaultRetries?: number;
  defaultBackoffMs?: number;
  concurrency?: number;
  removeOnComplete?: number;
  removeOnFail?: number;
}

type JobData = { moduleName: string; jobName: string; manual?: boolean };

type ExecutionMetrics = {
  successCount: number;
  failureCount: number;
  lastRunAt?: Date;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  lastError?: string;
};

/**
 * Registers module cron jobs and executes them via BullMQ repeatable jobs when Redis is available,
 * or node-cron in-process when Redis is not configured.
 */
export class JobScheduler {
  private jobs: JobEntry[] = [];
  private options: JobSchedulerOptions = {};
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private queueEvents: QueueEvents | null = null;
  private cronTasks: cron.ScheduledTask[] = [];
  private started = false;
  private metrics = new Map<string, ExecutionMetrics>();

  constructor(options: JobSchedulerOptions = {}) {
    this.options = options;
  }

  private ensureMetrics(name: string): ExecutionMetrics {
    let m = this.metrics.get(name);
    if (!m) {
      m = { successCount: 0, failureCount: 0 };
      this.metrics.set(name, m);
    }
    return m;
  }

  register(
    name: string,
    cronExpr: string,
    handler: () => Promise<void>,
    moduleName: string,
    jobOptions?: ModuleJobOptions
  ): void {
    this.jobs.push({ name, cron: cronExpr, handler, moduleName, options: jobOptions });
  }

  list(): JobEntry[] {
    return [...this.jobs];
  }

  clear(): void {
    this.jobs = [];
    this.metrics.clear();
  }

  /**
   * Starts workers / cron schedules after all module setup() calls have registered jobs.
   */
  async start(): Promise<void> {
    if (this.started) return;

    const redis = this.options.redis;
    if (redis && this.jobs.length > 0) {
      const queueName = this.options.queueName ?? 'panel1-module-jobs';
      const defaultRetries = this.options.defaultRetries ?? 3;
      const defaultBackoffMs = this.options.defaultBackoffMs ?? 2000;
      const concurrency = this.options.concurrency ?? 3;

      this.queueEvents = new QueueEvents(queueName, { connection: redis });
      await this.queueEvents.waitUntilReady();

      this.queue = new Queue(queueName, {
        connection: redis,
        defaultJobOptions: {
          removeOnComplete: this.options.removeOnComplete ?? 50,
          removeOnFail: this.options.removeOnFail ?? 20,
          attempts: defaultRetries,
          backoff: { type: 'exponential', delay: defaultBackoffMs },
        },
      });

      for (const job of this.jobs) {
        const attempts = job.options?.maxRetries ?? defaultRetries;
        const backoffDelay = job.options?.backoffMs ?? defaultBackoffMs;
        await this.queue.add(
          job.name,
          { moduleName: job.moduleName, jobName: job.name } satisfies JobData,
          {
            repeat: { pattern: job.cron },
            jobId: `repeat-${job.name}`,
            attempts,
            backoff: { type: 'exponential', delay: backoffDelay },
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
        { connection: redis, concurrency }
      );

      this.worker.on('completed', (job) => {
        const name = job.name;
        const m = this.ensureMetrics(name);
        const now = new Date();
        m.lastRunAt = now;
        m.successCount += 1;
        m.lastSuccessAt = now;
        m.lastError = undefined;
      });

      this.worker.on('failed', (job, err) => {
        console.error(`[JobScheduler] Job ${job?.name} failed:`, err);
        if (!job) return;
        const name = job.name;
        const max = job.opts.attempts ?? 3;
        const now = new Date();
        const m = this.ensureMetrics(name);
        m.lastRunAt = now;
        if (job.attemptsMade >= max) {
          m.failureCount += 1;
          m.lastFailureAt = now;
          m.lastError = err instanceof Error ? err.message : String(err);
        }
      });

      await this.queue.waitUntilReady();
    } else if (this.jobs.length > 0) {
      for (const job of this.jobs) {
        const task = cron.schedule(
          job.cron,
          async () => {
            const m = this.ensureMetrics(job.name);
            const now = new Date();
            m.lastRunAt = now;
            try {
              await job.handler();
              m.successCount += 1;
              m.lastSuccessAt = now;
              m.lastError = undefined;
            } catch (e) {
              m.failureCount += 1;
              m.lastFailureAt = now;
              m.lastError = e instanceof Error ? e.message : String(e);
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

  /**
   * Runs a job immediately. Uses BullMQ when Redis is configured (same worker path as cron);
   * otherwise invokes the handler in-process.
   */
  async runNow(jobName: string): Promise<void> {
    const entry = this.jobs.find((j) => j.name === jobName);
    if (!entry) {
      throw new Error(`Job not registered: ${jobName}`);
    }

    if (this.options.redis) {
      if (!this.queue || !this.queueEvents) {
        throw new Error('[JobScheduler] start() must be called before runNow() when Redis is configured');
      }
    }

    if (this.queue && this.queueEvents) {
      const added = await this.queue.add(
        entry.name,
        { moduleName: entry.moduleName, jobName: entry.name, manual: true } satisfies JobData,
        {
          jobId: `manual-${entry.name}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        }
      );
      await added.waitUntilFinished(this.queueEvents);
      return;
    }

    const m = this.ensureMetrics(entry.name);
    const now = new Date();
    m.lastRunAt = now;
    try {
      await entry.handler();
      m.successCount += 1;
      m.lastSuccessAt = now;
      m.lastError = undefined;
    } catch (e) {
      m.failureCount += 1;
      m.lastFailureAt = now;
      m.lastError = e instanceof Error ? e.message : String(e);
      throw e;
    }
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

    await this.queueEvents?.close();
    this.queueEvents = null;

    this.started = false;
  }

  async listJobs(): Promise<
    Array<{
      name: string;
      cron: string;
      moduleName: string;
      successCount: number;
      failureCount: number;
      lastRunAt?: string;
      lastSuccessAt?: string;
      lastFailureAt?: string;
      lastError?: string;
      nextRunAt?: string;
    }>
  > {
    const repeatMeta = new Map<string, number>();
    if (this.queue) {
      const repeatable = await this.queue.getRepeatableJobs();
      for (const r of repeatable) {
        if (r.name && r.next) {
          repeatMeta.set(r.name, r.next);
        }
      }
    }

    return this.jobs.map((j) => {
      const m = this.metrics.get(j.name);
      const nextMs = repeatMeta.get(j.name);
      return {
        name: j.name,
        cron: j.cron,
        moduleName: j.moduleName,
        successCount: m?.successCount ?? 0,
        failureCount: m?.failureCount ?? 0,
        lastRunAt: m?.lastRunAt?.toISOString(),
        lastSuccessAt: m?.lastSuccessAt?.toISOString(),
        lastFailureAt: m?.lastFailureAt?.toISOString(),
        lastError: m?.lastError,
        nextRunAt: nextMs !== undefined ? new Date(nextMs).toISOString() : undefined,
      };
    });
  }
}
