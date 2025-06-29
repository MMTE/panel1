// import { supabase } from '../supabase'; // TODO: Replace with tRPC
import { tenantManager } from '../tenant/TenantManager';
import type { Panel1EventMap } from '@panel1/plugin-sdk';

export interface EventData {
  [key: string]: any;
}

export interface EventOptions {
  entityType?: string;
  entityId?: string;
  userId?: string;
  tenantId?: string;
}

export interface EventListener {
  id: string;
  eventType: string;
  callback: (data: EventData) => void | Promise<void>;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  secret?: string;
  is_active: boolean;
}

/**
 * Event system for Panel1
 * Handles in-memory event emission and webhook delivery
 * TODO: Implement persistent event storage with tRPC + Drizzle
 */
export class EventEmitter {
  private static instance: EventEmitter;
  private listeners: Map<string, EventListener[]> = new Map();
  private webhooks: WebhookEndpoint[] = [];

  private constructor() {
    // Initialize with demo webhook for development
    this.webhooks = [{
      id: 'demo-webhook',
      url: 'https://webhook.site/demo',
      events: ['*'],
      secret: 'demo-secret',
      is_active: false // Disabled by default
    }];
  }

  static getInstance(): EventEmitter {
    if (!EventEmitter.instance) {
      EventEmitter.instance = new EventEmitter();
    }
    return EventEmitter.instance;
  }

  /**
   * Subscribe to an event
   */
  on(eventType: string, callback: (data: EventData) => void | Promise<void>): string {
    const listener: EventListener = {
      id: `listener_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      eventType,
      callback
    };

    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }

    this.listeners.get(eventType)!.push(listener);
    return listener.id;
  }

  /**
   * Unsubscribe from an event
   */
  off(listenerId: string): void {
    for (const [eventType, listeners] of this.listeners.entries()) {
      const index = listeners.findIndex(l => l.id === listenerId);
      if (index !== -1) {
        listeners.splice(index, 1);
        if (listeners.length === 0) {
          this.listeners.delete(eventType);
        }
        break;
      }
    }
  }

  /**
   * Emit an event
   */
  async emit(eventType: string, data: EventData, options: EventOptions = {}): Promise<void> {
    const event = {
      eventType,
      data,
      options,
      timestamp: new Date().toISOString()
    };

    // Log the event
    if (!options.tenantId) {
      console.warn('📡 Event emitted without tenant context:', event);
    } else {
      console.log('📡 Event emitted:', event);
    }

    // Store event in database
    await this.storeEvent(event);

    // Trigger local listeners
    await this.triggerListeners(eventType, data);

    // Send to webhooks
    await this.sendWebhooks(event);
  }

  /**
   * Store event in database
   * TODO: Implement with tRPC + Drizzle
   */
  private async storeEvent(event: any): Promise<void> {
    try {
      // TODO: Replace with tRPC call
      console.log('TODO: Store event in database via tRPC:', event);
    } catch (error) {
      console.error('Error storing event:', error);
    }
  }

  /**
   * Trigger local event listeners
   */
  private async triggerListeners(eventType: string, data: EventData): Promise<void> {
    const listeners = this.listeners.get(eventType) || [];
    const wildcardListeners = this.listeners.get('*') || [];
    
    const allListeners = [...listeners, ...wildcardListeners];

    for (const listener of allListeners) {
      try {
        await listener.callback(data);
      } catch (error) {
        console.error(`Error in event listener ${listener.id}:`, error);
      }
    }
  }

  /**
   * Send event to configured webhooks
   */
  private async sendWebhooks(event: any): Promise<void> {
    const activeWebhooks = this.webhooks.filter(w => w.is_active);
    
    for (const webhook of activeWebhooks) {
      if (this.shouldSendToWebhook(webhook, event.eventType)) {
        try {
          await this.sendWebhook(webhook, event);
        } catch (error) {
          console.error(`Error sending webhook to ${webhook.url}:`, error);
        }
      }
    }
  }

  /**
   * Check if event should be sent to webhook
   */
  private shouldSendToWebhook(webhook: WebhookEndpoint, eventType: string): boolean {
    return webhook.events.includes('*') || webhook.events.includes(eventType);
  }

  /**
   * Send individual webhook
   */
  private async sendWebhook(webhook: WebhookEndpoint, event: any): Promise<void> {
    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Panel1-Signature': webhook.secret ? this.generateSignature(event, webhook.secret) : '',
          'X-Panel1-Event': event.eventType,
        },
        body: JSON.stringify(event)
      });

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}: ${response.statusText}`);
      }

      console.log(`✅ Webhook sent to ${webhook.url}`);
    } catch (error) {
      console.error(`❌ Webhook failed for ${webhook.url}:`, error);
      throw error;
    }
  }

  /**
   * Generate webhook signature
   */
  private generateSignature(payload: any, secret: string): string {
    // Simple signature generation - in production, use crypto library
    return `sha256=${btoa(JSON.stringify(payload) + secret)}`;
  }

  /**
   * Get webhook endpoints
   * TODO: Implement with tRPC + Drizzle
   */
  async getWebhooks(): Promise<WebhookEndpoint[]> {
    try {
      // TODO: Replace with tRPC call
      console.log('TODO: Fetch webhooks from database via tRPC');
      return this.webhooks;
    } catch (error) {
      console.error('Error fetching webhooks:', error);
      return [];
    }
  }

  /**
   * Create webhook endpoint
   * TODO: Implement with tRPC + Drizzle
   */
  async createWebhook(webhook: Omit<WebhookEndpoint, 'id'>): Promise<WebhookEndpoint | null> {
    try {
      console.log('TODO: Create webhook via tRPC:', webhook);
      
      const newWebhook: WebhookEndpoint = {
        id: `webhook_${Date.now()}`,
        ...webhook
      };
      
      this.webhooks.push(newWebhook);
      return newWebhook;
    } catch (error) {
      console.error('Error creating webhook:', error);
      return null;
    }
  }

  /**
   * Update webhook endpoint
   * TODO: Implement with tRPC + Drizzle
   */
  async updateWebhook(id: string, updates: Partial<WebhookEndpoint>): Promise<WebhookEndpoint | null> {
    try {
      console.log('TODO: Update webhook via tRPC:', { id, updates });
      
      const index = this.webhooks.findIndex(w => w.id === id);
      if (index !== -1) {
        this.webhooks[index] = { ...this.webhooks[index], ...updates };
        return this.webhooks[index];
      }
      
      return null;
    } catch (error) {
      console.error('Error updating webhook:', error);
      return null;
    }
  }

  /**
   * Delete webhook endpoint
   * TODO: Implement with tRPC + Drizzle
   */
  async deleteWebhook(id: string): Promise<boolean> {
    try {
      console.log('TODO: Delete webhook via tRPC:', id);
      
      const index = this.webhooks.findIndex(w => w.id === id);
      if (index !== -1) {
        this.webhooks.splice(index, 1);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error deleting webhook:', error);
      return false;
    }
  }

  /**
   * Get event history
   * TODO: Implement with tRPC + Drizzle
   */
  async getEventHistory(options: {
    eventType?: string;
    entityType?: string;
    entityId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<any[]> {
    try {
      console.log('TODO: Fetch event history from database via tRPC:', options);
      return [];
    } catch (error) {
      console.error('Error fetching event history:', error);
      return [];
    }
  }
}

// Singleton instance
const eventEmitter = EventEmitter.getInstance();

// Export convenience functions
export const emitEvent = (eventType: string, data: EventData, options?: EventOptions) => 
  eventEmitter.emit(eventType, data, options);

export const onEvent = (eventType: string, callback: (data: EventData) => void | Promise<void>) => 
  eventEmitter.on(eventType, callback);

export const offEvent = (listenerId: string) => 
  eventEmitter.off(listenerId);

export { eventEmitter };