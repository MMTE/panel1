import type { EventHandler } from '@panel1/types';
import { Queue, Worker, QueueEvents } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';

/**
 * Pluggable DB outbox (implemented in host app with Drizzle, etc.).
 * When set with Redis, each emit inserts a row and the worker marks dispatched / dead.
 */
export interface EventOutboxPort {
  insertPending(event: string, payload: unknown): Promise<string>;
  markDispatched(id: string): Promise<void>;
  /** Intermediate failure before max retries (optional). */
  onAttemptFailed?(id: string, error: string, attempt: number): Promise<void>;
  markDead(id: string, error: string): Promise<void>;
}

export interface EventBusBullmqOptions {
  /** BullMQ job attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 2000) */
  backoffMs?: number;
  /** Worker concurrency (default: 10) */
  concurrency?: number;
  removeOnComplete?: number;
  removeOnFail?: number;
}

export interface EventBusOptions {
  /**
   * Legacy hook: called at the start of emit() before dispatch.
   * Prefer {@link EventOutboxPort} for durable tracking.
   */
  persistEvent?: (event: string, payload: unknown) => Promise<void>;
  /**
   * When set, emit() enqueues work and waits for the BullMQ worker to dispatch handlers.
   * When unset, handlers run in-process (used in tests and environments without Redis).
   */
  redis?: ConnectionOptions;
  /** BullMQ queue name (default: panel1-core-events) */
  queueName?: string;
  /** Fine-tune BullMQ worker / job options */
  bullmq?: EventBusBullmqOptions;
  /** Durable outbox: insert + status transitions (see roadmap issue 1.3) */
  outbox?: EventOutboxPort;
  /**
   * When true, a failing handler fails the BullMQ job (retries apply).
   * Default: true if `outbox` is set, else false (errors logged, emit still resolves).
   */
  strictHandlers?: boolean;
}

type HandlerEntry = { handler: EventHandler<string>; id: number };

type JobPayload = { eventName: string; payload: unknown; outboxId?: string };

export class EventBus {
  private subscribers = new Map<string, HandlerEntry[]>();
  private nextHandlerId = 1;
  private options: EventBusOptions;
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private queueEvents: QueueEvents | null = null;
  private started = false;

  constructor(options: EventBusOptions = {}) {
    this.options = options;
  }

  private get strictDispatch(): boolean {
    if (this.options.strictHandlers !== undefined) return this.options.strictHandlers;
    return Boolean(this.options.outbox);
  }

  on(event: string, handler: EventHandler<string>): void {
    const list = this.subscribers.get(event) || [];
    list.push({ handler, id: this.nextHandlerId++ });
    this.subscribers.set(event, list);
  }

  off(event: string, handler: EventHandler<string>): void {
    const list = this.subscribers.get(event);
    if (!list) return;
    const filtered = list.filter((e) => e.handler !== handler);
    if (filtered.length === 0) {
      this.subscribers.delete(event);
    } else {
      this.subscribers.set(event, filtered);
    }
  }

  /**
   * Must be called before any emit() when redis is configured.
   */
  async start(): Promise<void> {
    if (this.started) return;
    const redis = this.options.redis;
    if (!redis) {
      this.started = true;
      return;
    }

    const queueName = this.options.queueName ?? 'panel1-core-events';
    const bm = this.options.bullmq ?? {};
    const attempts = bm.maxRetries ?? 3;
    const backoffDelay = bm.backoffMs ?? 2000;
    const concurrency = bm.concurrency ?? 10;

    this.queueEvents = new QueueEvents(queueName, { connection: redis });
    await this.queueEvents.waitUntilReady();

    this.queue = new Queue(queueName, {
      connection: redis,
      defaultJobOptions: {
        removeOnComplete: bm.removeOnComplete ?? 500,
        removeOnFail: bm.removeOnFail ?? 100,
        attempts,
        backoff: { type: 'exponential', delay: backoffDelay },
      },
    });

    const outbox = this.options.outbox;

    this.worker = new Worker(
      queueName,
      async (job) => {
        const { eventName, payload, outboxId } = job.data as JobPayload;
        await this.dispatchInProcess(eventName, payload, { strict: this.strictDispatch });
        if (outboxId && outbox) {
          await outbox.markDispatched(outboxId);
        }
      },
      { connection: redis, concurrency }
    );

    this.worker.on('failed', async (job, err) => {
      console.error(`[EventBus] Worker job failed: ${job?.id}`, err);
      if (!job?.data || !outbox) return;
      const { outboxId } = job.data as JobPayload;
      if (!outboxId) return;
      const max = job.opts.attempts ?? 3;
      const msg = err instanceof Error ? err.message : String(err);
      if (job.attemptsMade >= max) {
        await outbox.markDead(outboxId, msg);
      } else if (outbox.onAttemptFailed) {
        await outbox.onAttemptFailed(outboxId, msg, job.attemptsMade);
      }
    });

    await this.queue.waitUntilReady();
    this.started = true;
  }

  async emit(event: string, payload: unknown): Promise<void> {
    const outbox = this.options.outbox;
    let outboxId: string | undefined;

    if (outbox) {
      outboxId = await outbox.insertPending(event, payload);
    }

    if (this.options.persistEvent) {
      await this.options.persistEvent(event, payload);
    }

    if (!this.options.redis) {
      try {
        await this.dispatchInProcess(event, payload, { strict: this.strictDispatch });
        if (outboxId && outbox) {
          await outbox.markDispatched(outboxId);
        }
      } catch (e) {
        if (outboxId && outbox) {
          const msg = e instanceof Error ? e.message : String(e);
          await outbox.markDead(outboxId, msg);
        }
        throw e;
      }
      return;
    }

    if (!this.queue || !this.queueEvents) {
      throw new Error('[EventBus] start() must be called before emit() when redis is configured');
    }

    const job = await this.queue.add(
      'dispatch',
      { eventName: event, payload, outboxId } satisfies JobPayload,
      { jobId: `${event}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}` }
    );

    await job.waitUntilFinished(this.queueEvents);
  }

  private async dispatchInProcess(
    event: string,
    payload: unknown,
    opts?: { strict?: boolean }
  ): Promise<void> {
    const handlers = this.subscribers.get(event) || [];
    const strict = opts?.strict ?? false;
    if (strict) {
      await Promise.all(handlers.map((entry) => Promise.resolve(entry.handler(payload))));
      return;
    }
    const results = handlers.map((entry) =>
      Promise.resolve(entry.handler(payload)).catch((err) => {
        console.error(`Event handler error for "${event}":`, err);
      })
    );
    await Promise.allSettled(results);
  }

  listenerCount(event: string): number {
    return (this.subscribers.get(event) || []).length;
  }

  clear(): void {
    this.subscribers.clear();
  }

  async getStats(): Promise<{
    mode: 'memory' | 'bullmq';
    waiting?: number;
    active?: number;
    completed?: number;
    failed?: number;
    delayed?: number;
    paused?: number;
  }> {
    if (!this.queue) {
      return { mode: 'memory' };
    }
    const counts = await this.queue.getJobCounts();
    return {
      mode: 'bullmq',
      waiting: counts.waiting,
      active: counts.active,
      completed: counts.completed,
      failed: counts.failed,
      delayed: counts.delayed,
      paused: counts.paused,
    };
  }

  async stop(): Promise<void> {
    await this.worker?.close();
    this.worker = null;
    await this.queue?.close();
    this.queue = null;
    await this.queueEvents?.close();
    this.queueEvents = null;
    this.started = false;
  }
}
