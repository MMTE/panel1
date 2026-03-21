import type { EventHandler } from '@panel1/types';
import { Queue, Worker, QueueEvents } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';

export interface EventBusOptions {
  persistEvent?: (event: string, payload: unknown) => Promise<void>;
  /**
   * When set, emit() enqueues work and waits for the BullMQ worker to dispatch handlers.
   * When unset, handlers run in-process (used in tests and environments without Redis).
   */
  redis?: ConnectionOptions;
  /** BullMQ queue name (default: panel1-core-events) */
  queueName?: string;
}

type HandlerEntry = { handler: EventHandler<string>; id: number };

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

    this.queueEvents = new QueueEvents(queueName, { connection: redis });
    await this.queueEvents.waitUntilReady();

    this.queue = new Queue(queueName, {
      connection: redis,
      defaultJobOptions: {
        removeOnComplete: 500,
        removeOnFail: 100,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    });

    this.worker = new Worker(
      queueName,
      async (job) => {
        const { eventName, payload } = job.data as { eventName: string; payload: unknown };
        await this.dispatchInProcess(eventName, payload);
      },
      { connection: redis, concurrency: 10 }
    );

    this.worker.on('failed', (job, err) => {
      console.error(`[EventBus] Worker job failed: ${job?.id}`, err);
    });

    await this.queue.waitUntilReady();
    this.started = true;
  }

  async emit(event: string, payload: unknown): Promise<void> {
    if (this.options.persistEvent) {
      await this.options.persistEvent(event, payload);
    }

    if (!this.options.redis) {
      await this.dispatchInProcess(event, payload);
      return;
    }

    if (!this.queue || !this.queueEvents) {
      throw new Error('[EventBus] start() must be called before emit() when redis is configured');
    }

    const job = await this.queue.add(
      'dispatch',
      { eventName: event, payload },
      { jobId: `${event}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}` }
    );

    await job.waitUntilFinished(this.queueEvents);
  }

  private async dispatchInProcess(event: string, payload: unknown): Promise<void> {
    const handlers = this.subscribers.get(event) || [];
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
    waiting?: number;
    mode: 'memory' | 'bullmq';
  }> {
    if (!this.queue) {
      return { mode: 'memory' };
    }
    const waiting = await this.queue.getWaitingCount();
    return { mode: 'bullmq', waiting };
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
