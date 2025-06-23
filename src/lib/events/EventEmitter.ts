// import { supabase } from '../supabase'; // TODO: Replace with tRPC
import { tenantManager } from '../tenant/TenantManager';
import type { Panel1EventMap } from '@panel1/plugin-sdk';

export interface EventData {
  event_type: string;
  event_data: any;
  entity_type?: string;
  entity_id?: string;
  user_id?: string;
  tenant_id?: string;
}

/**
 * Event emission system for Panel1 with multi-tenant support
 * Handles logging events and triggering webhooks with tenant isolation
 */
export class EventEmitter {
  private static instance: EventEmitter;
  private isDemoMode: boolean;

  private constructor() {
    this.isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';
  }

  static getInstance(): EventEmitter {
    if (!EventEmitter.instance) {
      EventEmitter.instance = new EventEmitter();
    }
    return EventEmitter.instance;
  }

  /**
   * Emit an event to the system with automatic tenant context
   */
  async emit<K extends keyof Panel1EventMap>(
    eventType: K,
    data: any,
    options: {
      entityType?: string;
      entityId?: string;
      userId?: string;
      tenantId?: string;
    } = {}
  ): Promise<void> {
    try {
      // In demo mode, just log to console
      if (this.isDemoMode) {
        console.log(`🎭 Demo mode: Event emitted - ${String(eventType)}`, {
          data,
          options,
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      const currentTenant = tenantManager.getCurrentTenant();
      const tenantId = options.tenantId || currentTenant?.id;

      if (!tenantId) {
        console.warn('No tenant context available for event emission');
        return;
      }

      // Skip database operations if using demo user ID
      if (options.userId === 'demo-user-id' || options.entityId === 'demo-user-id') {
        console.log(`🎭 Demo user: Event emitted - ${String(eventType)}`, {
          data,
          options,
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Log event to database with tenant context
      const { error } = await supabase.rpc('log_event', {
        event_type: eventType as string,
        event_data: data,
        entity_type: options.entityType,
        entity_id: options.entityId,
        user_id: options.userId,
        tenant_id: tenantId
      });

      if (error) {
        console.error('Failed to log event:', error);
        throw error;
      }

      // Trigger webhook dispatch for tenant-specific webhooks
      await this.triggerWebhookDispatch(eventType as string, data, tenantId);

    } catch (error) {
      console.error(`Failed to emit event ${String(eventType)}:`, error);
      // Don't throw to avoid breaking the main operation
    }
  }

  /**
   * Trigger webhook dispatch for an event with tenant isolation
   */
  private async triggerWebhookDispatch(eventType: string, data: any, tenantId: string): Promise<void> {
    // In demo mode, skip webhook dispatch
    if (this.isDemoMode) {
      console.log(`🎭 Demo mode: Would dispatch webhook for event ${eventType}`);
      return;
    }
    
    try {
      // Get active webhooks for this tenant that listen to this event type
      const { data: webhooks, error } = await supabase
        .from('webhooks')
        .select('*')
        .eq('is_active', true)
        .eq('tenant_id', tenantId)
        .contains('event_types', [eventType]);

      if (error) {
        console.error('Failed to fetch webhooks:', error);
        return;
      }

      // Dispatch to each webhook (in production, this would be queued)
      for (const webhook of webhooks || []) {
        await this.dispatchWebhook(webhook, eventType, data);
      }

    } catch (error) {
      console.error('Failed to trigger webhook dispatch:', error);
    }
  }

  /**
   * Dispatch a webhook (simplified version for demo)
   */
  private async dispatchWebhook(webhook: any, eventType: string, data: any): Promise<void> {
    try {
      const payload = {
        event_type: eventType,
        data,
        timestamp: new Date().toISOString(),
        webhook_id: webhook.id,
        tenant_id: webhook.tenant_id,
      };

      // Create webhook signature (simplified)
      const signature = await this.createWebhookSignature(payload, webhook.secret);

      // In production, this would be handled by a background service
      console.log(`Would dispatch webhook to ${webhook.url}:`, {
        payload,
        signature,
      });

      // Log delivery attempt with tenant context
      await supabase
        .from('webhook_deliveries')
        .insert({
          webhook_id: webhook.id,
          event_log_id: null, // Would be populated with actual event log ID
          attempt_number: 1,
          status: 'success', // Simplified for demo
          response_code: 200,
          attempted_at: new Date().toISOString(),
          tenant_id: webhook.tenant_id,
        });

    } catch (error) {
      console.error(`Failed to dispatch webhook ${webhook.id}:`, error);
      
      // Log failed delivery with tenant context
      await supabase
        .from('webhook_deliveries')
        .insert({
          webhook_id: webhook.id,
          event_log_id: null,
          attempt_number: 1,
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          attempted_at: new Date().toISOString(),
          tenant_id: webhook.tenant_id,
        });
    }
  }

  /**
   * Create webhook signature for security
   */
  private async createWebhookSignature(payload: any, secret: string): Promise<string> {
    const payloadString = JSON.stringify(payload);
    const encoder = new TextEncoder();
    const data = encoder.encode(payloadString);
    const key = encoder.encode(secret);

    // Simple HMAC-like signature (in production, use proper crypto)
    return btoa(payloadString + secret).substring(0, 32);
  }

  /**
   * Get events for current tenant
   */
  async getTenantEvents(
    filters: {
      eventType?: string;
      startDate?: Date;
      endDate?: Date;
      entityType?: string;
      entityId?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<any[]> {
    try {
      // In demo mode, return mock data
      if (this.isDemoMode) {
        return this.getMockEvents(filters);
      }
      
      const currentTenant = tenantManager.getCurrentTenant();
      if (!currentTenant) {
        throw new Error('No tenant context available');
      }

      let query = supabase
        .from('event_logs')
        .select('*')
        .eq('tenant_id', currentTenant.id)
        .order('occurred_at', { ascending: false });

      if (filters.eventType) {
        query = query.eq('event_type', filters.eventType);
      }

      if (filters.startDate) {
        query = query.gte('occurred_at', filters.startDate.toISOString());
      }

      if (filters.endDate) {
        query = query.lte('occurred_at', filters.endDate.toISOString());
      }

      if (filters.entityType) {
        query = query.eq('entity_type', filters.entityType);
      }

      if (filters.entityId) {
        query = query.eq('entity_id', filters.entityId);
      }

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      if (filters.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching tenant events:', error);
      return [];
    }
  }

  /**
   * Get mock events for demo mode
   */
  private getMockEvents(filters: any): any[] {
    // Generate some mock event entries
    const mockEvents = [
      {
        id: '1',
        event_type: 'user.loggedIn',
        event_data: { 
          user: { 
            id: 'demo-user-id', 
            email: 'demo@panel1.dev' 
          } 
        },
        entity_type: 'user',
        entity_id: 'demo-user-id',
        occurred_at: new Date(Date.now() - 5 * 60000).toISOString(),
        processed: true,
        webhook_dispatched: true
      },
      {
        id: '2',
        event_type: 'invoice.created',
        event_data: { 
          invoice: { 
            id: 'inv-demo-001', 
            total: 19.99 
          } 
        },
        entity_type: 'invoice',
        entity_id: 'inv-demo-001',
        occurred_at: new Date(Date.now() - 4 * 60000).toISOString(),
        processed: true,
        webhook_dispatched: true
      },
      {
        id: '3',
        event_type: 'subscription.renewed',
        event_data: { 
          subscription: { 
            id: 'sub-demo-001', 
            plan: 'Professional' 
          } 
        },
        entity_type: 'subscription',
        entity_id: 'sub-demo-001',
        occurred_at: new Date(Date.now() - 3 * 60000).toISOString(),
        processed: true,
        webhook_dispatched: true
      }
    ];

    // Apply filters (simplified)
    let filtered = [...mockEvents];
    
    if (filters.eventType) {
      filtered = filtered.filter(event => event.event_type === filters.eventType);
    }
    
    if (filters.entityType) {
      filtered = filtered.filter(event => event.entity_type === filters.entityType);
    }
    
    // Apply limit and offset
    const offset = filters.offset || 0;
    const limit = filters.limit || filtered.length;
    
    return filtered.slice(offset, offset + limit);
  }
}

// Export singleton instance
export const eventEmitter = EventEmitter.getInstance();

// Convenience function for emitting events with tenant context
export async function emitEvent<K extends keyof Panel1EventMap>(
  eventType: K,
  data: any,
  options?: {
    entityType?: string;
    entityId?: string;
    userId?: string;
    tenantId?: string;
  }
): Promise<void> {
  return eventEmitter.emit(eventType, data, options);
}