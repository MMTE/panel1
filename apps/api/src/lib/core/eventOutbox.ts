import { eq } from 'drizzle-orm';
import type { EventOutboxPort } from '@panel1/core';
import { eventOutbox } from '../../db/schema/event-outbox.js';
import { db } from '../../db/index.js';

/**
 * Drizzle-backed outbox for EventBus: insert pending rows, mark dispatched/dead, track retries.
 */
export function createEventOutboxHooks(database: typeof db): EventOutboxPort {
  return {
    async insertPending(event: string, payload: unknown): Promise<string> {
      const [row] = await database
        .insert(eventOutbox)
        .values({
          eventName: event,
          payload,
          status: 'pending',
        })
        .returning({ id: eventOutbox.id });
      return row.id;
    },

    async markDispatched(id: string): Promise<void> {
      await database
        .update(eventOutbox)
        .set({ status: 'dispatched', updatedAt: new Date(), lastError: null })
        .where(eq(eventOutbox.id, id));
    },

    async onAttemptFailed(id: string, error: string, attempt: number): Promise<void> {
      await database
        .update(eventOutbox)
        .set({
          attemptCount: attempt,
          lastError: error,
          updatedAt: new Date(),
        })
        .where(eq(eventOutbox.id, id));
    },

    async markDead(id: string, error: string): Promise<void> {
      await database
        .update(eventOutbox)
        .set({
          status: 'dead',
          lastError: error,
          updatedAt: new Date(),
        })
        .where(eq(eventOutbox.id, id));
    },
  };
}
