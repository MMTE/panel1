import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

/**
 * Plugins table
 */
export const plugins = pgTable('plugins', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  version: text('version').notNull(),
  description: text('description'),
  status: text('status').notNull().default('installed'),
  metadata: jsonb('metadata'),
  installedAt: timestamp('installed_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Plugin configurations table
 */
export const pluginConfigs = pgTable('plugin_configs', {
  pluginId: text('plugin_id').primaryKey().references(() => plugins.id, { onDelete: 'cascade' }),
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