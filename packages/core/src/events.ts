import type { EventHandler } from '@panel1/types';

export interface EventBusOptions {
  persistEvent?: (event: string, payload: unknown) => Promise<void>;
}

export class EventBus {
  private subscribers = new Map<string, EventHandler<string>[]>();
  private options: EventBusOptions;

  constructor(options: EventBusOptions = {}) {
    this.options = options;
  }

  on(event: string, handler: EventHandler<string>): void {
    const handlers = this.subscribers.get(event) || [];
    handlers.push(handler);
    this.subscribers.set(event, handlers);
  }

  async emit(event: string, payload: unknown): Promise<void> {
    if (this.options.persistEvent) {
      await this.options.persistEvent(event, payload);
    }

    const handlers = this.subscribers.get(event) || [];
    const results = handlers.map((handler) =>
      Promise.resolve(handler(payload)).catch((err) => {
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
}
