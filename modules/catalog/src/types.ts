import type { ModuleContext } from '@panel1/types';

export interface ICatalogService {
  readonly ctx: ModuleContext;
}

export interface IComponentDependency {
  componentKey: string;
  minVersion?: string;
  maxVersion?: string;
  required: boolean;
  description?: string;
}
