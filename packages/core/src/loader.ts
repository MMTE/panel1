import type { ModuleDefinition, ModuleContext } from '@panel1/types';
import { ServiceRegistry } from './services.js';
import { EventBus, type EventBusOptions } from './events.js';
import { FilterChain } from './filters.js';
import { JobScheduler } from './jobs.js';
import { DbManager, type DbManagerOptions } from './db.js';
import { createModuleContext } from './context.js';

export interface BootOptions {
  modules: ModuleDefinition[];
  db: DbManagerOptions;
  eventBusOptions?: EventBusOptions;
  /** Host-injected RBAC middleware factory (e.g. from apps/api). */
  requirePermission?: (...permissionIds: string[]) => unknown;
}

export interface BootResult {
  services: ServiceRegistry;
  eventBus: EventBus;
  filterChain: FilterChain;
  jobScheduler: JobScheduler;
  dbManager: DbManager;
  moduleRoutes: Map<string, unknown>;
  modules: ModuleDefinition[];
}

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

export async function bootModules(options: BootOptions): Promise<BootResult> {
  const { modules, db: dbOptions, eventBusOptions, requirePermission } = options;

  console.log(`[core] Discovered ${modules.length} module(s): ${modules.map((m) => m.name).join(', ')}`);

  validateDependencies(modules);
  console.log('[core] Dependency validation passed');

  const sorted = topologicalSort(modules);
  console.log(`[core] Boot order: ${sorted.map((m) => m.name).join(' -> ')}`);

  const services = new ServiceRegistry();
  const eventBus = new EventBus(eventBusOptions);
  const filterChain = new FilterChain();
  const jobScheduler = new JobScheduler();
  const dbManager = new DbManager(dbOptions);
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
    });

    await mod.setup(ctx);
    console.log(`[core] Module "${mod.name}" v${mod.version} setup complete`);
    await eventBus.emit('module.loaded', { name: mod.name });
  }

  console.log(`[core] All ${sorted.length} module(s) booted successfully`);

  return {
    services,
    eventBus,
    filterChain,
    jobScheduler,
    dbManager,
    moduleRoutes,
    modules: sorted,
  };
}
