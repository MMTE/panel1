import {
  pgTable,
  text,
  timestamp,
  boolean,
  uuid,
  jsonb,
  integer,
  decimal,
  varchar,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const billingIntervalLegacyEnum = pgEnum('billing_interval', [
  'MONTHLY',
  'YEARLY',
  'WEEKLY',
  'DAILY',
]);

export const componentProviders = pgTable('component_providers', {
  componentKey: varchar('component_key', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  version: varchar('version', { length: 50 }).notNull(),
  description: text('description'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const components = pgTable('components', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description').notNull(),
  componentKey: text('component_key').notNull(),
  version: text('version').notNull().default('1.0.0'),
  isActive: boolean('is_active').notNull().default(true),
  configuration: jsonb('configuration').$type<Record<string, unknown>>().notNull(),
  metadata: jsonb('metadata')
    .$type<Record<string, unknown> & {
      supportedPricingModels?: string[];
      requiredConfigFields?: string[];
      optionalConfigFields?: string[];
      usageTrackingSupported?: boolean;
      provisioningRequired?: boolean;
      provisioningProvider?: string;
      configFieldTypes?: Record<string, string>;
      configFieldOptions?: Record<string, Array<{ value: string; label: string }>>;
      tags?: string[];
      icon?: string;
    }>()
    .notNull(),
  tenantId: uuid('tenant_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  shortDescription: varchar('short_description', { length: 255 }),
  category: varchar('category', { length: 100 }),
  tags: jsonb('tags').$type<string[]>().default([]),
  isActive: boolean('is_active').default(true),
  isPublic: boolean('is_public').default(false),
  sortOrder: integer('sort_order').default(0),
  trialPeriodDays: integer('trial_period_days'),
  setupRequired: boolean('setup_required').default(false),
  tenantId: uuid('tenant_id'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const productComponents = pgTable('product_components', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull(),
  componentId: uuid('component_id').notNull(),
  pricingModel: varchar('pricing_model', { length: 50 }),
  pricingDetails: jsonb('pricing_details'),
  configuration: jsonb('configuration').$type<Record<string, unknown>>(),
  sortOrder: integer('sort_order').notNull().default(0),
  tenantId: uuid('tenant_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const billingPlans = pgTable('billing_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  interval: varchar('interval', { length: 50 }).notNull(),
  intervalCount: integer('interval_count').notNull().default(1),
  basePrice: varchar('base_price', { length: 20 }).notNull().default('0'),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  setupFee: varchar('setup_fee', { length: 20 }).notNull().default('0'),
  trialPeriodDays: integer('trial_period_days').notNull().default(0),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  metadata: jsonb('metadata'),
  tenantId: uuid('tenant_id').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const subscribedComponents = pgTable('subscribed_components', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionId: uuid('subscription_id').notNull(),
  componentId: uuid('component_id').notNull(),
  productComponentId: uuid('product_component_id').notNull(),
  quantity: integer('quantity').notNull().default(1),
  currentUsage: decimal('current_usage', { precision: 15, scale: 4 }).default('0'),
  usageLimit: decimal('usage_limit', { precision: 15, scale: 4 }),
  isActive: boolean('is_active').notNull().default(true),
  configuration: jsonb('configuration').$type<Record<string, unknown>>(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  tenantId: uuid('tenant_id').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  currency: text('currency').default('USD'),
  interval: billingIntervalLegacyEnum('interval').notNull(),
  isActive: boolean('is_active').default(true),
  features: jsonb('features'),
  trialPeriodDays: integer('trial_period_days').default(0),
  setupFee: decimal('setup_fee', { precision: 10, scale: 2 }).default('0'),
  tenantId: uuid('tenant_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const productsRelations = relations(products, ({ many }) => ({
  components: many(productComponents),
  billingPlans: many(billingPlans),
}));

export const componentsRelations = relations(components, ({ many }) => ({
  productComponents: many(productComponents),
}));

export const productComponentsRelations = relations(productComponents, ({ one }) => ({
  product: one(products, {
    fields: [productComponents.productId],
    references: [products.id],
  }),
  component: one(components, {
    fields: [productComponents.componentId],
    references: [components.id],
  }),
}));

export const billingPlansRelations = relations(billingPlans, ({ one }) => ({
  product: one(products, {
    fields: [billingPlans.productId],
    references: [products.id],
  }),
}));

export const catalogSchema = {
  componentProviders,
  components,
  componentsRelations,
  products,
  productsRelations,
  productComponents,
  productComponentsRelations,
  billingPlans,
  billingPlansRelations,
  subscribedComponents,
  plans,
};
