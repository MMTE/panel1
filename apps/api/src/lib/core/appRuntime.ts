import type { EventBus } from '@panel1/core';

let applicationEventBus: EventBus | null = null;

export function setApplicationEventBus(bus: EventBus): void {
  applicationEventBus = bus;
}

export function getApplicationEventBus(): EventBus {
  if (!applicationEventBus) {
    throw new Error('[appRuntime] Event bus not initialized — boot must run installLegacyBridgeBeforeJobSchedulerStart');
  }
  return applicationEventBus;
}
