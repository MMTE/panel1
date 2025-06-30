import { pgTable, varchar, text, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const componentProviders = pgTable('component_providers', {
	componentKey: varchar('component_key', { length: 255 }).primaryKey(),
	name: varchar('name', { length: 255 }).notNull(),
	version: varchar('version', { length: 50 }).notNull(),
	description: text('description'),
	metadata: jsonb('metadata'),
	createdAt: timestamp('created_at').defaultNow(),
	updatedAt: timestamp('updated_at').defaultNow(),
}); 