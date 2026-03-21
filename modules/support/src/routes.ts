import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import type { Panel1AuthUser } from '@panel1/core';
import type { ModuleContext } from '@panel1/types';
import type { ISupportService, CreateTicketInput, AddMessageInput } from './types.js';
import { SEED_PERM } from './seed-permissions.js';

function routePerm(ctx: ModuleContext, ...ids: string[]): MiddlewareHandler[] {
  const rp = ctx.requirePermission;
  if (!rp) {
    throw new Error('@panel1/mod-support: host must pass requirePermission via bootModules()');
  }
  return [rp(...ids) as MiddlewareHandler];
}

const TicketSchema = z.object({
  id: z.string(),
  ticketNumber: z.string(),
  subject: z.string(),
  status: z.string().nullable(),
  priority: z.string().nullable(),
  clientId: z.string().nullable(),
  categoryId: z.string().nullable(),
  assignedToId: z.string().nullable(),
  createdById: z.string().nullable(),
  tags: z.array(z.string()).nullable(),
  firstResponseDue: z.string().nullable(),
  resolutionDue: z.string().nullable(),
  firstResponseAt: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  escalationLevel: z.number().nullable(),
  lastActivityAt: z.string().nullable(),
  satisfactionRating: z.number().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

const MessageSchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  content: z.string(),
  htmlContent: z.string().nullable(),
  messageType: z.string().nullable(),
  authorId: z.string().nullable(),
  authorEmail: z.string().nullable(),
  authorName: z.string().nullable(),
  isInternal: z.boolean().nullable(),
  attachments: z.array(z.unknown()).nullable(),
  timeSpent: z.number().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

const PaginatedTicketsSchema = z.object({
  tickets: z.array(TicketSchema),
  total: z.number(),
  hasMore: z.boolean(),
});

const ErrorSchema = z.object({ error: z.string() });

// --- Ticket routes ---

const listTicketsRoute = createRoute({
  method: 'get',
  path: '/tickets',
  request: {
    query: z.object({
      status: z.string().optional(),
      priority: z.string().optional(),
      categoryId: z.string().optional(),
      assignedToId: z.string().optional(),
      clientId: z.string().optional(),
      search: z.string().optional(),
      limit: z.coerce.number().min(1).max(100).default(20),
      offset: z.coerce.number().min(0).default(0),
    }),
  },
  responses: {
    200: { content: { 'application/json': { schema: PaginatedTicketsSchema } }, description: 'List of tickets' },
  },
});

const getTicketRoute = createRoute({
  method: 'get',
  path: '/tickets/{id}',
  request: {
    params: z.object({ id: z.string() }),
    query: z.object({ includeInternal: z.coerce.boolean().default(false) }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({ ticket: TicketSchema, messages: z.array(MessageSchema) }),
        },
      },
      description: 'Ticket with messages',
    },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const getTicketByNumberRoute = createRoute({
  method: 'get',
  path: '/tickets/by-number/{ticketNumber}',
  request: {
    params: z.object({ ticketNumber: z.string() }),
    query: z.object({ includeInternal: z.coerce.boolean().default(false) }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({ ticket: TicketSchema, messages: z.array(MessageSchema) }),
        },
      },
      description: 'Ticket with messages',
    },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const createTicketRoute = createRoute({
  method: 'post',
  path: '/tickets',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            subject: z.string().min(1).max(255),
            content: z.string().min(1),
            priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
            categoryId: z.string().optional(),
            clientId: z.string().optional(),
            assignedToId: z.string().optional(),
            tags: z.array(z.string()).default([]),
            customFields: z.record(z.unknown()).default({}),
            attachments: z.array(z.object({
              filename: z.string(),
              fileSize: z.number(),
              mimeType: z.string(),
              url: z.string(),
            })).default([]),
          }),
        },
      },
    },
  },
  responses: {
    201: { content: { 'application/json': { schema: TicketSchema } }, description: 'Ticket created' },
  },
});

const addMessageRoute = createRoute({
  method: 'post',
  path: '/tickets/{id}/messages',
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            content: z.string().min(1),
            htmlContent: z.string().optional(),
            messageType: z.enum(['CUSTOMER_MESSAGE', 'STAFF_REPLY', 'INTERNAL_NOTE', 'SYSTEM_MESSAGE', 'AUTO_RESPONSE']).default('STAFF_REPLY'),
            isInternal: z.boolean().default(false),
            authorId: z.string().optional(),
            authorEmail: z.string().optional(),
            authorName: z.string().optional(),
            attachments: z.array(z.object({
              filename: z.string(),
              fileSize: z.number(),
              mimeType: z.string(),
              url: z.string(),
            })).default([]),
            timeSpent: z.number().optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: { content: { 'application/json': { schema: MessageSchema } }, description: 'Message added' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Ticket not found' },
  },
});

const updateTicketStatusRoute = createRoute({
  method: 'patch',
  path: '/tickets/{id}/status',
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_STAFF', 'RESOLVED', 'CLOSED']),
            reason: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: { content: { 'application/json': { schema: TicketSchema } }, description: 'Status updated' },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const assignTicketRoute = createRoute({
  method: 'post',
  path: '/tickets/{id}/assign',
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ agentId: z.string().nullable() }) } },
      description: 'Assignment result',
    },
  },
});

// --- Category routes ---

const listCategoriesRoute = createRoute({
  method: 'get',
  path: '/categories',
  request: {},
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(z.object({ id: z.string(), name: z.string(), description: z.string().nullable(), color: z.string().nullable(), icon: z.string().nullable(), sortOrder: z.number().nullable(), isActive: z.boolean().nullable() })) } },
      description: 'Categories',
    },
  },
});

const createCategoryRoute = createRoute({
  method: 'post',
  path: '/categories',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            name: z.string().min(1).max(255),
            description: z.string().optional(),
            color: z.string().default('#6366f1'),
            icon: z.string().default('Help'),
            parentCategoryId: z.string().optional(),
            sortOrder: z.number().default(0),
            defaultAssigneeId: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: z.object({ id: z.string(), name: z.string() }) } },
      description: 'Category created',
    },
  },
});

// --- Knowledge Base routes ---

const listKbArticlesRoute = createRoute({
  method: 'get',
  path: '/kb/articles',
  request: {
    query: z.object({
      categoryId: z.string().optional(),
      search: z.string().optional(),
      limit: z.coerce.number().min(1).max(50).default(20),
      offset: z.coerce.number().min(0).default(0),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            articles: z.array(z.object({
              id: z.string(),
              title: z.string(),
              slug: z.string(),
              excerpt: z.string().nullable(),
              viewCount: z.number().nullable(),
              helpfulVotes: z.number().nullable(),
              unhelpfulVotes: z.number().nullable(),
              createdAt: z.string().nullable(),
              updatedAt: z.string().nullable(),
            })),
            total: z.number(),
            hasMore: z.boolean(),
          }),
        },
      },
      description: 'Knowledge base articles',
    },
  },
});

const getKbArticleRoute = createRoute({
  method: 'get',
  path: '/kb/articles/{slug}',
  request: {
    params: z.object({ slug: z.string() }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ id: z.string(), title: z.string(), slug: z.string(), content: z.string(), excerpt: z.string().nullable(), viewCount: z.number().nullable() }) } },
      description: 'Article',
    },
    404: { content: { 'application/json': { schema: ErrorSchema } }, description: 'Not found' },
  },
});

const listKbCategoriesRoute = createRoute({
  method: 'get',
  path: '/kb/categories',
  request: {},
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(z.object({ id: z.string(), name: z.string(), description: z.string().nullable(), icon: z.string().nullable(), isPublic: z.boolean().nullable() })) } },
      description: 'KB categories',
    },
  },
});

const searchKbRoute = createRoute({
  method: 'get',
  path: '/kb/search',
  request: {
    query: z.object({
      query: z.string().min(1),
      limit: z.coerce.number().min(1).max(20).default(10),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.array(z.object({
            id: z.string(),
            title: z.string(),
            slug: z.string(),
            excerpt: z.string().nullable(),
          })),
        },
      },
      description: 'Search results',
    },
  },
});

// --- Admin routes ---

const getStatsRoute = createRoute({
  method: 'get',
  path: '/stats',
  request: {},
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            totalTickets: z.number(),
            openTickets: z.number(),
            inProgressTickets: z.number(),
            averageFirstResponseTime: z.number(),
            averageResolutionTime: z.number(),
            satisfactionScore: z.number(),
            ticketsByPriority: z.record(z.number()),
            ticketsByCategory: z.record(z.number()),
          }),
        },
      },
      description: 'Support statistics',
    },
  },
});

const listSlaProfilesRoute = createRoute({
  method: 'get',
  path: '/sla/profiles',
  request: {},
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(z.object({ id: z.string(), name: z.string(), description: z.string().nullable(), isDefault: z.boolean().nullable(), firstResponseTime: z.number(), resolutionTime: z.number() })) } },
      description: 'SLA profiles',
    },
  },
});

const createSlaProfileRoute = createRoute({
  method: 'post',
  path: '/sla/profiles',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            name: z.string().min(1).max(255),
            description: z.string().optional(),
            firstResponseTime: z.number().min(1),
            resolutionTime: z.number().min(1),
            isDefault: z.boolean().default(false),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: z.object({ id: z.string(), name: z.string() }) } },
      description: 'SLA profile created',
    },
  },
});

const getSlaMetricsRoute = createRoute({
  method: 'get',
  path: '/sla/metrics',
  request: {
    query: z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            firstResponseSlaRate: z.number(),
            resolutionSlaRate: z.number(),
            averageFirstResponseTime: z.number(),
            averageResolutionTime: z.number(),
            breachedTickets: z.number(),
            atRiskTickets: z.number(),
          }),
        },
      },
      description: 'SLA metrics',
    },
  },
});

const listAgentProfilesRoute = createRoute({
  method: 'get',
  path: '/agents',
  request: {},
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(z.object({ id: z.string(), userId: z.string(), isActive: z.boolean().nullable(), maxTickets: z.number().nullable(), currentTickets: z.number().nullable(), isCurrentlyAvailable: z.boolean().nullable() })) } },
      description: 'Agent profiles',
    },
  },
});

const createAgentProfileRoute = createRoute({
  method: 'post',
  path: '/agents',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            userId: z.string(),
            maxTickets: z.number().min(1).max(200).default(50),
            categories: z.array(z.string()).default([]),
            skills: z.array(z.string()).default([]),
            languages: z.array(z.string()).default(['en']),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: z.object({ id: z.string(), userId: z.string() }) } },
      description: 'Agent profile created',
    },
  },
});

const listAutomationRulesRoute = createRoute({
  method: 'get',
  path: '/automation/rules',
  request: {},
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(z.object({ id: z.string(), name: z.string(), description: z.string().nullable(), isActive: z.boolean().nullable(), triggerEvent: z.string(), priority: z.number().nullable() })) } },
      description: 'Automation rules',
    },
  },
});

const createAutomationRuleRoute = createRoute({
  method: 'post',
  path: '/automation/rules',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            name: z.string().min(1).max(255),
            description: z.string().optional(),
            triggerEvent: z.string(),
            conditions: z.array(z.object({
              field: z.string(),
              operator: z.string(),
              value: z.unknown(),
            })),
            actions: z.array(z.object({
              type: z.string(),
              parameters: z.record(z.unknown()),
            })),
            priority: z.number().default(0),
            maxExecutions: z.number().optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: z.object({ id: z.string(), name: z.string() }) } },
      description: 'Automation rule created',
    },
  },
});

const myTicketsRoute = createRoute({
  method: 'get',
  path: '/my-tickets',
  request: {
    query: z.object({
      status: z.string().optional(),
      limit: z.coerce.number().min(1).max(50).default(20),
      offset: z.coerce.number().min(0).default(0),
    }),
  },
  responses: {
    200: { content: { 'application/json': { schema: PaginatedTicketsSchema } }, description: 'User tickets' },
  },
});

// --- Route builder ---

export function supportRoutes(ctx: ModuleContext) {
  const app = new OpenAPIHono();

  const getService = () => ctx.service<ISupportService>('support') as any;

  // --- Tickets ---

  app.openapi(
    { ...listTicketsRoute, middleware: routePerm(ctx, SEED_PERM.ticketsViewAdmin, SEED_PERM.ticketsViewClient) },
    async (c) => {
    const support = ctx.service<ISupportService>('support');
    const q = c.req.valid('query');
    const tenantId = c.get('tenantId') as string;
    const result = await support.getTickets(
      {
        status: q.status?.split(','),
        priority: q.priority?.split(','),
        categoryId: q.categoryId,
        assignedToId: q.assignedToId,
        clientId: q.clientId,
        search: q.search,
      },
      tenantId,
      q.limit,
      q.offset,
    );
    return c.json(result, 200);
  },
  );

  app.openapi(
    { ...getTicketByNumberRoute, middleware: routePerm(ctx, SEED_PERM.ticketsViewAdmin, SEED_PERM.ticketsViewClient) },
    async (c) => {
    const support = ctx.service<ISupportService>('support');
    const { ticketNumber } = c.req.valid('param');
    const { includeInternal } = c.req.valid('query');
    const tenantId = c.get('tenantId') as string;

    const db = ctx.db as any;
    const { supportTickets: st } = await import('./schema.js');
    const { eq, and } = await import('drizzle-orm');

    const [ticket] = await db
      .select()
      .from(st)
      .where(and(eq(st.ticketNumber, ticketNumber), eq(st.tenantId, tenantId)))
      .limit(1);

    if (!ticket) return c.json({ error: 'Ticket not found' }, 404);

    const result = await support.getTicketWithMessages(ticket.id, tenantId, includeInternal);
    if (!result) return c.json({ error: 'Ticket not found' }, 404);
    return c.json(result, 200);
  },
  );

  app.openapi(
    { ...getTicketRoute, middleware: routePerm(ctx, SEED_PERM.ticketsViewAdmin, SEED_PERM.ticketsViewClient) },
    async (c) => {
    const support = ctx.service<ISupportService>('support');
    const { id } = c.req.valid('param');
    const { includeInternal } = c.req.valid('query');
    const tenantId = c.get('tenantId') as string;
    const result = await support.getTicketWithMessages(id, tenantId, includeInternal);
    if (!result) return c.json({ error: 'Ticket not found' }, 404);
    return c.json(result, 200);
  },
  );

  app.openapi(
    {
      ...createTicketRoute,
      middleware: routePerm(ctx, SEED_PERM.ticketsManage, SEED_PERM.ticketsCreateClient),
    },
    async (c) => {
    const support = ctx.service<ISupportService>('support');
    const body = c.req.valid('json');
    const tenantId = c.get('tenantId') as string;
    const user = c.get('user') as Panel1AuthUser;
    const ticket = await support.createTicket(
      {
        subject: body.subject,
        content: body.content,
        priority: body.priority,
        categoryId: body.categoryId,
        clientId: body.clientId,
        assignedToId: body.assignedToId,
        tags: body.tags,
        customFields: body.customFields as Record<string, any>,
        attachments: body.attachments as CreateTicketInput['attachments'],
      },
      tenantId,
      user.id,
    );
    return c.json(ticket, 201);
  },
  );

  app.openapi(
    {
      ...addMessageRoute,
      middleware: routePerm(ctx, SEED_PERM.ticketsManage, SEED_PERM.ticketsViewClient),
    },
    async (c) => {
    const support = ctx.service<ISupportService>('support');
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const tenantId = c.get('tenantId') as string;
    try {
      const message = await support.addMessage(
        id,
        {
          content: body.content,
          htmlContent: body.htmlContent,
          messageType: body.messageType,
          isInternal: body.isInternal,
          authorId: body.authorId,
          authorEmail: body.authorEmail,
          authorName: body.authorName,
          attachments: body.attachments as AddMessageInput['attachments'],
          timeSpent: body.timeSpent,
        },
        tenantId,
      );
      return c.json(message, 201);
    } catch {
      return c.json({ error: 'Ticket not found' }, 404);
    }
  },
  );

  app.openapi(
    { ...updateTicketStatusRoute, middleware: routePerm(ctx, SEED_PERM.ticketsManage) },
    async (c) => {
    const support = ctx.service<ISupportService>('support');
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const tenantId = c.get('tenantId') as string;
    const user = c.get('user') as Panel1AuthUser;
    try {
      const ticket = await support.updateTicketStatus(id, body.status, tenantId, user.id, body.reason);
      return c.json(ticket, 200);
    } catch {
      return c.json({ error: 'Ticket not found' }, 404);
    }
  },
  );

  app.openapi({ ...assignTicketRoute, middleware: routePerm(ctx, SEED_PERM.ticketsManage) }, async (c) => {
    const support = ctx.service<ISupportService>('support');
    const { id } = c.req.valid('param');
    const tenantId = c.get('tenantId') as string;
    const agentId = await support.assignTicket(id, tenantId);
    return c.json({ agentId }, 200);
  });

  // --- Categories ---

  app.openapi(
    { ...listCategoriesRoute, middleware: routePerm(ctx, SEED_PERM.supportView) },
    async (c) => {
    const tenantId = c.get('tenantId') as string;
    const db = ctx.db as any;
    const { supportCategories: sc } = await import('./schema.js');
    const { eq, and } = await import('drizzle-orm');
    const categories = await db
      .select()
      .from(sc)
      .where(and(eq(sc.tenantId, tenantId), eq(sc.isActive, true)))
      .orderBy(sc.sortOrder, sc.name);
    return c.json(categories, 200);
  },
  );

  app.openapi(
    { ...createCategoryRoute, middleware: routePerm(ctx, SEED_PERM.ticketsManage) },
    async (c) => {
    const body = c.req.valid('json');
    const tenantId = c.get('tenantId') as string;
    const db = ctx.db as any;
    const { supportCategories: sc } = await import('./schema.js');
    const [category] = await db.insert(sc).values({
      name: body.name,
      description: body.description,
      color: body.color,
      icon: body.icon,
      parentCategoryId: body.parentCategoryId,
      sortOrder: body.sortOrder,
      defaultAssigneeId: body.defaultAssigneeId,
      tenantId,
    }).returning();
    return c.json(category, 201);
  },
  );

  // --- Knowledge Base ---

  app.openapi(
    {
      ...listKbArticlesRoute,
      middleware: routePerm(ctx, SEED_PERM.ticketsViewAdmin, SEED_PERM.ticketsViewClient),
    },
    async (c) => {
    const q = c.req.valid('query');
    const tenantId = c.get('tenantId') as string;
    const db = ctx.db as any;
    const { knowledgeBaseArticles: kba } = await import('./schema.js');
    const { eq, and, or, sql, desc, count } = await import('drizzle-orm');

    const conditions: any[] = [eq(kba.status, 'PUBLISHED'), eq(kba.isPublic, true), eq(kba.tenantId, tenantId)];
    if (q.categoryId) conditions.push(eq(kba.categoryId, q.categoryId));
    if (q.search) {
      conditions.push(
        or(
          sql`${kba.title} ILIKE ${`%${q.search}%`}`,
          sql`${kba.content} ILIKE ${`%${q.search}%`}`,
        ),
      );
    }

    const articles = await db
      .select({
        id: kba.id, title: kba.title, slug: kba.slug, excerpt: kba.excerpt,
        viewCount: kba.viewCount, helpfulVotes: kba.helpfulVotes, unhelpfulVotes: kba.unhelpfulVotes,
        createdAt: kba.createdAt, updatedAt: kba.updatedAt,
      })
      .from(kba)
      .where(and(...conditions))
      .orderBy(desc(kba.viewCount))
      .limit(q.limit)
      .offset(q.offset);

    const [{ total }] = await db.select({ total: count() }).from(kba).where(and(...conditions));
    return c.json({ articles, total, hasMore: q.offset + q.limit < total }, 200);
  },
  );

  app.openapi(
    {
      ...getKbArticleRoute,
      middleware: routePerm(ctx, SEED_PERM.ticketsViewAdmin, SEED_PERM.ticketsViewClient),
    },
    async (c) => {
    const { slug } = c.req.valid('param');
    const tenantId = c.get('tenantId') as string;
    const db = ctx.db as any;
    const { knowledgeBaseArticles: kba } = await import('./schema.js');
    const { eq, and } = await import('drizzle-orm');

    const conditions: any[] = [eq(kba.slug, slug), eq(kba.status, 'PUBLISHED'), eq(kba.tenantId, tenantId)];

    const [article] = await db.select().from(kba).where(and(...conditions)).limit(1);
    if (!article) return c.json({ error: 'Article not found' }, 404);

    await db.update(kba).set({ viewCount: (article.viewCount ?? 0) + 1, updatedAt: new Date() }).where(eq(kba.id, article.id));
    return c.json({ ...article, viewCount: (article.viewCount ?? 0) + 1 }, 200);
  },
  );

  app.openapi(
    {
      ...listKbCategoriesRoute,
      middleware: routePerm(ctx, SEED_PERM.ticketsViewAdmin, SEED_PERM.ticketsViewClient),
    },
    async (c) => {
    const tenantId = c.get('tenantId') as string;
    const db = ctx.db as any;
    const { knowledgeBaseCategories: kbc } = await import('./schema.js');
    const { eq, and } = await import('drizzle-orm');

    const conditions: any[] = [eq(kbc.isPublic, true), eq(kbc.tenantId, tenantId)];

    const categories = await db.select().from(kbc).where(and(...conditions)).orderBy(kbc.sortOrder, kbc.name);
    return c.json(categories, 200);
  },
  );

  app.openapi(
    {
      ...searchKbRoute,
      middleware: routePerm(ctx, SEED_PERM.ticketsViewAdmin, SEED_PERM.ticketsViewClient),
    },
    async (c) => {
    const { query, limit } = c.req.valid('query');
    const tenantId = c.get('tenantId') as string;
    const db = ctx.db as any;
    const { knowledgeBaseArticles: kba } = await import('./schema.js');
    const { eq, and, or, sql } = await import('drizzle-orm');

    const articles = await db
      .select({ id: kba.id, title: kba.title, slug: kba.slug, excerpt: kba.excerpt })
      .from(kba)
      .where(and(
        eq(kba.status, 'PUBLISHED'),
        eq(kba.isPublic, true),
        eq(kba.tenantId, tenantId),
        or(
          sql`${kba.title} ILIKE ${`%${query}%`}`,
          sql`${kba.content} ILIKE ${`%${query}%`}`,
        ),
      ))
      .limit(limit);
    return c.json(articles, 200);
  },
  );

  // --- Admin: Stats ---

  app.openapi(
    { ...getStatsRoute, middleware: routePerm(ctx, SEED_PERM.supportView) },
    async (c) => {
    const support = ctx.service<ISupportService>('support');
    const tenantId = c.get('tenantId') as string;
    const stats = await support.getSupportStats(tenantId);
    return c.json(stats, 200);
  },
  );

  // --- SLA ---

  app.openapi(
    { ...listSlaProfilesRoute, middleware: routePerm(ctx, SEED_PERM.supportView) },
    async (c) => {
    const tenantId = c.get('tenantId') as string;
    const svc = getService();
    const profiles = await svc.slaManager.getSlaProfiles(tenantId);
    return c.json(profiles, 200);
  },
  );

  app.openapi(
    { ...createSlaProfileRoute, middleware: routePerm(ctx, SEED_PERM.ticketsManage) },
    async (c) => {
    const body = c.req.valid('json');
    const tenantId = c.get('tenantId') as string;
    const db = ctx.db as any;
    const { supportSlaProfiles: ssp } = await import('./schema.js');
    const { eq } = await import('drizzle-orm');

    if (body.isDefault) {
      await db.update(ssp).set({ isDefault: false }).where(eq(ssp.tenantId, tenantId));
    }

    const [profile] = await db.insert(ssp).values({
      name: body.name,
      description: body.description,
      firstResponseTime: body.firstResponseTime,
      resolutionTime: body.resolutionTime,
      isDefault: body.isDefault,
      businessHours: {
        timezone: 'UTC',
        monday: { start: '09:00', end: '17:00', enabled: true },
        tuesday: { start: '09:00', end: '17:00', enabled: true },
        wednesday: { start: '09:00', end: '17:00', enabled: true },
        thursday: { start: '09:00', end: '17:00', enabled: true },
        friday: { start: '09:00', end: '17:00', enabled: true },
        saturday: { start: '10:00', end: '14:00', enabled: false },
        sunday: { start: '10:00', end: '14:00', enabled: false },
      },
      escalationRules: [],
      tenantId,
    }).returning();
    return c.json(profile, 201);
  },
  );

  app.openapi(
    { ...getSlaMetricsRoute, middleware: routePerm(ctx, SEED_PERM.supportView) },
    async (c) => {
    const q = c.req.valid('query');
    const tenantId = c.get('tenantId') as string;
    const svc = getService();
    const dateRange = q.startDate && q.endDate
      ? { start: new Date(q.startDate), end: new Date(q.endDate) }
      : undefined;
    const metrics = await svc.slaManager.getSlaMetrics(tenantId, dateRange);
    return c.json(metrics, 200);
  },
  );

  // --- Agents ---

  app.openapi(
    { ...listAgentProfilesRoute, middleware: routePerm(ctx, SEED_PERM.supportView) },
    async (c) => {
    const tenantId = c.get('tenantId') as string;
    const db = ctx.db as any;
    const { supportAgentProfiles: sap } = await import('./schema.js');
    const { eq } = await import('drizzle-orm');
    const agents = await db.select().from(sap).where(eq(sap.tenantId, tenantId)).orderBy(sap.isActive, sap.currentTickets);
    return c.json(agents, 200);
  },
  );

  app.openapi(
    { ...createAgentProfileRoute, middleware: routePerm(ctx, SEED_PERM.ticketsManage) },
    async (c) => {
    const body = c.req.valid('json');
    const tenantId = c.get('tenantId') as string;
    const db = ctx.db as any;
    const { supportAgentProfiles: sap } = await import('./schema.js');
    const [profile] = await db.insert(sap).values({
      userId: body.userId,
      maxTickets: body.maxTickets,
      categories: body.categories,
      skills: body.skills,
      languages: body.languages,
      tenantId,
    }).returning();
    return c.json(profile, 201);
  },
  );

  // --- Automation ---

  app.openapi(
    { ...listAutomationRulesRoute, middleware: routePerm(ctx, SEED_PERM.supportView) },
    async (c) => {
    const tenantId = c.get('tenantId') as string;
    const svc = getService();
    const rules = await svc.automationEngine.getAutomationRules(tenantId);
    return c.json(rules, 200);
  },
  );

  app.openapi(
    { ...createAutomationRuleRoute, middleware: routePerm(ctx, SEED_PERM.ticketsManage) },
    async (c) => {
    const body = c.req.valid('json');
    const tenantId = c.get('tenantId') as string;
    const svc = getService();
    const rule = await svc.automationEngine.createAutomationRule(
      {
        name: body.name,
        description: body.description,
        triggerEvent: body.triggerEvent,
        conditions: body.conditions as any,
        actions: body.actions as any,
        priority: body.priority,
        maxExecutions: body.maxExecutions,
      },
      tenantId,
    );
    return c.json(rule, 201);
  },
  );

  // --- My Tickets (client portal) ---

  app.openapi(
    {
      ...myTicketsRoute,
      middleware: routePerm(ctx, SEED_PERM.ticketsViewClient, SEED_PERM.ticketsViewAdmin),
    },
    async (c) => {
    const support = ctx.service<ISupportService>('support');
    const q = c.req.valid('query');
    const tenantId = c.get('tenantId') as string;
    const user = c.get('user') as Panel1AuthUser;
    const db = ctx.db as any;
    const { supportTickets: st } = await import('./schema.js');
    const { eq } = await import('drizzle-orm');

    const [clientTicket] = await db
      .select({ clientId: st.clientId })
      .from(st)
      .where(eq(st.createdById, user.id))
      .limit(1);

    if (!clientTicket?.clientId) {
      return c.json({ tickets: [], total: 0, hasMore: false }, 200);
    }

    const result = await support.getTickets(
      { clientId: clientTicket.clientId, status: q.status?.split(',') },
      tenantId,
      q.limit,
      q.offset,
    );
    return c.json(result, 200);
  },
  );

  return app;
}
