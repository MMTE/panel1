import type {
  ModuleDefinition,
  ModuleContext,
  ModuleUI,
  EmailTransport,
  EncryptionPort,
  RetryPort,
} from '@panel1/types';
import { ServiceRegistry } from './services.js';
import { EventBus, type EventBusOptions } from './events.js';
import { FilterChain } from './filters.js';
import { JobScheduler, type JobSchedulerOptions } from './jobs.js';
import { DbManager, type DbManagerOptions } from './db.js';
import { createModuleContext } from './context.js';

/** Redis connection for BullMQ-backed EventBus and JobScheduler (optional — falls back to in-process). */
export interface BootRedisOptions {
  host: string;
  port: number;
  password?: string;
}

export interface BootOptions {
  modules: ModuleDefinition[];
  db: DbManagerOptions;
  eventBusOptions?: EventBusOptions;
  /** BullMQ job scheduler tuning (merged with `redis` when boot provides Redis). */
  jobSchedulerOptions?: JobSchedulerOptions;
  /** When set, EventBus and JobScheduler use BullMQ; otherwise in-memory / node-cron. */
  redis?: BootRedisOptions;
  /** Host-injected RBAC middleware factory (e.g. from apps/api). */
  requirePermission?: (...permissionIds: string[]) => unknown;
  /** Optional host services wired into each module `ctx` (email, encryption, retry). */
  hostInfra?: {
    email?: EmailTransport;
    encryption?: EncryptionPort;
    retry?: RetryPort;
  };
  /**
   * After all module `setup()` calls, before the core `JobScheduler` worker starts.
   * Host apps use this to wire legacy operational queues/crons onto the same Redis-backed scheduler.
   */
  beforeJobSchedulerStart?: (ctx: { eventBus: EventBus; jobScheduler: JobScheduler }) => void | Promise<void>;
}

export interface BootResult {
  services: ServiceRegistry;
  eventBus: EventBus;
  filterChain: FilterChain;
  jobScheduler: JobScheduler;
  dbManager: DbManager;
  moduleRoutes: Map<string, unknown>;
  modules: ModuleDefinition[];
  failedModules: Array<{ name: string; error: Error }>;
  bootedModules: string[];
  moduleUi: Map<string, ModuleUI>;
}

export type HealthStatus = {
  modules: Array<{ name: string; status: 'booted' | 'failed' }>;
  events: Awaited<ReturnType<EventBus['getStats']>>;
  jobs: Awaited<ReturnType<JobScheduler['listJobs']>>;
};

export function topologicalSort(modules: ModuleDefinition[]): ModuleDefinition[] {
  const byName = new Map(modules.map((m) => [m.name, m]));
  const visited = new Set<string>();
  const sorted: ModuleDefinition[] = [];

  function visit(mod: ModuleDefinition, stack: Set<string>) {
    if (visited.has(mod.name)) return;
    if (stack.has(mod.name)) {
      throw new Error(`Circular dependency detected: ${[...stack, mod.name].join(' -> ')}`);
    }
    stack.add(mod.name);
    for (const dep of mod.deps || []) {
      const depMod = byName.get(dep);
      if (!depMod) {
        throw new Error(`Module "${mod.name}" depends on "${dep}" which is not registered`);
      }
      visit(depMod, stack);
    }
    stack.delete(mod.name);
    visited.add(mod.name);
    sorted.push(mod);
  }

  for (const mod of modules) {
    visit(mod, new Set());
  }
  return sorted;
}

export function validateDependencies(modules: ModuleDefinition[]): void {
  const names = new Set(modules.map((m) => m.name));
  for (const mod of modules) {
    for (const dep of mod.deps || []) {
      if (!names.has(dep)) {
        throw new Error(`Module "${mod.name}" depends on "${dep}" which is not registered`);
      }
    }
  }
}

function toConnection(redis: BootRedisOptions) {
  return {
    host: redis.host,
    port: redis.port,
    ...(redis.password ? { password: redis.password } : {}),
  };
}

export async function bootModules(options: BootOptions): Promise<BootResult> {
  const {
    modules,
    db: dbOptions,
    eventBusOptions,
    jobSchedulerOptions,
    requirePermission,
    hostInfra,
    beforeJobSchedulerStart,
    redis: redisOpt,
  } = options;

  console.log(`[core] Discovered ${modules.length} module(s): ${modules.map((m) => m.name).join(', ')}`);

  validateDependencies(modules);
  console.log('[core] Dependency validation passed');

  const sorted = topologicalSort(modules);
  console.log(`[core] Boot order: ${sorted.map((m) => m.name).join(' -> ')}`);

  const bullmqConnection = redisOpt ? toConnection(redisOpt) : undefined;

  const services = new ServiceRegistry();
  const eventBus = new EventBus({
    ...eventBusOptions,
    ...(bullmqConnection ? { redis: bullmqConnection } : {}),
  });
  const filterChain = new FilterChain();
  const jobScheduler = new JobScheduler({
    queueName: 'panel1-module-jobs',
    ...jobSchedulerOptions,
    ...(bullmqConnection ? { redis: bullmqConnection } : {}),
  });
  const dbManager = new DbManager(dbOptions);

  const failedModules: Array<{ name: string; error: Error }> = [];
  const bootedModules: string[] = [];
  const moduleUi = new Map<string, ModuleUI>();

  await eventBus.start();
  const moduleRoutes = new Map<string, unknown>();

  for (const mod of sorted) {
    if (mod.schema) {
      dbManager.collectSchema(mod.name, mod.schema as Record<string, unknown>);
    }
  }

  const db = dbManager.getDb();

  const routeCollector = (moduleName: string, app: unknown) => {
    moduleRoutes.set(moduleName, app);
  };

  for (const mod of sorted) {
    const depFailed = (mod.deps || []).some((dep) => failedModules.some((f) => f.name === dep));
    if (depFailed) {
      const err = new Error(`Dependency failed for "${mod.name}"`);
      failedModules.push({ name: mod.name, error: err });
      console.error(`[core] Skipping "${mod.name}" — dependency failed`);
      continue;
    }

    let moduleConfig: Record<string, unknown> = {};
    if (mod.config) {
      moduleConfig = mod.config.parse({});
    }

    const ctx = createModuleContext({
      moduleName: mod.name,
      db,
      services,
      eventBus,
      filterChain,
      jobScheduler,
      config: moduleConfig,
      routeCollector,
      requirePermission,
      email: hostInfra?.email,
      encryption: hostInfra?.encryption,
      retry: hostInfra?.retry,
    });

    try {
      await mod.setup(ctx);
      bootedModules.push(mod.name);
      if (mod.ui) {
        moduleUi.set(mod.name, mod.ui);
      }
      console.log(`[core] Module "${mod.name}" v${mod.version} setup complete`);
      await eventBus.emit('module.loaded', { name: mod.name });
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      failedModules.push({ name: mod.name, error: e });
      console.error(`[core] Module "${mod.name}" setup failed:`, e);
    }
  }

  if (beforeJobSchedulerStart) {
    await beforeJobSchedulerStart({ eventBus, jobScheduler });
  }

  await jobScheduler.start();

  const ok = bootedModules.length;
  console.log(`[core] Boot finished: ${ok}/${sorted.length} module(s) ok, ${failedModules.length} failed`);

  return {
    services,
    eventBus,
    filterChain,
    jobScheduler,
    dbManager,
    moduleRoutes,
    modules: sorted,
    failedModules,
    bootedModules,
    moduleUi,
  };
}

/**
 * Graceful shutdown: stop accepting new jobs, stop event workers, module teardowns (reverse order), close DB.
 */
export async function shutdown(bootResult: BootResult): Promise<void> {
  await bootResult.jobScheduler.stop();
  await bootResult.eventBus.stop();

  for (const mod of [...bootResult.modules].reverse()) {
    if (!bootResult.bootedModules.includes(mod.name)) continue;
    if (mod.teardown) {
      try {
        await mod.teardown();
      } catch (e) {
        console.error(`[core] teardown failed for "${mod.name}":`, e);
      }
    }
  }

  await bootResult.dbManager.close();
}

export async function health(bootResult: BootResult): Promise<HealthStatus> {
  const failedSet = new Set(bootResult.failedModules.map((f) => f.name));
  return {
    modules: bootResult.modules.map((m) => ({
      name: m.name,
      status: failedSet.has(m.name) ? 'failed' : 'booted',
    })),
    events: await bootResult.eventBus.getStats(),
    jobs: await bootResult.jobScheduler.listJobs(),
  };
}
