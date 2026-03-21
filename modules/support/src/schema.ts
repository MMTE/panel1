import { pgTable, uuid, text, timestamp, boolean, integer, pgEnum, jsonb, index } from 'drizzle-orm/pg-core';

export const ticketStatusEnum = pgEnum('ticket_status', [
  'OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_STAFF', 'RESOLVED', 'CLOSED',
]);

export const ticketPriorityEnum = pgEnum('ticket_priority', [
  'LOW', 'MEDIUM', 'HIGH', 'URGENT',
]);

export const messageTypeEnum = pgEnum('message_type', [
  'CUSTOMER_MESSAGE', 'STAFF_REPLY', 'INTERNAL_NOTE', 'SYSTEM_MESSAGE', 'AUTO_RESPONSE',
]);

export const knowledgeBaseStatusEnum = pgEnum('kb_status', [
  'DRAFT', 'PUBLISHED', 'ARCHIVED',
]);

export const supportCategories = pgTable('support_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  color: text('color').default('#6366f1'),
  icon: text('icon').default('Help'),
  parentCategoryId: uuid('parent_category_id'),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').default(true),
  defaultAssigneeId: uuid('default_assignee_id'),
  autoAssignmentRules: jsonb('auto_assignment_rules').$type<{
    keywords?: string[];
    priority?: string;
    skipAutoAssignment?: boolean;
  }>(),
  tenantId: uuid('tenant_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const supportTickets = pgTable('support_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketNumber: text('ticket_number').notNull().unique(),
  subject: text('subject').notNull(),
  status: ticketStatusEnum('status').default('OPEN'),
  priority: ticketPriorityEnum('priority').default('MEDIUM'),
  clientId: uuid('client_id'),
  categoryId: uuid('category_id'),
  assignedToId: uuid('assigned_to_id'),
  createdById: uuid('created_by_id'),
  assignedAt: timestamp('assigned_at', { withTimezone: true }),
  tags: jsonb('tags').$type<string[]>().default([]),
  customFields: jsonb('custom_fields').$type<Record<string, any>>().default({}),
  groupId: uuid('group_id'),
  firstResponseDue: timestamp('first_response_due', { withTimezone: true }),
  resolutionDue: timestamp('resolution_due', { withTimezone: true }),
  firstResponseAt: timestamp('first_response_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  escalationLevel: integer('escalation_level').default(0),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).defaultNow(),
  satisfactionRating: integer('satisfaction_rating'),
  satisfactionFeedback: text('satisfaction_feedback'),
  tenantId: uuid('tenant_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  tenantIdx: index('support_tickets_tenant_idx').on(table.tenantId),
  statusIdx: index('support_tickets_status_idx').on(table.status),
  clientIdx: index('support_tickets_client_idx').on(table.clientId),
  assignedIdx: index('support_tickets_assigned_idx').on(table.assignedToId),
  categoryIdx: index('support_tickets_category_idx').on(table.categoryId),
  lastActivityIdx: index('support_tickets_last_activity_idx').on(table.lastActivityAt),
}));

export const ticketMessages = pgTable('ticket_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id').notNull(),
  content: text('content').notNull(),
  htmlContent: text('html_content'),
  messageType: messageTypeEnum('message_type').default('CUSTOMER_MESSAGE'),
  authorId: uuid('author_id'),
  authorEmail: text('author_email'),
  authorName: text('author_name'),
  isInternal: boolean('is_internal').default(false),
  isCustomerVisible: boolean('is_customer_visible').default(true),
  attachments: jsonb('attachments').$type<Array<{
    filename: string;
    fileSize: number;
    mimeType: string;
    url: string;
    uploadedAt: string;
  }>>().default([]),
  timeSpent: integer('time_spent'),
  tenantId: uuid('tenant_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  ticketIdx: index('ticket_messages_ticket_idx').on(table.ticketId),
  tenantIdx: index('ticket_messages_tenant_idx').on(table.tenantId),
}));

export const knowledgeBaseCategories = pgTable('knowledge_base_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  icon: text('icon').default('Book'),
  parentCategoryId: uuid('parent_category_id'),
  sortOrder: integer('sort_order').default(0),
  isPublic: boolean('is_public').default(true),
  tenantId: uuid('tenant_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const knowledgeBaseArticles = pgTable('knowledge_base_articles', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  slug: text('slug').notNull(),
  content: text('content').notNull(),
  excerpt: text('excerpt'),
  status: knowledgeBaseStatusEnum('status').default('DRAFT'),
  categoryId: uuid('category_id'),
  tags: jsonb('tags').$type<string[]>().default([]),
  metaTitle: text('meta_title'),
  metaDescription: text('meta_description'),
  searchKeywords: jsonb('search_keywords').$type<string[]>().default([]),
  viewCount: integer('view_count').default(0),
  helpfulVotes: integer('helpful_votes').default(0),
  unhelpfulVotes: integer('unhelpful_votes').default(0),
  isPublic: boolean('is_public').default(true),
  requiresAuth: boolean('requires_auth').default(false),
  authorId: uuid('author_id').notNull(),
  lastEditedById: uuid('last_edited_by_id'),
  tenantId: uuid('tenant_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
}, (table) => ({
  slugIdx: index('kb_articles_slug_idx').on(table.slug),
  tenantIdx: index('kb_articles_tenant_idx').on(table.tenantId),
  statusIdx: index('kb_articles_status_idx').on(table.status),
}));

export const supportAutomationRules = pgTable('support_automation_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  isActive: boolean('is_active').default(true),
  triggerEvent: text('trigger_event').notNull(),
  conditions: jsonb('conditions').$type<{
    field: string;
    operator: string;
    value: any;
  }[]>().notNull(),
  actions: jsonb('actions').$type<{
    type: string;
    parameters: Record<string, any>;
  }[]>().notNull(),
  priority: integer('priority').default(0),
  maxExecutions: integer('max_executions'),
  executionCount: integer('execution_count').default(0),
  tenantId: uuid('tenant_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const supportSlaProfiles = pgTable('support_sla_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  isDefault: boolean('is_default').default(false),
  isActive: boolean('is_active').default(true),
  firstResponseTime: integer('first_response_time').notNull(),
  resolutionTime: integer('resolution_time').notNull(),
  businessHours: jsonb('business_hours').$type<{
    timezone: string;
    monday: { start: string; end: string; enabled: boolean };
    tuesday: { start: string; end: string; enabled: boolean };
    wednesday: { start: string; end: string; enabled: boolean };
    thursday: { start: string; end: string; enabled: boolean };
    friday: { start: string; end: string; enabled: boolean };
    saturday: { start: string; end: string; enabled: boolean };
    sunday: { start: string; end: string; enabled: boolean };
  }>(),
  escalationRules: jsonb('escalation_rules').$type<Array<{
    afterMinutes: number;
    assignToId?: string;
    notifyUserIds: string[];
    changePriority?: string;
  }>>().default([]),
  tenantId: uuid('tenant_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const supportAgentProfiles = pgTable('support_agent_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  isActive: boolean('is_active').default(true),
  maxTickets: integer('max_tickets').default(50),
  currentTickets: integer('current_tickets').default(0),
  categories: jsonb('categories').$type<string[]>().default([]),
  skills: jsonb('skills').$type<string[]>().default([]),
  languages: jsonb('languages').$type<string[]>().default(['en']),
  workingHours: jsonb('working_hours').$type<{
    timezone: string;
    schedule: Record<string, { start: string; end: string; enabled: boolean }>;
  }>(),
  isCurrentlyAvailable: boolean('is_currently_available').default(true),
  lastActiveAt: timestamp('last_active_at', { withTimezone: true }).defaultNow(),
  averageFirstResponseTime: integer('avg_first_response_time'),
  averageResolutionTime: integer('avg_resolution_time'),
  satisfactionScore: integer('satisfaction_score'),
  ticketsResolved: integer('tickets_resolved').default(0),
  categoryExperience: jsonb('category_experience').$type<Record<string, number>>(),
  currentTicketCount: integer('current_ticket_count').default(0),
  tenantId: uuid('tenant_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const supportTicketCounters = pgTable('support_ticket_counters', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  year: integer('year').notNull(),
  lastNumber: integer('last_number').notNull().default(0),
  prefix: text('prefix').notNull().default('TKT'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  tenantYearPrefixIdx: index('support_counters_tenant_year_prefix_idx').on(table.tenantId, table.year, table.prefix),
}));

export const supportSchema = {
  supportCategories,
  supportTickets,
  ticketMessages,
  knowledgeBaseCategories,
  knowledgeBaseArticles,
  supportAutomationRules,
  supportSlaProfiles,
  supportAgentProfiles,
  supportTicketCounters,
};

export type SupportTicket = typeof supportTickets.$inferSelect;
export type NewSupportTicket = typeof supportTickets.$inferInsert;
export type TicketMessage = typeof ticketMessages.$inferSelect;
export type NewTicketMessage = typeof ticketMessages.$inferInsert;
export type SupportCategory = typeof supportCategories.$inferSelect;
export type SupportAgentProfile = typeof supportAgentProfiles.$inferSelect;
export type SupportSlaProfile = typeof supportSlaProfiles.$inferSelect;
export type SupportAutomationRule = typeof supportAutomationRules.$inferSelect;
export type KnowledgeBaseArticle = typeof knowledgeBaseArticles.$inferSelect;
