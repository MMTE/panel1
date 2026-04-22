import { Logger } from '../logging/Logger';
import { getApplicationEventBus } from '../core/appRuntime.js';

export type EventPayload = Record<string, unknown>;

/**
 * Legacy facade for `emit()` — forwards to `@panel1/core` EventBus (set in `legacyBridge.ts`).
 * Do not add a second BullMQ queue here.
 */
export class EventService {
  private static instance: EventService;
  private logger = Logger.getInstance();

  private constructor() {}

  static getInstance(): EventService {
    if (!EventService.instance) {
      EventService.instance = new EventService();
    }
    return EventService.instance;
  }

  async emit<T extends EventPayload>(
    eventName: string,
    payload: T,
    _options: {
      source?: string;
      tenantId?: string;
      delay?: number;
      priority?: number;
    } = {}
  ): Promise<void> {
    const bus = getApplicationEventBus();
    this.logger.info(`📤 Event emitted (core bus): ${eventName}`, { tenantId: _options.tenantId });
    await bus.emit(eventName, payload);
  }

  async emitBatch(
    events: Array<{
      eventName: string;
      payload: EventPayload;
      options?: { source?: string; tenantId?: string; delay?: number; priority?: number };
    }>
  ): Promise<void> {
    for (const e of events) {
      await this.emit(e.eventName, e.payload, e.options || {});
    }
    this.logger.info(`📤 Batch emitted ${events.length} events (core bus)`);
  }
}

export const eventService = EventService.getInstance();
