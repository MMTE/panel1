import type { ModuleContext, Logger, ModuleJobOptions } from '@panel1/types';
import type { ServiceRegistry } from './services.js';
import type { EventBus } from './events.js';
import type { FilterChain } from './filters.js';
import type { JobScheduler } from './jobs.js';
import { Logger as CoreLogger } from './logger.js';

export interface ContextDeps {
  moduleName: string;
  db: unknown;
  services: ServiceRegistry;
  eventBus: EventBus;
  filterChain: FilterChain;
  jobScheduler: JobScheduler;
  config: Record<string, unknown>;
  routeCollector: (moduleName: string, app: unknown) => void;
  requirePermission?: (...permissionIds: string[]) => unknown;
}

function createModuleLogger(moduleName: string): Logger {
  const core = CoreLogger.getInstance().child({ operation: moduleName });
  return {
    info: (msg: string, ...args: unknown[]) => core.info(msg, args[0] as Record<string, unknown>),
    warn: (msg: string, ...args: unknown[]) => core.warn(msg, args[0] as Record<string, unknown>),
    error: (msg: string, ...args: unknown[]) => {
      const maybeErr = args.find((a): a is Error => a instanceof Error);
      const ctx = args.find((a) => a !== maybeErr) as Record<string, unknown> | undefined;
      if (maybeErr) core.error(msg, ctx, maybeErr);
      else core.error(msg, ctx);
    },
    debug: (msg: string, ...args: unknown[]) => core.debug(msg, args[0] as Record<string, unknown>),
  };
}

export function createModuleContext(deps: ContextDeps): ModuleContext {
  const logger = createModuleLogger(deps.moduleName);

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

    job(name: string, cron: string, handler: () => Promise<void>, opts?: ModuleJobOptions): void {
      deps.jobScheduler.register(name, cron, handler, deps.moduleName, opts);
    },

    config: deps.config,
    logger,
    requirePermission: deps.requirePermission,
  };

  return ctx;
}
