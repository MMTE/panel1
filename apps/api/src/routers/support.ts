import { z } from 'zod';
import { router, publicProcedure, protectedProcedure, adminProcedure, tenantProcedure } from '../trpc/trpc.js';
import { db } from '../db/index.js';
import { 
  supportTickets, 
  ticketMessages,
  supportCategories,
  knowledgeBaseArticles,
  knowledgeBaseCategories,
  supportSlaProfiles,
  supportAgentProfiles,
  supportAutomationRules
} from '../db/schema/index.js';
import { eq, and, or, desc, asc, count, sql, isNull } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { supportService } from '../lib/support/SupportService.js';
import { SlaManager } from '../lib/support/SlaManager.js';
import { SupportAutomationEngine } from '../lib/support/SupportAutomationEngine.js';

// Input validation schemas
const createTicketSchema = z.object({
  subject: z.string().min(1).max(255),
  content: z.string().min(1),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  categoryId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
  tags: z.array(z.string()).default([]),
  customFields: z.record(z.any()).default({}),
  attachments: z.array(z.object({
    filename: z.string(),
    fileSize: z.number(),
    mimeType: z.string(),
    url: z.string(),
  })).default([]),
});

const addMessageSchema = z.object({
  ticketId: z.string().uuid(),
  content: z.string().min(1),
  htmlContent: z.string().optional(),
  messageType: z.enum(['CUSTOMER_MESSAGE', 'STAFF_REPLY', 'INTERNAL_NOTE', 'SYSTEM_MESSAGE', 'AUTO_RESPONSE']).default('STAFF_REPLY'),
  isInternal: z.boolean().default(false),
  attachments: z.array(z.object({
    filename: z.string(),
    fileSize: z.number(),
    mimeType: z.string(),
    url: z.string(),
  })).default([]),
  timeSpent: z.number().optional(),
});

const ticketFiltersSchema = z.object({
  status: z.array(z.string()).optional(),
  priority: z.array(z.string()).optional(),
  categoryId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
  createdAfter: z.date().optional(),
  createdBefore: z.date().optional(),
  search: z.string().optional(),
});

export const supportRouter = router({
  // Tickets
  createTicket: tenantProcedure
    .input(createTicketSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const ticket = await supportService.createTicket(
          input,
          ctx.tenantId,
          ctx.user.id
        );
        return ticket;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create ticket',
          cause: error,
        });
      }
    }),

  getTickets: tenantProcedure
    .input(z.object({
      filters: ticketFiltersSchema.default({}),
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input, ctx }) => {
      return await supportService.getTickets(
        input.filters,
        ctx.tenantId,
        input.limit,
        input.offset
      );
    }),

  getTicketById: tenantProcedure
    .input(z.object({
      id: z.string().uuid(),
      includeInternal: z.boolean().default(false),
    }))
    .query(async ({ input, ctx }) => {
      const result = await supportService.getTicketWithMessages(
        input.id,
        ctx.tenantId,
        input.includeInternal || ctx.user.role === 'ADMIN'
      );

      if (!result) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Ticket not found',
        });
      }

      return result;
    }),

  getTicketByNumber: tenantProcedure
    .input(z.object({
      ticketNumber: z.string(),
      includeInternal: z.boolean().default(false),
    }))
    .query(async ({ input, ctx }) => {
      const [ticket] = await db
        .select()
        .from(supportTickets)
        .where(and(
          eq(supportTickets.ticketNumber, input.ticketNumber),
          eq(supportTickets.tenantId, ctx.tenantId)
        ))
        .limit(1);

      if (!ticket) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Ticket not found',
        });
      }

      return await supportService.getTicketWithMessages(
        ticket.id,
        ctx.tenantId,
        input.includeInternal || ctx.user.role === 'ADMIN'
      );
    }),

  addMessage: tenantProcedure
    .input(addMessageSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const message = await supportService.addMessage(
          input.ticketId,
          {
            content: input.content,
            htmlContent: input.htmlContent,
            messageType: input.messageType,
            isInternal: input.isInternal,
            authorId: ctx.user.id,
            attachments: input.attachments,
            timeSpent: input.timeSpent,
          },
          ctx.tenantId
        );
        return message;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to add message',
          cause: error,
        });
      }
    }),

  updateTicketStatus: tenantProcedure
    .input(z.object({
      id: z.string().uuid(),
      status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_STAFF', 'RESOLVED', 'CLOSED']),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await supportService.updateTicketStatus(
          input.id,
          input.status,
          ctx.tenantId,
          ctx.user.id,
          input.reason
        );
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update ticket status',
          cause: error,
        });
      }
    }),

  assignTicket: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      assignedToId: z.string().uuid(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await supportService.assignTicket(
          input.id,
          input.assignedToId,
          ctx.tenantId,
          ctx.user.id
        );
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to assign ticket',
          cause: error,
        });
      }
    }),

  // Categories
  getCategories: tenantProcedure
    .query(async ({ ctx }) => {
      return await db
        .select()
        .from(supportCategories)
        .where(and(
          eq(supportCategories.tenantId, ctx.tenantId),
          eq(supportCategories.isActive, true)
        ))
        .orderBy(supportCategories.sortOrder, supportCategories.name);
    }),

  createCategory: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      color: z.string().default('#6366f1'),
      icon: z.string().default('Help'),
      parentCategoryId: z.string().uuid().optional(),
      sortOrder: z.number().default(0),
      defaultAssigneeId: z.string().uuid().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const [category] = await db
        .insert(supportCategories)
        .values({
          ...input,
          tenantId: ctx.tenantId,
        })
        .returning();

      return category;
    }),

  // Knowledge Base
  getKnowledgeBaseArticles: publicProcedure
    .input(z.object({
      categoryId: z.string().uuid().optional(),
      search: z.string().optional(),
      limit: z.number().min(1).max(50).default(20),
      offset: z.number().min(0).default(0),
      publicOnly: z.boolean().default(true),
    }))
    .query(async ({ input, ctx }) => {
      const conditions = [
        eq(knowledgeBaseArticles.status, 'PUBLISHED'),
      ];

      // Add tenant filter if authenticated
      if (ctx.tenantId) {
        conditions.push(eq(knowledgeBaseArticles.tenantId, ctx.tenantId));
      }

      if (input.publicOnly) {
        conditions.push(eq(knowledgeBaseArticles.isPublic, true));
      }

      if (input.categoryId) {
        conditions.push(eq(knowledgeBaseArticles.categoryId, input.categoryId));
      }

      if (input.search) {
        conditions.push(
          or(
            sql`${knowledgeBaseArticles.title} ILIKE ${`%${input.search}%`}`,
            sql`${knowledgeBaseArticles.content} ILIKE ${`%${input.search}%`}`,
            sql`${knowledgeBaseArticles.searchKeywords} @> ${[input.search]}`
          )
        );
      }

      const articles = await db
        .select({
          id: knowledgeBaseArticles.id,
          title: knowledgeBaseArticles.title,
          slug: knowledgeBaseArticles.slug,
          excerpt: knowledgeBaseArticles.excerpt,
          viewCount: knowledgeBaseArticles.viewCount,
          helpfulVotes: knowledgeBaseArticles.helpfulVotes,
          unhelpfulVotes: knowledgeBaseArticles.unhelpfulVotes,
          createdAt: knowledgeBaseArticles.createdAt,
          updatedAt: knowledgeBaseArticles.updatedAt,
        })
        .from(knowledgeBaseArticles)
        .where(and(...conditions))
        .orderBy(desc(knowledgeBaseArticles.viewCount))
        .limit(input.limit)
        .offset(input.offset);

      const [{ total }] = await db
        .select({ total: count() })
        .from(knowledgeBaseArticles)
        .where(and(...conditions));

      return {
        articles,
        total,
        hasMore: input.offset + input.limit < total,
      };
    }),

  getKnowledgeBaseArticle: publicProcedure
    .input(z.object({
      slug: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      const conditions = [
        eq(knowledgeBaseArticles.slug, input.slug),
        eq(knowledgeBaseArticles.status, 'PUBLISHED'),
      ];

      // Add tenant filter if authenticated
      if (ctx.tenantId) {
        conditions.push(eq(knowledgeBaseArticles.tenantId, ctx.tenantId));
      }

      const [article] = await db
        .select()
        .from(knowledgeBaseArticles)
        .where(and(...conditions))
        .limit(1);

      if (!article) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Article not found',
        });
      }

      // Increment view count
      await db
        .update(knowledgeBaseArticles)
        .set({
          viewCount: article.viewCount + 1,
          updatedAt: new Date(),
        })
        .where(eq(knowledgeBaseArticles.id, article.id));

      return { ...article, viewCount: article.viewCount + 1 };
    }),

  getKnowledgeBaseCategories: publicProcedure
    .input(z.object({
      publicOnly: z.boolean().default(true),
    }))
    .query(async ({ input, ctx }) => {
      const conditions = [];

      if (ctx.tenantId) {
        conditions.push(eq(knowledgeBaseCategories.tenantId, ctx.tenantId));
      }

      if (input.publicOnly) {
        conditions.push(eq(knowledgeBaseCategories.isPublic, true));
      }

      return await db
        .select()
        .from(knowledgeBaseCategories)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(knowledgeBaseCategories.sortOrder, knowledgeBaseCategories.name);
    }),

  // Support Statistics and Dashboard
  getSupportStats: adminProcedure
    .query(async ({ ctx }) => {
      return await supportService.getSupportStats(ctx.tenantId);
    }),

  getRecentTickets: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(50).default(10),
    }))
    .query(async ({ input, ctx }) => {
      const { tickets } = await supportService.getTickets(
        {},
        ctx.tenantId,
        input.limit,
        0
      );

      // Transform tickets to include client and agent info
      const ticketsWithRelations = await Promise.all(
        tickets.map(async (ticket) => {
          const [client] = await db
            .select({
              id: supportTickets.clientId,
              user: {
                firstName: sql`users.first_name`,
                lastName: sql`users.last_name`,
                email: sql`users.email`,
              }
            })
            .from(supportTickets)
            .leftJoin(sql`users`, eq(sql`users.id`, sql`clients.user_id`))
            .leftJoin(sql`clients`, eq(sql`clients.id`, supportTickets.clientId))
            .where(eq(supportTickets.id, ticket.id))
            .limit(1);

          const [assignedAgent] = ticket.assignedToId ? await db
            .select({
              firstName: sql`users.first_name`,
              lastName: sql`users.last_name`,
            })
            .from(sql`users`)
            .where(eq(sql`users.id`, ticket.assignedToId))
            .limit(1) : [null];

          return {
            ...ticket,
            client: client || null,
            assignedAgent: assignedAgent || null,
          };
        })
      );

      return ticketsWithRelations;
    }),

  getSlaMetrics: adminProcedure
    .input(z.object({
      dateRange: z.object({
        start: z.date(),
        end: z.date(),
      }).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const slaManager = SlaManager.getInstance();
      return await slaManager.getSlaMetrics(ctx.tenantId, input.dateRange);
    }),

  // SLA Profiles
  getSlaProfiles: adminProcedure
    .query(async ({ ctx }) => {
      const slaManager = SlaManager.getInstance();
      return await slaManager.getSlaProfiles(ctx.tenantId);
    }),

  createSlaProfile: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      firstResponseTime: z.number().min(1), // minutes
      resolutionTime: z.number().min(1), // minutes
      isDefault: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      // If this is set as default, unset other defaults
      if (input.isDefault) {
        await db
          .update(supportSlaProfiles)
          .set({ isDefault: false })
          .where(eq(supportSlaProfiles.tenantId, ctx.tenantId));
      }

      const [profile] = await db
        .insert(supportSlaProfiles)
        .values({
          ...input,
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
          tenantId: ctx.tenantId,
        })
        .returning();

      return profile;
    }),

  // Agent Profiles
  getAgentProfiles: adminProcedure
    .query(async ({ ctx }) => {
      return await db
        .select()
        .from(supportAgentProfiles)
        .where(eq(supportAgentProfiles.tenantId, ctx.tenantId))
        .orderBy(supportAgentProfiles.isActive, supportAgentProfiles.currentTickets);
    }),

  createAgentProfile: adminProcedure
    .input(z.object({
      userId: z.string().uuid(),
      maxTickets: z.number().min(1).max(200).default(50),
      categories: z.array(z.string().uuid()).default([]),
      skills: z.array(z.string()).default([]),
      languages: z.array(z.string()).default(['en']),
    }))
    .mutation(async ({ input, ctx }) => {
      const [profile] = await db
        .insert(supportAgentProfiles)
        .values({
          ...input,
          tenantId: ctx.tenantId,
        })
        .returning();

      return profile;
    }),

  // Automation Rules
  getAutomationRules: adminProcedure
    .query(async ({ ctx }) => {
      const automationEngine = SupportAutomationEngine.getInstance();
      return await automationEngine.getAutomationRules(ctx.tenantId);
    }),

  createAutomationRule: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      triggerEvent: z.string(),
      conditions: z.array(z.object({
        field: z.string(),
        operator: z.string(),
        value: z.any(),
      })),
      actions: z.array(z.object({
        type: z.string(),
        parameters: z.record(z.any()),
      })),
      priority: z.number().default(0),
      maxExecutions: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const automationEngine = SupportAutomationEngine.getInstance();
      return await automationEngine.createAutomationRule(input, ctx.tenantId);
    }),

  // Client portal endpoints
  getMyTickets: protectedProcedure
    .input(z.object({
      status: z.array(z.string()).optional(),
      limit: z.number().min(1).max(50).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input, ctx }) => {
      // Get client ID for this user
      const client = await db
        .select({ id: supportTickets.clientId })
        .from(supportTickets)
        .where(eq(supportTickets.createdById, ctx.user.id))
        .limit(1);

      if (!client.length) {
        return { tickets: [], total: 0, hasMore: false };
      }

      const filters = {
        clientId: client[0].id,
        status: input.status,
      };

      return await supportService.getTickets(
        filters,
        ctx.tenantId,
        input.limit,
        input.offset
      );
    }),

  // Public knowledge base search
  searchKnowledgeBase: publicProcedure
    .input(z.object({
      query: z.string().min(1),
      limit: z.number().min(1).max(20).default(10),
    }))
    .query(async ({ input }) => {
      const articles = await db
        .select({
          id: knowledgeBaseArticles.id,
          title: knowledgeBaseArticles.title,
          slug: knowledgeBaseArticles.slug,
          excerpt: knowledgeBaseArticles.excerpt,
        })
        .from(knowledgeBaseArticles)
        .where(and(
          eq(knowledgeBaseArticles.status, 'PUBLISHED'),
          eq(knowledgeBaseArticles.isPublic, true),
          or(
            sql`${knowledgeBaseArticles.title} ILIKE ${`%${input.query}%`}`,
            sql`${knowledgeBaseArticles.content} ILIKE ${`%${input.query}%`}`,
            sql`${knowledgeBaseArticles.searchKeywords} @> ${[input.query]}`
          )
        ))
        .limit(input.limit);

      return articles;
    }),
});

export type SupportRouter = typeof supportRouter; 