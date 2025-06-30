import { pgTable, varchar, text, boolean, jsonb, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './users';
import { tenants } from './tenants';

export const roles = pgTable('roles', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  isSystem: boolean('is_system').default(false),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
});

export const permissions = pgTable('permissions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  resource: varchar('resource', { length: 255 }).notNull(),
  action: varchar('action', { length: 255 }).notNull(),
  description: text('description'),
  conditions: jsonb('conditions'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
});

export const rolePermissions = pgTable('role_permissions', {
  roleId: varchar('role_id', { length: 255 })
    .references(() => roles.id, { onDelete: 'cascade' }),
  permissionId: varchar('permission_id', { length: 255 })
    .references(() => permissions.id, { onDelete: 'cascade' }),
  grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow(),
  grantedBy: varchar('granted_by', { length: 255 }),
  conditions: jsonb('conditions')
}, (table) => ({
  pk: primaryKey(table.roleId, table.permissionId)
}));

export const roleHierarchy = pgTable('role_hierarchy', {
  parentRole: varchar('parent_role', { length: 255 })
    .references(() => roles.id, { onDelete: 'cascade' }),
  childRole: varchar('child_role', { length: 255 })
    .references(() => roles.id, { onDelete: 'cascade' }),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
}, (table) => ({
  pk: primaryKey(table.parentRole, table.childRole)
}));

export const userRoles = pgTable('user_roles', {
  userId: varchar('user_id', { length: 255 })
    .references(() => users.id, { onDelete: 'cascade' }),
  roleId: varchar('role_id', { length: 255 })
    .references(() => roles.id, { onDelete: 'cascade' }),
  tenantId: varchar('tenant_id', { length: 255 })
    .references(() => tenants.id, { onDelete: 'cascade' }),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow(),
  assignedBy: varchar('assigned_by', { length: 255 }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  metadata: jsonb('metadata')
}, (table) => ({
  pk: primaryKey(table.userId, table.roleId, table.tenantId)
}));

export const permissionGroups = pgTable('permission_groups', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
});

export const permissionGroupItems = pgTable('permission_group_items', {
  groupId: varchar('group_id', { length: 255 })
    .references(() => permissionGroups.id, { onDelete: 'cascade' }),
  permissionId: varchar('permission_id', { length: 255 })
    .references(() => permissions.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
}, (table) => ({
  pk: primaryKey(table.groupId, table.permissionId)
})); 