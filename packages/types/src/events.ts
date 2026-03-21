export interface EventMap {
  'app.started': { timestamp: Date };
  'app.stopping': { reason: string };
  'module.loaded': { name: string };
  'module.unloaded': { name: string };
}

export type EventHandler<K extends keyof EventMap | string = string> =
  K extends keyof EventMap
    ? (payload: EventMap[K]) => Promise<void> | void
    : (payload: unknown) => Promise<void> | void;

export type FilterHandler<K extends keyof EventMap | string = string> =
  K extends keyof EventMap
    ? (payload: EventMap[K]) => Promise<EventMap[K]> | EventMap[K]
    : (payload: unknown) => Promise<unknown> | unknown;
