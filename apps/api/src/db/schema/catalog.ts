import { 
  pgTable,
  text,
  timestamp,
  boolean,
  uuid,
  jsonb,
  integer,
  decimal,
  primaryKey,
  varchar,
  serial,
  pgEnum
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants } from './tenants';
import { subscriptions } from './subscriptions';
import { componentProviders } from './componentProviders';
import { clients } from './clients';

export const componentTypeEnum = pgEnum('component_type', [
  'DOMAIN',
  'HOSTING',
  'SSL',
  'EMAIL',
  'DATABASE',
  'BACKUP',
  'MONITORING',
  'SECURITY',
  'SUPPORT',
  'CUSTOM'
]);

export const pricingModelEnum = pgEnum('pricing_model', [
  'FLAT',
  'TIERED',
  'VOLUME',
  'GRADUATED',
  'USAGE_BASED',
  'CUSTOM'
]);

export const billingIntervalEnum = pgEnum('billing_interval', [
  'HOURLY',
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'YEARLY'
]);

// Components table for storing component definitions
export const components = pgTable('components', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description').notNull(),
  componentKey: text('component_key').notNull(),
  version: text('version').notNull().default('1.0.0'),
  isActive: boolean('is_active').notNull().default(true),
  type: componentTypeEnum('type').notNull(),
  provider: varchar('provider', { length: 100 }).notNull(),
  features: jsonb('features').$type<string[]>().default([]),
  options: jsonb('options').$type<Record<string, any>>().default({}),
  configuration: jsonb('configuration').$type<Record<string, any>>().notNull(),
  metadata: jsonb('metadata').$type<{
    supportedPricingModels: string[];
    requiredConfigFields: string[];
    optionalConfigFields: string[];
    compatibilityRequirements?: {
      minVersion?: string;
      maxVersion?: string;
      dependencies?: string[];
    };
    icon?: string;
  }>().notNull(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Products table for storing product definitions
export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata').$type<Record<string, any>>().default({}),
  sortOrder: integer('sort_order').default(0),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Product Components junction table
export const productComponents = pgTable('product_components', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }).notNull(),
  componentId: uuid('component_id').references(() => components.id, { onDelete: 'cascade' }).notNull(),
  pricingModel: varchar('pricing_model', { length: 50 }), // e.g., 'FIXED', 'PER_UNIT'
  pricingDetails: jsonb('pricing_details'), // For complex pricing
  configuration: jsonb('configuration').$type<Record<string, any>>(),
  sortOrder: integer('sort_order').notNull().default(0),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Billing Plans table
export const billingPlans = pgTable('billing_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  metadata: jsonb('metadata').$type<Record<string, any>>().default({}),
  sortOrder: integer('sort_order').default(0),
  trialPeriodDays: integer('trial_period_days'),
  productId: uuid('product_id').references(() => products.id),
  interval: billingIntervalEnum('interval').notNull(),
  intervalCount: integer('interval_count').notNull().default(1),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  isDefault: boolean('is_default').default(false),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Relations
export const componentDefinitionsRelations = relations(components, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [components.tenantId],
    references: [tenants.id],
  }),
  productComponents: many(productComponents),
  provider: one(componentProviders, {
    fields: [components.componentKey],
    references: [componentProviders.componentKey],
  }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [products.tenantId],
    references: [tenants.id],
  }),
  components: many(productComponents),
  billingPlans: many(billingPlans),
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
  tenant: one(tenants, {
    fields: [productComponents.tenantId],
    references: [tenants.id],
  }),
}));

export const billingPlansRelations = relations(billingPlans, ({ one, many }) => ({
  product: one(products, {
    fields: [billingPlans.productId],
    references: [products.id],
  }),
  tenant: one(tenants, {
    fields: [billingPlans.tenantId],
    references: [tenants.id],
  }),
  components: many(planComponents)
}));

// Type exports
export type ComponentDefinition = typeof components.$inferSelect;
export type NewComponentDefinition = typeof components.$inferInsert;

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export type ProductComponent = typeof productComponents.$inferSelect;
export type NewProductComponent = typeof productComponents.$inferInsert;

export type BillingPlan = typeof billingPlans.$inferSelect;
export type NewBillingPlan = typeof billingPlans.$inferInsert;

// Subscribed Components table - tracks components that clients have subscribed to
export const subscribedComponents = pgTable('subscribed_components', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'cascade' }).notNull(),
  componentId: uuid('component_id').references(() => components.id, { onDelete: 'cascade' }).notNull(),
  productComponentId: uuid('product_component_id').references(() => productComponents.id, { onDelete: 'cascade' }).notNull(),
  quantity: integer('quantity').notNull().default(1),
  currentUsage: decimal('current_usage', { precision: 15, scale: 4 }).default('0'),
  usageLimit: decimal('usage_limit', { precision: 15, scale: 4 }),
  isActive: boolean('is_active').notNull().default(true),
  configuration: jsonb('configuration').$type<Record<string, any>>(),
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const subscribedComponentsRelations = relations(subscribedComponents, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [subscribedComponents.subscriptionId],
    references: [subscriptions.id],
  }),
  component: one(components, {
    fields: [subscribedComponents.componentId],
    references: [components.id],
  }),
  productComponent: one(productComponents, {
    fields: [subscribedComponents.productComponentId],
    references: [productComponents.id],
  }),
  tenant: one(tenants, {
    fields: [subscribedComponents.tenantId],
    references: [tenants.id],
  }),
}));

export type ComponentProvider = typeof componentProviders.$inferSelect;
export type NewComponentProvider = typeof componentProviders.$inferInsert;

export type SubscribedComponent = typeof subscribedComponents.$inferSelect;
export type NewSubscribedComponent = typeof subscribedComponents.$inferInsert;

export const planComponents = pgTable('plan_components', {
  id: uuid('id').primaryKey().defaultRandom(),
  planId: uuid('plan_id').references(() => billingPlans.id),
  componentId: uuid('component_id').references(() => components.id),
  pricingModel: pricingModelEnum('pricing_model').notNull(),
  configuration: jsonb('configuration').$type<Record<string, any>>().notNull(),
  limits: jsonb('limits').$type<{
    min?: number;
    max?: number;
    step?: number;
    default?: number;
  }>(),
  pricing: jsonb('pricing').$type<{
    basePrice?: number;
    unitPrice?: number;
    tiers?: Array<{
      upTo: number;
      price: number;
    }>;
  }>(),
  metadata: jsonb('metadata').$type<Record<string, any>>().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const planComponentRelations = relations(planComponents, ({ one }) => ({
  plan: one(billingPlans, {
    fields: [planComponents.planId],
    references: [billingPlans.id]
  }),
  component: one(components, {
    fields: [planComponents.componentId],
    references: [components.id]
  })
}));

export const componentRelations = relations(components, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [components.tenantId],
    references: [tenants.id]
  }),
  planComponents: many(planComponents)
})); 