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
  serial
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants } from './tenants';
import { subscriptions } from './subscriptions';
import { componentProviders } from './componentProviders';

// Components table for storing component definitions
export const components = pgTable('components', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description').notNull(),
  componentKey: text('component_key').notNull(),
  version: text('version').notNull().default('1.0.0'),
  isActive: boolean('is_active').notNull().default(true),
  configuration: jsonb('configuration').notNull().$type<Record<string, any>>(),
  metadata: jsonb('metadata').notNull().$type<{
    supportedPricingModels: string[];
    requiredConfigFields: string[];
    optionalConfigFields: string[];
    usageTrackingSupported: boolean;
    provisioningRequired?: boolean;
    provisioningProvider?: string;
    compatibilityRequirements?: {
      minSystemVersion?: string;
      requiredFeatures?: string[];
      incompatibleWith?: string[];
    };
  }>(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Products table for storing product definitions
export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  shortDescription: varchar('short_description', { length: 255 }),
  category: varchar('category', { length: 100 }),
  tags: jsonb('tags').default([]),
  isActive: boolean('is_active').default(true),
  isPublic: boolean('is_public').default(false),
  sortOrder: integer('sort_order').default(0),
  trialPeriodDays: integer('trial_period_days'),
  setupRequired: boolean('setup_required').default(false),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
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
  productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  interval: varchar('interval', { length: 50 }).notNull(), // e.g., 'MONTHLY', 'YEARLY'
  intervalCount: integer('interval_count').notNull().default(1),
  basePrice: varchar('base_price', { length: 20 }).notNull().default('0'),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  setupFee: varchar('setup_fee', { length: 20 }).notNull().default('0'),
  trialPeriodDays: integer('trial_period_days').notNull().default(0),
  isDefault: boolean('is_default').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  metadata: jsonb('metadata').$type<Record<string, any>>(),
  tenantId: uuid('tenant_id').references(() => tenants.id).notNull(),
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

export const billingPlansRelations = relations(billingPlans, ({ one }) => ({
  product: one(products, {
    fields: [billingPlans.productId],
    references: [products.id],
  }),
  tenant: one(tenants, {
    fields: [billingPlans.tenantId],
    references: [tenants.id],
  }),
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