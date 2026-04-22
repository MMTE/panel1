import { defineModule } from '@panel1/core';
import { z } from 'zod';
import { catalogSchema } from './schema.js';
import { CatalogService } from './CatalogService.js';
import { catalogRoutes } from './routes.js';

export default defineModule({
  name: 'catalog',
  version: '0.1.0',
  deps: [],

  schema: catalogSchema,

  config: z.object({}),

  permissions: [
    'catalog.plans.view',
    'catalog.plans.create',
    'catalog.plans.edit',
    'catalog.plans.delete',
    'catalog.dashboard.view',
    'catalog.products.manage',
    'catalog.products.create',
    'catalog.products.edit',
    'catalog.components.manage',
  ],

  emits: [
    'catalog.component.definition_created',
    'catalog.component.definition_updated',
    'catalog.component.definition_deleted',
    'catalog.product.deleted',
  ],

  setup(ctx) {
    const catalogService = new CatalogService(ctx);
    ctx.service('catalog', catalogService);
    ctx.routes(catalogRoutes(ctx));
  },
});

export type { ICatalogService } from './types.js';
