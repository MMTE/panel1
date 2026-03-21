import type { ModuleContext, Logger } from '@panel1/types';
import type { ServiceRegistry } from './services.js';
import type { EventBus } from './events.js';
import type { FilterChain } from './filters.js';
import type { JobScheduler } from './jobs.js';

export interface ContextDeps {
  moduleName: string;
  db: unknown;
  services: ServiceRegistry;
  eventBus: EventBus;
  filterChain: FilterChain;
  jobScheduler: JobScheduler;
  config: Record<string, unknown>;
  routeCollector: (moduleName: string, app: unknown) => void;
}

function createLogger(moduleName: string): Logger {
  const prefix = `[${moduleName}]`;
  return {
    info: (msg, ...args) => console.log(prefix, msg, ...args),
    warn: (msg, ...args) => console.warn(prefix, msg, ...args),
    error: (msg, ...args) => console.error(prefix, msg, ...args),
    debug: (msg, ...args) => console.debug(prefix, msg, ...args),
  };
}

export function createModuleContext(deps: ContextDeps): ModuleContext {
  const logger = createLogger(deps.moduleName);

  const ctx: ModuleContext = {
    moduleName: deps.moduleName,
    db: deps.db,

    service(nameOrImpl: string, impl?: unknown): any {
      if (impl !== undefined) {
        deps.services.register(nameOrImpl, impl);
        return;
      }
      return deps.services.resolve(nameOrImpl);
    },

    routes(app: unknown): void {
      deps.routeCollector(deps.moduleName, app);
    },

    on(event: string, handler: any): void {
      deps.eventBus.on(event, handler);
    },

    filter(event: string, handler: any, priority?: number): void {
      deps.filterChain.register(event, handler, priority);
    },

    async emit(event: string, payload: any): Promise<void> {
      await deps.eventBus.emit(event, payload);
    },

    job(name: string, cron: string, handler: () => Promise<void>): void {
      deps.jobScheduler.register(name, cron, handler, deps.moduleName);
    },

    config: deps.config,
    logger,
  };

  return ctx;
}
