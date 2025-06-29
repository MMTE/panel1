import { pgTable, uuid, text, timestamp, boolean, integer, pgEnum, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { clients } from './clients';
import { tenants } from './tenants';

// Enums for support system
export const ticketStatusEnum = pgEnum('ticket_status', [
  'OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_STAFF', 'RESOLVED', 'CLOSED'
]);

export const ticketPriorityEnum = pgEnum('ticket_priority', [
  'LOW', 'MEDIUM', 'HIGH', 'URGENT'
]);

export const messageTypeEnum = pgEnum('message_type', [
  'CUSTOMER_MESSAGE', 'STAFF_REPLY', 'INTERNAL_NOTE', 'SYSTEM_MESSAGE', 'AUTO_RESPONSE'
]);

export const knowledgeBaseStatusEnum = pgEnum('kb_status', [
  'DRAFT', 'PUBLISHED', 'ARCHIVED'
]);

// Support categories for ticket organization
export const supportCategories = pgTable('support_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  color: text('color').default('#6366f1'), // Default purple
  icon: text('icon').default('Help'), // Lucide icon name
  parentCategoryId: uuid('parent_category_id'),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').default(true),
  // Auto-assignment rules
  defaultAssigneeId: uuid('default_assignee_id'),
  autoAssignmentRules: jsonb('auto_assignment_rules').$type<{
    keywords?: string[];
    priority?: string;
    skipAutoAssignment?: boolean;
  }>(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Main support tickets table
export const supportTickets = pgTable('support_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketNumber: text('ticket_number').notNull().unique(), // TKT-2025-000001
  subject: text('subject').notNull(),
  status: ticketStatusEnum('status').default('OPEN'),
  priority: ticketPriorityEnum('priority').default('MEDIUM'),
  
  // Relationships
  clientId: uuid('client_id').references(() => clients.id),
  categoryId: uuid('category_id').references(() => supportCategories.id),
  assignedToId: uuid('assigned_to_id').references(() => users.id),
  createdById: uuid('created_by_id').references(() => users.id),
  
  // Metadata
  tags: jsonb('tags').$type<string[]>().default([]),
  customFields: jsonb('custom_fields').$type<Record<string, any>>().default({}),
  
  // SLA tracking
  firstResponseDue: timestamp('first_response_due', { withTimezone: true }),
  resolutionDue: timestamp('resolution_due', { withTimezone: true }),
  firstResponseAt: timestamp('first_response_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  
  // Auto-escalation
  escalationLevel: integer('escalation_level').default(0),
  lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).defaultNow(),
  
  // Satisfaction tracking
  satisfactionRating: integer('satisfaction_rating'), // 1-5 stars
  satisfactionFeedback: text('satisfaction_feedback'),
  
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Ticket messages/replies
export const ticketMessages = pgTable('ticket_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id').references(() => supportTickets.id, { onDelete: 'cascade' }).notNull(),
  content: text('content').notNull(),
  htmlContent: text('html_content'), // Rich text version
  messageType: messageTypeEnum('message_type').default('CUSTOMER_MESSAGE'),
  
  // Author information
  authorId: uuid('author_id').references(() => users.id),
  authorEmail: text('author_email'), // For guest messages
  authorName: text('author_name'), // For guest messages
  
  // Visibility and internal notes
  isInternal: boolean('is_internal').default(false),
  isCustomerVisible: boolean('is_customer_visible').default(true),
  
  // Attachments
  attachments: jsonb('attachments').$type<Array<{
    filename: string;
    fileSize: number;
    mimeType: string;
    url: string;
    uploadedAt: string;
  }>>().default([]),
  
  // Time tracking
  timeSpent: integer('time_spent'), // Minutes spent on this message
  
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Knowledge base categories
export const knowledgeBaseCategories = pgTable('knowledge_base_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  icon: text('icon').default('Book'),
  parentCategoryId: uuid('parent_category_id'),
  sortOrder: integer('sort_order').default(0),
  isPublic: boolean('is_public').default(true),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Knowledge base articles
export const knowledgeBaseArticles = pgTable('knowledge_base_articles', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  slug: text('slug').notNull(),
  content: text('content').notNull(),
  excerpt: text('excerpt'),
  status: knowledgeBaseStatusEnum('status').default('DRAFT'),
  
  // Categorization
  categoryId: uuid('category_id').references(() => knowledgeBaseCategories.id),
  tags: jsonb('tags').$type<string[]>().default([]),
  
  // SEO and search
  metaTitle: text('meta_title'),
  metaDescription: text('meta_description'),
  searchKeywords: jsonb('search_keywords').$type<string[]>().default([]),
  
  // Analytics
  viewCount: integer('view_count').default(0),
  helpfulVotes: integer('helpful_votes').default(0),
  unhelpfulVotes: integer('unhelpful_votes').default(0),
  
  // Visibility
  isPublic: boolean('is_public').default(true),
  requiresAuth: boolean('requires_auth').default(false),
  
  // Authoring
  authorId: uuid('author_id').references(() => users.id).notNull(),
  lastEditedById: uuid('last_edited_by_id').references(() => users.id),
  
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
});

// Support automation rules
export const supportAutomationRules = pgTable('support_automation_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  isActive: boolean('is_active').default(true),
  
  // Trigger conditions
  triggerEvent: text('trigger_event').notNull(), // 'ticket.created', 'ticket.updated', etc.
  conditions: jsonb('conditions').$type<{
    field: string;
    operator: string;
    value: any;
  }[]>().notNull(),
  
  // Actions to perform
  actions: jsonb('actions').$type<{
    type: string;
    parameters: Record<string, any>;
  }[]>().notNull(),
  
  // Execution settings
  priority: integer('priority').default(0), // Higher number = higher priority
  maxExecutions: integer('max_executions'), // Limit per ticket
  executionCount: integer('execution_count').default(0),
  
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// SLA policies
export const supportSlaProfiles = pgTable('support_sla_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  isDefault: boolean('is_default').default(false),
  isActive: boolean('is_active').default(true),
  
  // SLA targets (in minutes)
  firstResponseTime: integer('first_response_time').notNull(), // e.g., 60 minutes
  resolutionTime: integer('resolution_time').notNull(), // e.g., 1440 minutes (24 hours)
  
  // Business hours
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
  
  // Escalation rules
  escalationRules: jsonb('escalation_rules').$type<Array<{
    afterMinutes: number;
    assignToId?: string;
    notifyUserIds: string[];
    changePriority?: string;
  }>>().default([]),
  
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Support team member profiles
export const supportAgentProfiles = pgTable('support_agent_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  
  // Agent configuration
  isActive: boolean('is_active').default(true),
  maxTickets: integer('max_tickets').default(50),
  currentTickets: integer('current_tickets').default(0),
  
  // Skills and categories
  categories: jsonb('categories').$type<string[]>().default([]), // Category IDs they can handle
  skills: jsonb('skills').$type<string[]>().default([]),
  languages: jsonb('languages').$type<string[]>().default(['en']),
  
  // Availability
  workingHours: jsonb('working_hours').$type<{
    timezone: string;
    schedule: Record<string, { start: string; end: string; enabled: boolean }>;
  }>(),
  isCurrentlyAvailable: boolean('is_currently_available').default(true),
  lastActiveAt: timestamp('last_active_at', { withTimezone: true }).defaultNow(),
  
  // Performance metrics
  averageFirstResponseTime: integer('avg_first_response_time'), // Minutes
  averageResolutionTime: integer('avg_resolution_time'), // Minutes
  satisfactionScore: integer('satisfaction_score'), // Average 1-5 rating
  ticketsResolved: integer('tickets_resolved').default(0),
  
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Relations
export const supportCategoriesRelations = relations(supportCategories, ({ one, many }) => ({
  parent: one(supportCategories, {
    fields: [supportCategories.parentCategoryId],
    references: [supportCategories.id],
  }),
  children: many(supportCategories),
  tickets: many(supportTickets),
  defaultAssignee: one(users, {
    fields: [supportCategories.defaultAssigneeId],
    references: [users.id],
  }),
  tenant: one(tenants, {
    fields: [supportCategories.tenantId],
    references: [tenants.id],
  }),
}));

export const supportTicketsRelations = relations(supportTickets, ({ one, many }) => ({
  client: one(clients, {
    fields: [supportTickets.clientId],
    references: [clients.id],
  }),
  category: one(supportCategories, {
    fields: [supportTickets.categoryId],
    references: [supportCategories.id],
  }),
  assignedTo: one(users, {
    fields: [supportTickets.assignedToId],
    references: [users.id],
  }),
  createdBy: one(users, {
    fields: [supportTickets.createdById],
    references: [users.id],
  }),
  messages: many(ticketMessages),
  tenant: one(tenants, {
    fields: [supportTickets.tenantId],
    references: [tenants.id],
  }),
}));

export const ticketMessagesRelations = relations(ticketMessages, ({ one }) => ({
  ticket: one(supportTickets, {
    fields: [ticketMessages.ticketId],
    references: [supportTickets.id],
  }),
  author: one(users, {
    fields: [ticketMessages.authorId],
    references: [users.id],
  }),
  tenant: one(tenants, {
    fields: [ticketMessages.tenantId],
    references: [tenants.id],
  }),
}));

export const knowledgeBaseCategoriesRelations = relations(knowledgeBaseCategories, ({ one, many }) => ({
  parent: one(knowledgeBaseCategories, {
    fields: [knowledgeBaseCategories.parentCategoryId],
    references: [knowledgeBaseCategories.id],
  }),
  children: many(knowledgeBaseCategories),
  articles: many(knowledgeBaseArticles),
  tenant: one(tenants, {
    fields: [knowledgeBaseCategories.tenantId],
    references: [tenants.id],
  }),
}));

export const knowledgeBaseArticlesRelations = relations(knowledgeBaseArticles, ({ one }) => ({
  category: one(knowledgeBaseCategories, {
    fields: [knowledgeBaseArticles.categoryId],
    references: [knowledgeBaseCategories.id],
  }),
  author: one(users, {
    fields: [knowledgeBaseArticles.authorId],
    references: [users.id],
  }),
  lastEditedBy: one(users, {
    fields: [knowledgeBaseArticles.lastEditedById],
    references: [users.id],
  }),
  tenant: one(tenants, {
    fields: [knowledgeBaseArticles.tenantId],
    references: [tenants.id],
  }),
}));

export const supportAutomationRulesRelations = relations(supportAutomationRules, ({ one }) => ({
  tenant: one(tenants, {
    fields: [supportAutomationRules.tenantId],
    references: [tenants.id],
  }),
}));

export const supportSlaProfilesRelations = relations(supportSlaProfiles, ({ one }) => ({
  tenant: one(tenants, {
    fields: [supportSlaProfiles.tenantId],
    references: [tenants.id],
  }),
}));

export const supportAgentProfilesRelations = relations(supportAgentProfiles, ({ one }) => ({
  user: one(users, {
    fields: [supportAgentProfiles.userId],
    references: [users.id],
  }),
  tenant: one(tenants, {
    fields: [supportAgentProfiles.tenantId],
    references: [tenants.id],
  }),
}));

// Type exports
export type SupportTicket = typeof supportTickets.$inferSelect;
export type NewSupportTicket = typeof supportTickets.$inferInsert;
export type TicketMessage = typeof ticketMessages.$inferSelect;
export type NewTicketMessage = typeof ticketMessages.$inferInsert;
export type SupportCategory = typeof supportCategories.$inferSelect;
export type NewSupportCategory = typeof supportCategories.$inferInsert;
export type KnowledgeBaseArticle = typeof knowledgeBaseArticles.$inferSelect;
export type NewKnowledgeBaseArticle = typeof knowledgeBaseArticles.$inferInsert;
export type SupportAutomationRule = typeof supportAutomationRules.$inferSelect;
export type NewSupportAutomationRule = typeof supportAutomationRules.$inferInsert;
export type SupportSlaProfile = typeof supportSlaProfiles.$inferSelect;
export type NewSupportSlaProfile = typeof supportSlaProfiles.$inferInsert;
export type SupportAgentProfile = typeof supportAgentProfiles.$inferSelect;
export type NewSupportAgentProfile = typeof supportAgentProfiles.$inferInsert; 