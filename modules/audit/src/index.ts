import { defineModule } from '@panel1/core';
import { z } from 'zod';
import { auditSchema } from './schema.js';
import { AuditService } from './service.js';
import { auditRoutes } from './routes.js';

export default defineModule({
  name: 'audit',
  version: '0.1.0',
  deps: [],

  schema: auditSchema,

  config: z.object({
    retentionDays: z.number().default(2555),
    exportEnabled: z.boolean().default(true),
  }),

  permissions: ['audit.logs.view', 'audit.logs.export', 'audit.logs.cleanup'],

  emits: [
    'audit.logged',
    'audit.export.completed',
    'audit.export.failed',
    'audit.cleanup.completed',
  ],

  setup(ctx) {
    const auditService = new AuditService(ctx);
    ctx.service('audit', auditService);
    ctx.routes(auditRoutes(ctx));

    ctx.job('audit-cleanup', '0 2 * * 0', async () => {
      ctx.logger.info('Running weekly audit maintenance');
      const result = await auditService.runWeeklyMaintenance();
      ctx.logger.info('Weekly audit maintenance done', { ...result });
    });
  },
});

export type { IAuditService } from './types.js';
