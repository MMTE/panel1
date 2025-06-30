import { Queue, Job } from 'bullmq';
import { Logger } from '../logging/Logger';

/**
 * Event payload interface for type safety
 */
export interface EventPayload {
  [key: string]: any;
}

/**
 * Event job data structure
 */
export interface EventJobData {
  eventName: string;
  payload: EventPayload;
  timestamp: Date;
  source?: string;
  tenantId?: string;
}

/**
 * Centralized event service for inter-service communication
 * Uses BullMQ as the underlying event bus
 */
export class EventService {
  private static instance: EventService;
  private queue: Queue;
  private logger = Logger.getInstance();
  private readonly queueName = 'events';

  private constructor() {
    // Initialize the events queue
    this.queue = new Queue(this.queueName, {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
      },
      defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50,      // Keep last 50 failed jobs
        attempts: 3,           // Retry failed jobs up to 3 times
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    this.logger.info('📡 EventService initialized with queue:', this.queueName);
  }

  static getInstance(): EventService {
    if (!EventService.instance) {
      EventService.instance = new EventService();
    }
    return EventService.instance;
  }

  /**
   * Emit an event to the event bus
   * @param eventName The name of the event (e.g., 'subscription.created')
   * @param payload The event payload data
   * @param options Additional options for the event
   * @returns Promise<Job> The created job
   */
  async emit<T extends EventPayload>(
    eventName: string,
    payload: T,
    options: {
      source?: string;
      tenantId?: string;
      delay?: number;
      priority?: number;
    } = {}
  ): Promise<Job> {
    try {
      const eventData: EventJobData = {
        eventName,
        payload,
        timestamp: new Date(),
        source: options.source || 'unknown',
        tenantId: options.tenantId,
      };

      const job = await this.queue.add(
        eventName,
        eventData,
        {
          delay: options.delay,
          priority: options.priority,
          // Add metadata for debugging
          jobId: `${eventName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        }
      );

      this.logger.info(`📤 Event emitted: ${eventName}`, {
        jobId: job.id,
        payload: payload,
        tenantId: options.tenantId,
        source: options.source,
      });

      return job;
    } catch (error) {
      this.logger.error(`❌ Failed to emit event: ${eventName}`, error);
      throw new Error(`Failed to emit event: ${eventName}`);
    }
  }

  /**
   * Emit multiple events in batch
   * @param events Array of events to emit
   * @returns Promise<Job[]> Array of created jobs
   */
  async emitBatch(events: Array<{
    eventName: string;
    payload: EventPayload;
    options?: {
      source?: string;
      tenantId?: string;
      delay?: number;
      priority?: number;
    };
  }>): Promise<Job[]> {
    try {
      const jobs = await Promise.all(
        events.map(event => 
          this.emit(event.eventName, event.payload, event.options || {})
        )
      );

      this.logger.info(`📤 Batch emitted ${events.length} events`);
      return jobs;
    } catch (error) {
      this.logger.error('❌ Failed to emit batch events', error);
      throw new Error('Failed to emit batch events');
    }
  }

  /**
   * Get queue statistics
   * @returns Promise with queue stats
   */
  async getStats() {
    try {
      const waiting = await this.queue.getWaiting();
      const active = await this.queue.getActive();
      const completed = await this.queue.getCompleted();
      const failed = await this.queue.getFailed();

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        total: waiting.length + active.length + completed.length + failed.length,
      };
    } catch (error) {
      this.logger.error('❌ Failed to get queue stats', error);
      throw error;
    }
  }

  /**
   * Clean old jobs from the queue
   * @param maxAge Maximum age in milliseconds
   * @param limit Maximum number of jobs to clean
   */
  async cleanOldJobs(maxAge: number = 24 * 60 * 60 * 1000, limit: number = 100) {
    try {
      const cleaned = await this.queue.clean(maxAge, limit, 'completed');
      this.logger.info(`🧹 Cleaned ${cleaned.length} old jobs from events queue`);
      return cleaned.length;
    } catch (error) {
      this.logger.error('❌ Failed to clean old jobs', error);
      throw error;
    }
  }

  /**
   * Pause the events queue
   */
  async pause() {
    await this.queue.pause();
    this.logger.info('⏸️  Events queue paused');
  }

  /**
   * Resume the events queue
   */
  async resume() {
    await this.queue.resume();
    this.logger.info('▶️  Events queue resumed');
  }

  /**
   * Close the events queue connection
   */
  async close() {
    await this.queue.close();
    this.logger.info('🔌 Events queue connection closed');
  }

  /**
   * Get the underlying BullMQ queue instance
   * @returns Queue instance
   */
  getQueue(): Queue {
    return this.queue;
  }
}

// Export singleton instance
export const eventService = EventService.getInstance();

// Export types for use in other modules
export type { EventPayload, EventJobData }; 