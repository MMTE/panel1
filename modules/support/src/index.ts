import { defineModule } from '@panel1/core';
import { z } from 'zod';
import { supportSchema } from './schema.js';
import { SupportService } from './service.js';
import { supportRoutes } from './routes.js';

export default defineModule({
  name: 'support',
  version: '0.1.0',
  deps: [],

  schema: supportSchema,

  config: z.object({
    defaultSlaResponseMinutes: z.number().default(60),
    defaultSlaResolutionMinutes: z.number().default(1440),
    automationEnabled: z.boolean().default(true),
    knowledgeBaseEnabled: z.boolean().default(true),
    ticketNumberPrefix: z.string().default('TKT'),
  }),

  permissions: [
    'support.tickets.view',
    'support.tickets.create',
    'support.tickets.manage',
    'support.tickets.assign',
    'support.categories.manage',
    'support.kb.manage',
    'support.sla.manage',
    'support.agents.manage',
    'support.automation.manage',
    'support.stats.view',
  ],

  emits: [
    'support.ticket.created',
    'support.ticket.replied',
    'support.ticket.resolved',
    'support.ticket.closed',
    'support.ticket.escalated',
    'support.ticket.assigned',
    'support.sla.breached',
  ],

  setup(ctx) {
    const supportService = new SupportService(ctx);
    ctx.service('support', supportService);
    ctx.routes(supportRoutes(ctx));

    ctx.job('support-escalation-check', '*/15 * * * *', async () => {
      ctx.logger.info('Running SLA escalation check');
    });

    ctx.job('support-auto-close-stale', '0 2 * * *', async () => {
      ctx.logger.info('Running stale ticket auto-close');
    });
  },
});

export type { ISupportService } from './types.js';
