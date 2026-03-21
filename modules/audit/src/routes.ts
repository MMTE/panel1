import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ModuleContext } from '@panel1/types';
import type { IAuditService } from './types.js';

const AuditLogSchema = z.object({
  id: z.string(),
  actionType: z.string(),
  resourceType: z.string(),
  resourceId: z.string().nullable(),
  userId: z.string().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  sessionId: z.string().nullable(),
  oldValues: z.unknown().nullable(),
  newValues: z.unknown().nullable(),
  metadata: z.unknown().nullable(),
  createdAt: z.string(),
});

const PaginatedLogsSchema = z.object({
  logs: z.array(AuditLogSchema),
  total: z.number(),
  hasMore: z.boolean(),
});

// GET /logs
const queryLogsRoute = createRoute({
  method: 'get',
  path: '/logs',
  request: {
    query: z.object({
      actionTypes: z.string().optional(),
      resourceTypes: z.string().optional(),
      resourceId: z.string().optional(),
      userId: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      limit: z.coerce.number().min(1).max(1000).default(50),
      offset: z.coerce.number().min(0).default(0),
      orderBy: z.enum(['asc', 'desc']).default('desc'),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: PaginatedLogsSchema } },
      description: 'List of audit logs',
    },
  },
});

// GET /stats
const getStatsRoute = createRoute({
  method: 'get',
  path: '/stats',
  request: {
    query: z.object({
      days: z.coerce.number().min(1).max(365).default(30),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            totalEvents: z.number(),
            period: z.number(),
            eventsByAction: z.array(z.object({ actionType: z.string(), count: z.number() })),
            eventsByResource: z.array(z.object({ resourceType: z.string(), count: z.number() })),
            dailyEvents: z.array(z.object({ date: z.string(), count: z.number() })),
          }),
        },
      },
      description: 'Audit statistics',
    },
  },
});

// POST /events  (issue #5 specifies this path)
const logEventRoute = createRoute({
  method: 'post',
  path: '/events',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            actionType: z.string().min(1),
            resourceType: z.string().min(1),
            resourceId: z.string().optional(),
            tenantId: z.string().min(1),
            userId: z.string().optional(),
            metadata: z.record(z.unknown()).optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: z.object({ eventId: z.string(), success: z.boolean() }),
        },
      },
      description: 'Audit event logged',
    },
  },
});

// GET /trail/:resourceType/:resourceId
const resourceTrailRoute = createRoute({
  method: 'get',
  path: '/trail/{resourceType}/{resourceId}',
  request: {
    params: z.object({
      resourceType: z.string(),
      resourceId: z.string(),
    }),
    query: z.object({
      limit: z.coerce.number().min(1).max(100).default(20),
      tenantId: z.string(),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: PaginatedLogsSchema } },
      description: 'Audit trail for a resource',
    },
  },
});

// POST /exports
const createExportRoute = createRoute({
  method: 'post',
  path: '/exports',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            tenantId: z.string().min(1),
            requestedBy: z.string().min(1),
            startDate: z.string(),
            endDate: z.string(),
            resourceTypes: z.array(z.string()).optional(),
            format: z.enum(['json', 'csv', 'pdf']).default('json'),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        'application/json': {
          schema: z.object({
            exportId: z.string(),
            status: z.string(),
            message: z.string(),
          }),
        },
      },
      description: 'Export request created',
    },
    400: {
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
      description: 'Invalid request',
    },
  },
});

// GET /exports
const listExportsRoute = createRoute({
  method: 'get',
  path: '/exports',
  request: {
    query: z.object({
      tenantId: z.string(),
      limit: z.coerce.number().min(1).max(100).default(20),
      offset: z.coerce.number().min(0).default(0),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            exports: z.array(z.object({
              id: z.string(),
              status: z.string(),
              format: z.string(),
              startDate: z.string(),
              endDate: z.string(),
              fileSize: z.number().nullable(),
              recordCount: z.number().nullable(),
              createdAt: z.string(),
              completedAt: z.string().nullable(),
              expiresAt: z.string().nullable(),
            })),
            total: z.number(),
            hasMore: z.boolean(),
          }),
        },
      },
      description: 'List of audit exports',
    },
  },
});

// GET /exports/:exportId
const getExportStatusRoute = createRoute({
  method: 'get',
  path: '/exports/{exportId}',
  request: {
    params: z.object({ exportId: z.string() }),
    query: z.object({ tenantId: z.string() }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            id: z.string(),
            status: z.string(),
            format: z.string(),
            fileUrl: z.string().nullable(),
            fileSize: z.number().nullable(),
            recordCount: z.number().nullable(),
            errorMessage: z.string().nullable(),
            createdAt: z.string(),
            completedAt: z.string().nullable(),
            expiresAt: z.string().nullable(),
          }),
        },
      },
      description: 'Export status',
    },
    404: {
      content: {
        'application/json': {
          schema: z.object({ error: z.string() }),
        },
      },
      description: 'Export not found',
    },
  },
});

// GET /filter-options
const getFilterOptionsRoute = createRoute({
  method: 'get',
  path: '/filter-options',
  request: {
    query: z.object({ tenantId: z.string() }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            actionTypes: z.array(z.string()),
            resourceTypes: z.array(z.string()),
          }),
        },
      },
      description: 'Available filter options',
    },
  },
});

// POST /cleanup
const cleanupRoute = createRoute({
  method: 'post',
  path: '/cleanup',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({ tenantId: z.string().min(1) }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            success: z.boolean(),
            deletedCount: z.number(),
            message: z.string(),
          }),
        },
      },
      description: 'Cleanup result',
    },
  },
});

export function auditRoutes(ctx: ModuleContext) {
  const app = new OpenAPIHono();

  app.openapi(queryLogsRoute, async (c) => {
    const audit = ctx.service<IAuditService>('audit');
    const q = c.req.valid('query');
    const result = await audit.queryLogs({
      tenantId: c.req.header('x-tenant-id') || '',
      actionTypes: q.actionTypes?.split(','),
      resourceTypes: q.resourceTypes?.split(','),
      resourceId: q.resourceId,
      userId: q.userId,
      startDate: q.startDate ? new Date(q.startDate) : undefined,
      endDate: q.endDate ? new Date(q.endDate) : undefined,
      limit: q.limit,
      offset: q.offset,
      orderBy: q.orderBy,
    });
    return c.json(result, 200);
  });

  app.openapi(getStatsRoute, async (c) => {
    const audit = ctx.service<IAuditService>('audit');
    const { days } = c.req.valid('query');
    const tenantId = c.req.header('x-tenant-id') || '';
    const stats = await audit.getStats(tenantId, days);
    return c.json(stats, 200);
  });

  app.openapi(logEventRoute, async (c) => {
    const audit = ctx.service<IAuditService>('audit');
    const body = c.req.valid('json');
    const eventId = await audit.logEvent({
      actionType: body.actionType,
      resourceType: body.resourceType,
      resourceId: body.resourceId,
      tenantId: body.tenantId,
      userId: body.userId,
      metadata: body.metadata,
    });
    return c.json({ eventId, success: true }, 201);
  });

  app.openapi(resourceTrailRoute, async (c) => {
    const audit = ctx.service<IAuditService>('audit');
    const { resourceType, resourceId } = c.req.valid('param');
    const { limit, tenantId } = c.req.valid('query');
    const result = await audit.getResourceAuditTrail(tenantId, resourceType, resourceId, limit);
    return c.json(result, 200);
  });

  app.openapi(createExportRoute, async (c) => {
    const audit = ctx.service<IAuditService>('audit');
    const body = c.req.valid('json');
    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);

    if (startDate >= endDate) {
      return c.json({ error: 'Start date must be before end date' }, 400);
    }
    const maxRange = 365 * 24 * 60 * 60 * 1000;
    if (endDate.getTime() - startDate.getTime() > maxRange) {
      return c.json({ error: 'Export date range cannot exceed 1 year' }, 400);
    }

    const exportId = await audit.createExportRequest({
      tenantId: body.tenantId,
      requestedBy: body.requestedBy,
      startDate,
      endDate,
      resourceTypes: body.resourceTypes,
      format: body.format,
    });
    return c.json({
      exportId,
      status: 'pending',
      message: 'Export request created. You will be notified when it is ready.',
    }, 201);
  });

  app.openapi(listExportsRoute, async (c) => {
    const audit = ctx.service<IAuditService>('audit');
    const { tenantId, limit, offset } = c.req.valid('query');
    const result = await audit.getExports(tenantId, limit, offset);
    return c.json(result, 200);
  });

  app.openapi(getExportStatusRoute, async (c) => {
    const audit = ctx.service<IAuditService>('audit');
    const { exportId } = c.req.valid('param');
    const { tenantId } = c.req.valid('query');
    const result = await audit.getExportStatus(exportId, tenantId);
    if (!result) {
      return c.json({ error: 'Export request not found' }, 404);
    }
    return c.json(result, 200);
  });

  app.openapi(getFilterOptionsRoute, async (c) => {
    const audit = ctx.service<IAuditService>('audit');
    const { tenantId } = c.req.valid('query');
    const result = await audit.getFilterOptions(tenantId);
    return c.json(result, 200);
  });

  app.openapi(cleanupRoute, async (c) => {
    const audit = ctx.service<IAuditService>('audit');
    const { tenantId } = c.req.valid('json');
    const deletedCount = await audit.cleanupOldLogs(tenantId);
    return c.json({
      success: true,
      deletedCount,
      message: `Successfully deleted ${deletedCount} old audit log entries`,
    }, 200);
  });

  return app;
}
