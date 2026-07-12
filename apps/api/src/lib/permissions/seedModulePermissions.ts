import type { ModuleDefinition } from '@panel1/types';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { permissions } from '../../db/schema/roles';
import { PermissionAction, ResourceType } from '../auth/types';
import { logger } from '@panel1/core';

/** Map first segment of `{module}.{resource}.{action}` to a coarse RBAC resource bucket. */
const MODULE_TO_RESOURCE: Record<string, ResourceType> = {
  core: ResourceType.SYSTEM_SETTINGS,
  reporting: ResourceType.ANALYTICS,
  clients: ResourceType.CLIENT,
  billing: ResourceType.INVOICE,
  catalog: ResourceType.PRODUCT,
  support: ResourceType.SUPPORT_TICKET,
  audit: ResourceType.AUDIT_LOG,
  domains: ResourceType.DOMAIN,
  provisioning: ResourceType.COMPONENT,
  payments: ResourceType.PAYMENT,
  subscriptions: ResourceType.SUBSCRIPTION,
};

const ACTION_SUFFIX: Record<string, PermissionAction> = {
  view: PermissionAction.READ,
  read: PermissionAction.READ,
  view_own: PermissionAction.READ,
  create: PermissionAction.CREATE,
  edit: PermissionAction.UPDATE,
  update: PermissionAction.UPDATE,
  delete: PermissionAction.DELETE,
  manage: PermissionAction.MANAGE,
  export: PermissionAction.EXECUTE,
  cleanup: PermissionAction.EXECUTE,
  assign: PermissionAction.ASSIGN,
  stats: PermissionAction.READ,
  process_payment: PermissionAction.EXECUTE,
};

function parseCanonicalPermission(name: string): { resource: ResourceType; action: PermissionAction } {
  const parts = name.split('.').filter(Boolean);
  const moduleKey = parts[0] ?? 'core';
  const actionKey = parts.length >= 2 ? parts[parts.length - 1] : 'view';
  const resource = MODULE_TO_RESOURCE[moduleKey] ?? ResourceType.PLUGIN;
  const action = ACTION_SUFFIX[actionKey] ?? PermissionAction.READ;
  return { resource, action };
}

/**
 * Upserts permission rows declared by `defineModule({ permissions })` so RBAC stays in sync with code.
 * Skips names already present (seed-rbac-data or prior runs).
 */
export async function seedModulePermissionsFromDefinitions(moduleDefs: ModuleDefinition[]): Promise<void> {
  const seen = new Set<string>();

  for (const mod of moduleDefs) {
    for (const permName of mod.permissions ?? []) {
      if (seen.has(permName)) continue;
      seen.add(permName);

      const existing = await db.select({ id: permissions.id }).from(permissions).where(eq(permissions.name, permName)).limit(1);
      if (existing.length) continue;

      const { resource, action } = parseCanonicalPermission(permName);
      await db.insert(permissions).values({
        id: nanoid(),
        name: permName,
        resource,
        action,
        description: `${mod.name} module — ${permName}`,
      });
      logger.info(`[permissions] Seeded module permission: ${permName}`);
    }
  }
}
