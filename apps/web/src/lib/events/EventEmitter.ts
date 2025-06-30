import { trpc } from '../../api/trpc';

export interface EventMetadata {
  entityType?: string;
  entityId?: string;
  userId?: string;
  tenantId?: string;
  timestamp?: Date;
}

export interface Event {
  type: string;
  payload: any;
  metadata: EventMetadata;
}

export interface WebhookConfig {
  id?: string;
  url: string;
  events: string[];
  isActive: boolean;
  secret?: string;
  metadata?: Record<string, any>;
}

export interface EventHistoryOptions {
  startDate?: Date;
  endDate?: Date;
  eventTypes?: string[];
  entityType?: string;
  entityId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Event system for Panel1
 * Handles in-memory event emission and webhook delivery
 * TODO: Implement persistent event storage with tRPC + Drizzle
 */
class EventEmitter {
  private static instance: EventEmitter;
  private trpcClient: typeof trpc;
  private eventListeners: Map<string, Array<(event: Event) => void>> = new Map();

  private constructor() {
    this.trpcClient = trpc;
  }

  public static getInstance(): EventEmitter {
    if (!EventEmitter.instance) {
      EventEmitter.instance = new EventEmitter();
    }
    return EventEmitter.instance;
  }

  /**
   * Emit an event
   */
  public async emit(type: string, payload: any, metadata: EventMetadata = {}): Promise<void> {
    try {
      // Create event object
      const event: Event = {
        type,
        payload,
        metadata: {
          ...metadata,
          timestamp: new Date()
        }
      };

      // Store event in backend
      await this.trpcClient.events.emitEvent.mutate({
        type: event.type,
        payload: event.payload,
        metadata: event.metadata
      });

      // Notify local listeners
      const listeners = this.eventListeners.get(type) || [];
      await Promise.all(listeners.map(listener => listener(event)));
    } catch (error) {
      console.error('Failed to emit event:', error);
      throw error;
    }
  }

  /**
   * Subscribe to events
   */
  public on(type: string, callback: (event: Event) => void): () => void {
    const listeners = this.eventListeners.get(type) || [];
    listeners.push(callback);
    this.eventListeners.set(type, listeners);

    // Return unsubscribe function
    return () => {
      const listeners = this.eventListeners.get(type) || [];
      const index = listeners.indexOf(callback);
      if (index !== -1) {
        listeners.splice(index, 1);
        if (listeners.length === 0) {
          this.eventListeners.delete(type);
        } else {
          this.eventListeners.set(type, listeners);
        }
      }
    };
  }

  /**
   * Get registered webhooks
   */
  public async getWebhooks(): Promise<WebhookConfig[]> {
    try {
      const webhooks = await this.trpcClient.events.getWebhooks.query();
      return webhooks;
    } catch (error) {
      console.error('Failed to fetch webhooks:', error);
      throw error;
    }
  }

  /**
   * Create a new webhook
   */
  public async createWebhook(webhook: Omit<WebhookConfig, 'id'>): Promise<WebhookConfig> {
    try {
      const newWebhook = await this.trpcClient.events.createWebhook.mutate(webhook);
      return newWebhook;
    } catch (error) {
      console.error('Failed to create webhook:', error);
      throw error;
    }
  }

  /**
   * Update an existing webhook
   */
  public async updateWebhook(id: string, updates: Partial<WebhookConfig>): Promise<WebhookConfig> {
    try {
      const updatedWebhook = await this.trpcClient.events.updateWebhook.mutate({
        id,
        ...updates
      });
      return updatedWebhook;
    } catch (error) {
      console.error('Failed to update webhook:', error);
      throw error;
    }
  }

  /**
   * Delete a webhook
   */
  public async deleteWebhook(id: string): Promise<void> {
    try {
      await this.trpcClient.events.deleteWebhook.mutate({ id });
    } catch (error) {
      console.error('Failed to delete webhook:', error);
      throw error;
    }
  }

  /**
   * Get event history
   */
  public async getEventHistory(options: EventHistoryOptions = {}): Promise<Event[]> {
    try {
      const result = await this.trpcClient.events.getEventHistory.query({
        startDate: options.startDate?.toISOString(),
        endDate: options.endDate?.toISOString(),
        eventTypes: options.eventTypes,
        entityType: options.entityType,
        entityId: options.entityId,
        limit: options.limit || 50,
        offset: options.offset || 0
      });

      return result.events;
    } catch (error) {
      console.error('Failed to fetch event history:', error);
      throw error;
    }
  }
}

export const eventEmitter = EventEmitter.getInstance();

// Add a convenience function for emitting events
export const emitEvent = (type: string, payload: any, metadata: EventMetadata = {}): Promise<void> => {
  return eventEmitter.emit(type, payload, metadata);
};