import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db';
import { roles, permissions, rolePermissions, roleHierarchy } from '../db/schema/roles';
import { Role, ResourceType, PermissionAction } from '../lib/auth/types';
import { nanoid } from 'nanoid';
import { logger } from '@panel1/core';

async function seedRoles() {
  const defaultRoles = [
    {
      id: Role.SUPER_ADMIN,
      name: 'Super Admin',
      description: 'Full system access with all permissions',
      isSystem: true,
    },
    {
      id: Role.ADMIN,
      name: 'Admin',
      description: 'Administrative access with most permissions',
      isSystem: true,
    },
    {
      id: Role.MANAGER,
      name: 'Manager',
      description: 'Management access with limited administrative permissions',
      isSystem: true,
    },
    {
      id: Role.SUPPORT_AGENT,
      name: 'Support Agent',
      description: 'Access to support and customer service features',
      isSystem: true,
    },
    {
      id: Role.BILLING_AGENT,
      name: 'Billing Agent',
      description: 'Access to billing and payment features',
      isSystem: true,
    },
    {
      id: Role.RESELLER,
      name: 'Reseller',
      description: 'Access to reseller features and client management',
      isSystem: true,
    },
    {
      id: Role.CLIENT,
      name: 'Client',
      description: 'Standard client access',
      isSystem: true,
    },
    {
      id: Role.CLIENT_USER,
      name: 'Client User',
      description: 'Limited client user access',
      isSystem: true,
    },
  ];

  for (const role of defaultRoles) {
    await db.insert(roles).values(role).onConflictDoNothing();
  }

  logger.info('Default roles seeded successfully');
}

/** Canonical names: `{module}.{resource}.{action}` — see ARCHITECTURE.md */
async function seedPermissions() {
  const defaultPermissions = [
    {
      id: nanoid(),
      name: 'core.dashboard.view',
      resource: ResourceType.SYSTEM_SETTINGS,
      action: PermissionAction.READ,
      description: 'View admin dashboard',
    },
    {
      id: nanoid(),
      name: 'reporting.analytics.view',
      resource: ResourceType.ANALYTICS,
      action: PermissionAction.READ,
      description: 'View analytics',
    },
    {
      id: nanoid(),
      name: 'clients.clients.view',
      resource: ResourceType.CLIENT,
      action: PermissionAction.READ,
      description: 'View client list and details',
    },
    {
      id: nanoid(),
      name: 'clients.clients.create',
      resource: ResourceType.CLIENT,
      action: PermissionAction.CREATE,
      description: 'Create new clients',
    },
    {
      id: nanoid(),
      name: 'clients.clients.edit',
      resource: ResourceType.CLIENT,
      action: PermissionAction.UPDATE,
      description: 'Update client details',
    },
    {
      id: nanoid(),
      name: 'clients.clients.delete',
      resource: ResourceType.CLIENT,
      action: PermissionAction.DELETE,
      description: 'Delete clients',
    },
    {
      id: nanoid(),
      name: 'billing.invoices.view',
      resource: ResourceType.INVOICE,
      action: PermissionAction.READ,
      description: 'View invoices',
    },
    {
      id: nanoid(),
      name: 'billing.invoices.create',
      resource: ResourceType.INVOICE,
      action: PermissionAction.CREATE,
      description: 'Create invoices',
    },
    {
      id: nanoid(),
      name: 'billing.invoices.edit',
      resource: ResourceType.INVOICE,
      action: PermissionAction.UPDATE,
      description: 'Update invoices',
    },
    {
      id: nanoid(),
      name: 'billing.invoices.delete',
      resource: ResourceType.INVOICE,
      action: PermissionAction.DELETE,
      description: 'Delete invoices',
    },
    {
      id: nanoid(),
      name: 'billing.invoices.view_own',
      resource: ResourceType.INVOICE,
      action: PermissionAction.READ,
      description: 'View own invoices',
    },
    {
      id: nanoid(),
      name: 'billing.invoices.process_payment',
      resource: ResourceType.INVOICE,
      action: PermissionAction.EXECUTE,
      description: 'Process invoice payments',
    },
    {
      id: nanoid(),
      name: 'catalog.plans.view',
      resource: ResourceType.PLAN,
      action: PermissionAction.READ,
      description: 'View plans',
    },
    {
      id: nanoid(),
      name: 'catalog.plans.create',
      resource: ResourceType.PLAN,
      action: PermissionAction.CREATE,
      description: 'Create plans',
    },
    {
      id: nanoid(),
      name: 'catalog.plans.edit',
      resource: ResourceType.PLAN,
      action: PermissionAction.UPDATE,
      description: 'Update plans',
    },
    {
      id: nanoid(),
      name: 'catalog.plans.delete',
      resource: ResourceType.PLAN,
      action: PermissionAction.DELETE,
      description: 'Delete plans',
    },
    {
      id: nanoid(),
      name: 'billing.payment_gateways.view',
      resource: ResourceType.PAYMENT,
      action: PermissionAction.READ,
      description: 'View payment gateways',
    },
    {
      id: nanoid(),
      name: 'billing.payment_gateways.manage',
      resource: ResourceType.PAYMENT,
      action: PermissionAction.MANAGE,
      description: 'Manage payment gateways',
    },
    {
      id: nanoid(),
      name: 'catalog.dashboard.view',
      resource: ResourceType.SYSTEM_SETTINGS,
      action: PermissionAction.READ,
      description: 'View catalog dashboard',
    },
    {
      id: nanoid(),
      name: 'catalog.products.manage',
      resource: ResourceType.SYSTEM_SETTINGS,
      action: PermissionAction.MANAGE,
      description: 'Manage catalog products',
    },
    {
      id: nanoid(),
      name: 'catalog.components.manage',
      resource: ResourceType.SYSTEM_SETTINGS,
      action: PermissionAction.MANAGE,
      description: 'Manage catalog components',
    },
    {
      id: nanoid(),
      name: 'support.dashboard.view',
      resource: ResourceType.SUPPORT_TICKET,
      action: PermissionAction.READ,
      description: 'View support dashboard',
    },
    {
      id: nanoid(),
      name: 'support.tickets.view',
      resource: ResourceType.SUPPORT_TICKET,
      action: PermissionAction.READ,
      description: 'View support tickets (admin)',
    },
    {
      id: nanoid(),
      name: 'support.tickets.manage',
      resource: ResourceType.SUPPORT_TICKET,
      action: PermissionAction.MANAGE,
      description: 'Manage support tickets',
    },
    {
      id: nanoid(),
      name: 'support.tickets.create',
      resource: ResourceType.SUPPORT_TICKET,
      action: PermissionAction.CREATE,
      description: 'Create support tickets (client)',
    },
    {
      id: nanoid(),
      name: 'support.tickets.view_own',
      resource: ResourceType.SUPPORT_TICKET,
      action: PermissionAction.READ,
      description: 'View own support tickets',
    },
    {
      id: nanoid(),
      name: 'core.roles.view',
      resource: ResourceType.SYSTEM_SETTINGS,
      action: PermissionAction.READ,
      description: 'View roles',
    },
    {
      id: nanoid(),
      name: 'core.roles.create',
      resource: ResourceType.SYSTEM_SETTINGS,
      action: PermissionAction.CREATE,
      description: 'Create roles',
    },
    {
      id: nanoid(),
      name: 'core.roles.edit',
      resource: ResourceType.SYSTEM_SETTINGS,
      action: PermissionAction.UPDATE,
      description: 'Update roles',
    },
    {
      id: nanoid(),
      name: 'core.roles.delete',
      resource: ResourceType.SYSTEM_SETTINGS,
      action: PermissionAction.DELETE,
      description: 'Delete roles',
    },
    {
      id: nanoid(),
      name: 'core.roles.manage_permissions',
      resource: ResourceType.SYSTEM_SETTINGS,
      action: PermissionAction.MANAGE,
      description: 'Manage role permissions',
    },
    {
      id: nanoid(),
      name: 'core.roles.manage',
      resource: ResourceType.SYSTEM_SETTINGS,
      action: PermissionAction.MANAGE,
      description: 'Roles & permissions admin UI',
    },
    {
      id: nanoid(),
      name: 'core.plugins.view',
      resource: ResourceType.PLUGIN,
      action: PermissionAction.READ,
      description: 'View plugins',
    },
    {
      id: nanoid(),
      name: 'core.plugins.manage',
      resource: ResourceType.PLUGIN,
      action: PermissionAction.MANAGE,
      description: 'Manage plugins',
    },
    {
      id: nanoid(),
      name: 'audit.logs.view',
      resource: ResourceType.AUDIT_LOG,
      action: PermissionAction.READ,
      description: 'View audit logs',
    },
    {
      id: nanoid(),
      name: 'audit.logs.export',
      resource: ResourceType.AUDIT_LOG,
      action: PermissionAction.MANAGE,
      description: 'Export audit logs',
    },
    {
      id: nanoid(),
      name: 'audit.logs.cleanup',
      resource: ResourceType.AUDIT_LOG,
      action: PermissionAction.MANAGE,
      description: 'Purge audit logs',
    },
    {
      id: nanoid(),
      name: 'domains.domains.view',
      resource: ResourceType.DOMAIN,
      action: PermissionAction.READ,
      description: 'View domains admin',
    },
    {
      id: nanoid(),
      name: 'billing.billing.view',
      resource: ResourceType.SUBSCRIPTION,
      action: PermissionAction.READ,
      description: 'View billing / subscriptions admin',
    },
    {
      id: nanoid(),
      name: 'clients.portal.view',
      resource: ResourceType.CLIENT,
      action: PermissionAction.READ,
      description: 'Client portal dashboard',
    },
    {
      id: nanoid(),
      name: 'core.users.manage_roles',
      resource: ResourceType.USER,
      action: PermissionAction.MANAGE,
      description: 'Manage user roles',
    },
    {
      id: nanoid(),
      name: 'catalog.products.create',
      resource: ResourceType.PRODUCT,
      action: PermissionAction.CREATE,
      description: 'Create catalog products',
    },
    {
      id: nanoid(),
      name: 'catalog.products.edit',
      resource: ResourceType.PRODUCT,
      action: PermissionAction.UPDATE,
      description: 'Update catalog products',
    },
  ];

  for (const permission of defaultPermissions) {
    await db.insert(permissions).values(permission).onConflictDoNothing();
  }

  logger.info('Default permissions seeded successfully');
}

async function seedRolePermissions() {
  const allPermissions = await db.select().from(permissions);
  const permissionMap = new Map<string, string>(allPermissions.map((p) => [p.name, p.id]));

  const rolePermissionsMap: Record<string, string[]> = {
    [Role.SUPER_ADMIN]: allPermissions.map((p) => p.name),
    [Role.ADMIN]: allPermissions.map((p) => p.name).filter((p) => !p.endsWith('.delete')),
    [Role.MANAGER]: [
      'core.dashboard.view',
      'clients.clients.view',
      'clients.clients.create',
      'clients.clients.edit',
      'billing.invoices.view',
      'billing.invoices.create',
      'catalog.plans.view',
      'support.dashboard.view',
      'support.tickets.view',
      'support.tickets.manage',
      'reporting.analytics.view',
      'audit.logs.view',
    ],
    [Role.SUPPORT_AGENT]: [
      'core.dashboard.view',
      'clients.clients.view',
      'support.dashboard.view',
      'support.tickets.view',
      'support.tickets.manage',
      'audit.logs.view',
    ],
    [Role.BILLING_AGENT]: [
      'core.dashboard.view',
      'clients.clients.view',
      'billing.invoices.view',
      'billing.invoices.create',
      'billing.payment_gateways.view',
    ],
    [Role.RESELLER]: [
      'core.dashboard.view',
      'clients.clients.view',
      'clients.clients.create',
      'billing.invoices.view',
      'catalog.plans.view',
    ],
    [Role.CLIENT]: [
      'clients.portal.view',
      'billing.invoices.view_own',
      'support.tickets.create',
      'support.tickets.view_own',
    ],
    [Role.CLIENT_USER]: [
      'clients.portal.view',
      'support.tickets.create',
      'support.tickets.view_own',
    ],
  };

  for (const [roleId, permissionNames] of Object.entries(rolePermissionsMap) as Array<[string, string[]]>) {
    for (const permissionName of permissionNames) {
      const permissionId = permissionMap.get(permissionName);
      if (permissionId) {
        await db
          .insert(rolePermissions)
          .values({
            roleId: roleId as Role,
            permissionId,
            grantedAt: new Date(),
            grantedBy: 'system',
          })
          .onConflictDoNothing();
      } else {
        logger.warn(`seedRolePermissions: unknown permission name ${permissionName}`);
      }
    }
  }

  logger.info('Role permissions seeded successfully');
}

async function seedRoleHierarchy() {
  const hierarchyData = [
    { parentRole: Role.SUPER_ADMIN, childRole: Role.ADMIN },
    { parentRole: Role.ADMIN, childRole: Role.MANAGER },
    { parentRole: Role.MANAGER, childRole: Role.SUPPORT_AGENT },
    { parentRole: Role.MANAGER, childRole: Role.BILLING_AGENT },
    { parentRole: Role.MANAGER, childRole: Role.RESELLER },
    { parentRole: Role.RESELLER, childRole: Role.CLIENT },
    { parentRole: Role.CLIENT, childRole: Role.CLIENT_USER },
  ];

  for (const { parentRole, childRole } of hierarchyData) {
    await db
      .insert(roleHierarchy)
      .values({
        parentRole,
        childRole,
        metadata: {},
      })
      .onConflictDoNothing();
  }

  logger.info('Role hierarchy seeded successfully');
}

export async function seedRbacData() {
  try {
    await seedRoles();
    await seedPermissions();
    await seedRolePermissions();
    await seedRoleHierarchy();
    logger.info('RBAC data seeded successfully');
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Error seeding RBAC data', undefined, err);
    throw err;
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isMain) {
  seedRbacData()
    .then(() => process.exit(0))
    .catch((error) => {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('RBAC seeding failed', undefined, err);
      process.exit(1);
    });
}
