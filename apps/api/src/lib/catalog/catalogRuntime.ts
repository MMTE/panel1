import type { ComponentProviderRegistry } from './ComponentProviderRegistry.js';
import type { ComponentManagementService } from '../components/ComponentManagementService.js';
import type { ComponentLifecycleService } from '../components/ComponentLifecycleService.js';

export interface Panel1CatalogRuntime {
  providerRegistry: ComponentProviderRegistry;
  componentManagement: ComponentManagementService;
  componentLifecycle: ComponentLifecycleService;
}

let runtime: Panel1CatalogRuntime | null = null;

export function setPanel1CatalogRuntime(r: Panel1CatalogRuntime): void {
  runtime = r;
}

export function getPanel1CatalogRuntime(): Panel1CatalogRuntime {
  if (!runtime) {
    throw new Error('Panel1 catalog runtime not initialized (initializeServices must run first)');
  }
  return runtime;
}
