import { pgTable, text, uuid, timestamp, jsonb, varchar } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tenants } from './tenants';

/**
 * Plugins table
 */
export const plugins = pgTable('plugins', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  version: varchar('version', { length: 50 }).notNull(),
  description: text('description'),
  author: varchar('author', { length: 255 }),
  status: varchar('status', { length: 50 }).notNull().default('available'),
  installedAt: timestamp('installed_at'),
  updatedAt: timestamp('updated_at').defaultNow(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
});

/**
 * Plugin configurations table
 */
export const pluginConfigs = pgTable('plugin_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  pluginId: varchar('plugin_id', { length: 255 }).references(() => plugins.id, { onDelete: 'cascade' }).notNull(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  config: jsonb('config').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Plugin hooks table
 */
export const pluginHooks = pgTable('plugin_hooks', {
  id: text('id').primaryKey(),
  pluginId: text('plugin_id').notNull().references(() => plugins.id, { onDelete: 'cascade' }),
  event: text('event').notNull(),
  priority: text('priority').notNull().default('0'),
  handler: text('handler').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Plugin extension points table
 */
export const pluginExtensionPoints = pgTable('plugin_extension_points', {
  id: text('id').primaryKey(),
  pluginId: text('plugin_id').notNull().references(() => plugins.id, { onDelete: 'cascade' }),
  description: text('description'),
  schema: jsonb('schema'),
  defaultConfig: jsonb('default_config'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Relations
export const pluginsRelations = relations(plugins, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [plugins.tenantId],
    references: [tenants.id],
  }),
  configs: many(pluginConfigs),
}));

export const pluginConfigsRelations = relations(pluginConfigs, ({ one }) => ({
  plugin: one(plugins, {
    fields: [pluginConfigs.pluginId],
    references: [plugins.id],
  }),
  tenant: one(tenants, {
    fields: [pluginConfigs.tenantId],
    references: [tenants.id],
  }),
}));

export type PluginSchema = typeof plugins.$inferSelect;
export type NewPluginSchema = typeof plugins.$inferInsert;
export type PluginConfigSchema = typeof pluginConfigs.$inferSelect;
export type NewPluginConfigSchema = typeof pluginConfigs.$inferInsert;