import { Worker, Job } from 'bullmq';
import { Logger } from '../../logging/Logger';
import { EventJobData } from '../../events/EventService';

type EventHandler = (payload: any, metadata: { source?: string; tenantId?: string; timestamp: Date }) => Promise<void>;

/**
 * Event processor that handles events from the central event bus
 * This is the foundation for the ComponentLifecycleService
 */
export class EventProcessor {
  private static instance: EventProcessor;
  private worker: Worker;
  private logger = Logger.getInstance();
  private isRunning = false;
  private eventHandlers: Map<string, EventHandler[]> = new Map();

  private constructor() {
    // Initialize the worker for the 'events' queue
    this.worker = new Worker(
      'events',
      this.processEvent.bind(this),
      {
        connection: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD,
        },
        concurrency: 5, // Process up to 5 events concurrently
        removeOnComplete: 100,
        removeOnFail: 50,
      }
    );

    this.setupEventHandlers();

    // Register generic handlers for plugin events to avoid 'Unknown event type' warnings
    this.registerHandler('plugin.manager.plugin:error', async (payload, metadata) => {
      this.logger.info(`[PluginManagerEvent] Received: plugin.manager.plugin:error`, { payload, metadata });
    });
    this.registerHandler('plugin.lifecycle.beforeInstall', async (payload, metadata) => {
      this.logger.info(`[PluginLifecycleEvent] Received: plugin.lifecycle.beforeInstall`, { payload, metadata });
    });
    // Add more plugin.* handlers as needed
  }

  static getInstance(): EventProcessor {
    if (!EventProcessor.instance) {
      EventProcessor.instance = new EventProcessor();
    }
    return EventProcessor.instance;
  }

  /**
   * Register a handler for a specific event type
   * @param eventName The name of the event to handle
   * @param handler The handler function
   */
  registerHandler(eventName: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(eventName) || [];
    handlers.push(handler);
    this.eventHandlers.set(eventName, handlers);
    this.logger.info(`📝 Registered handler for event: ${eventName}`);
  }

  /**
   * Process an individual event job
   * @param job The BullMQ job containing event data
   */
  private async processEvent(job: Job<EventJobData>): Promise<void> {
    const { eventName, payload, timestamp, source, tenantId } = job.data;

    this.logger.info(`📥 Processing event: ${eventName}`, {
      jobId: job.id,
      eventName,
      source,
      tenantId,
      timestamp,
    });

    try {
      // Call registered handlers for this event type
      const handlers = this.eventHandlers.get(eventName) || [];
      if (handlers.length > 0) {
        await Promise.all(
          handlers.map(handler => 
            handler(payload, { source, tenantId, timestamp })
          )
        );
      } else {
        // Fall back to default event handling if no specific handlers
        await this.handleEvent(eventName, payload, { source, tenantId, timestamp });
      }

      this.logger.info(`✅ Event processed successfully: ${eventName}`, {
        jobId: job.id,
        processingTime: Date.now() - new Date(timestamp).getTime(),
      });

    } catch (error) {
      this.logger.error(`❌ Failed to process event: ${eventName}`, {
        jobId: job.id,
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error; // Re-throw to trigger BullMQ retry mechanism
    }
  }

  /**
   * Handle different types of events
   * This is where the ComponentLifecycleService logic will be integrated in Phase 2
   */
  private async handleEvent(
    eventName: string,
    payload: any,
    metadata: { source?: string; tenantId?: string; timestamp: Date }
  ): Promise<void> {
    
    // Log event details for debugging
    this.logger.debug(`[Event Handler] ${eventName}`, {
      payload,
      metadata,
    });

    // Route events to appropriate handlers based on event name patterns
    switch (true) {
      case eventName.startsWith('subscription.'):
        await this.handleSubscriptionEvent(eventName, payload, metadata);
        break;
      
      case eventName.startsWith('component.'):
        await this.handleComponentEvent(eventName, payload, metadata);
        break;
      
      case eventName.startsWith('provisioning.'):
        await this.handleProvisioningEvent(eventName, payload, metadata);
        break;
      
      case eventName.startsWith('billing.'):
        await this.handleBillingEvent(eventName, payload, metadata);
        break;
      
      case eventName.startsWith('system.'):
        await this.handleSystemEvent(eventName, payload, metadata);
        break;
      
      default:
        this.logger.warn(`⚠️  Unknown event type: ${eventName}`, { payload, metadata });
        break;
    }
  }

  /**
   * Handle subscription-related events
   * This will be the primary integration point for the ComponentLifecycleService
   */
  private async handleSubscriptionEvent(
    eventName: string,
    payload: any,
    metadata: { source?: string; tenantId?: string; timestamp: Date }
  ): Promise<void> {
    this.logger.info(`🔄 Handling subscription event: ${eventName}`, { payload });

    switch (eventName) {
      case 'subscription.created':
      case 'subscription.activated':
        this.logger.info('📦 Subscription activation detected - would trigger component provisioning');
        // TODO: Phase 2 - Integrate ComponentLifecycleService here
        break;
      
      case 'subscription.suspended':
        this.logger.info('⏸️  Subscription suspension detected - would trigger component suspension');
        // TODO: Phase 2 - Integrate ComponentLifecycleService here
        break;
      
      case 'subscription.terminated':
        this.logger.info('🛑 Subscription termination detected - would trigger component termination');
        // TODO: Phase 2 - Integrate ComponentLifecycleService here
        break;
      
      default:
        this.logger.info(`ℹ️  Unhandled subscription event: ${eventName}`);
        break;
    }
  }

  /**
   * Handle component-related events
   */
  private async handleComponentEvent(
    eventName: string,
    payload: any,
    metadata: { source?: string; tenantId?: string; timestamp: Date }
  ): Promise<void> {
    this.logger.info(`🧩 Handling component event: ${eventName}`, { payload });
    
    // Component events will be handled by the ComponentLifecycleService in Phase 2
    // For now, just log them
  }

  /**
   * Handle provisioning-related events
   */
  private async handleProvisioningEvent(
    eventName: string,
    payload: any,
    metadata: { source?: string; tenantId?: string; timestamp: Date }
  ): Promise<void> {
    this.logger.info(`⚙️  Handling provisioning event: ${eventName}`, { payload });
    
    // Provisioning events will be integrated with the ComponentLifecycleService
  }

  /**
   * Handle billing-related events
   */
  private async handleBillingEvent(
    eventName: string,
    payload: any,
    metadata: { source?: string; tenantId?: string; timestamp: Date }
  ): Promise<void> {
    this.logger.info(`💰 Handling billing event: ${eventName}`, { payload });
    
    // Billing events may trigger component lifecycle changes
  }

  /**
   * Handle system-related events
   */
  private async handleSystemEvent(
    eventName: string,
    payload: any,
    metadata: { source?: string; tenantId?: string; timestamp: Date }
  ): Promise<void> {
    this.logger.info(`🖥️  Handling system event: ${eventName}`, { payload });
    
    switch (eventName) {
      case 'system.startup':
        this.logger.info('🚀 System startup detected');
        break;
      
      case 'system.shutdown':
        this.logger.info('🛑 System shutdown detected');
        break;
      
      default:
        this.logger.info(`ℹ️  Unhandled system event: ${eventName}`);
        break;
    }
  }

  /**
   * Set up worker event handlers for monitoring and debugging
   */
  private setupEventHandlers(): void {
    this.worker.on('ready', () => {
      this.isRunning = true;
      this.logger.info('🟢 EventProcessor worker is ready and listening for events');
    });

    this.worker.on('error', (error) => {
      this.logger.error('❌ EventProcessor worker error:', error);
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error('❌ Event processing failed:', {
        jobId: job?.id,
        eventName: job?.data?.eventName,
        error: error.message,
      });
    });

    this.worker.on('completed', (job) => {
      this.logger.debug('✅ Event processing completed:', {
        jobId: job.id,
        eventName: job.data.eventName,
        processingTime: job.processedOn ? job.processedOn - job.timestamp : 'unknown',
      });
    });

    this.worker.on('stalled', (jobId) => {
      this.logger.warn('⚠️  Event processing stalled:', { jobId });
    });
  }

  /**
   * Start the event processor
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('⚠️  EventProcessor is already running');
      return;
    }

    this.logger.info('🚀 Starting EventProcessor...');
    // The worker starts automatically when created
    this.isRunning = true;
  }

  /**
   * Stop the event processor gracefully
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('⚠️  EventProcessor is not running');
      return;
    }

    this.logger.info('🛑 Stopping EventProcessor...');
    await this.worker.close();
    this.isRunning = false;
    this.logger.info('✅ EventProcessor stopped');
  }

  /**
   * Get processor statistics
   */
  async getStats() {
    return {
      isRunning: this.isRunning,
      // Add more stats as needed
    };
  }
}

// Export singleton instance
export const eventProcessor = EventProcessor.getInstance(); 