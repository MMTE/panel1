import { db } from '../db';
import { roles, permissions, rolePermissions, roleHierarchy } from '../db/schema/roles';
import { Role, ResourceType, PermissionAction } from '../lib/auth/types';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { logger } from '../lib/logging/Logger';

async function seedRoles() {
  const defaultRoles = [
    {
      id: Role.SUPER_ADMIN,
      name: 'Super Admin',
      description: 'Full system access with all permissions',
      isSystem: true
    },
    {
      id: Role.ADMIN,
      name: 'Admin',
      description: 'Administrative access with most permissions',
      isSystem: true
    },
    {
      id: Role.MANAGER,
      name: 'Manager',
      description: 'Management access with limited administrative permissions',
      isSystem: true
    },
    {
      id: Role.SUPPORT_AGENT,
      name: 'Support Agent',
      description: 'Access to support and customer service features',
      isSystem: true
    },
    {
      id: Role.BILLING_AGENT,
      name: 'Billing Agent',
      description: 'Access to billing and payment features',
      isSystem: true
    },
    {
      id: Role.RESELLER,
      name: 'Reseller',
      description: 'Access to reseller features and client management',
      isSystem: true
    },
    {
      id: Role.CLIENT,
      name: 'Client',
      description: 'Standard client access',
      isSystem: true
    },
    {
      id: Role.CLIENT_USER,
      name: 'Client User',
      description: 'Limited client user access',
      isSystem: true
    }
  ];

  for (const role of defaultRoles) {
    await db.insert(roles)
      .values(role)
      .onConflictDoNothing();
  }

  logger.info('Default roles seeded successfully');
}

async function seedPermissions() {
  const defaultPermissions = [
    // Dashboard permissions
    {
      id: nanoid(),
      name: 'admin.dashboard.view',
      resource: ResourceType.SYSTEM_SETTINGS,
      action: PermissionAction.READ,
      description: 'View admin dashboard'
    },

    // Client permissions
    {
      id: nanoid(),
      name: 'admin.clients.view',
      resource: ResourceType.CLIENT,
      action: PermissionAction.READ,
      description: 'View client list and details'
    },
    {
      id: nanoid(),
      name: 'admin.clients.create',
      resource: ResourceType.CLIENT,
      action: PermissionAction.CREATE,
      description: 'Create new clients'
    },
    {
      id: nanoid(),
      name: 'admin.clients.update',
      resource: ResourceType.CLIENT,
      action: PermissionAction.UPDATE,
      description: 'Update client details'
    },
    {
      id: nanoid(),
      name: 'admin.clients.delete',
      resource: ResourceType.CLIENT,
      action: PermissionAction.DELETE,
      description: 'Delete clients'
    },

    // Invoice permissions
    {
      id: nanoid(),
      name: 'admin.invoices.view',
      resource: ResourceType.INVOICE,
      action: PermissionAction.READ,
      description: 'View invoices'
    },
    {
      id: nanoid(),
      name: 'admin.invoices.create',
      resource: ResourceType.INVOICE,
      action: PermissionAction.CREATE,
      description: 'Create invoices'
    },
    {
      id: nanoid(),
      name: 'admin.invoices.update',
      resource: ResourceType.INVOICE,
      action: PermissionAction.UPDATE,
      description: 'Update invoices'
    },
    {
      id: nanoid(),
      name: 'admin.invoices.delete',
      resource: ResourceType.INVOICE,
      action: PermissionAction.DELETE,
      description: 'Delete invoices'
    },

    // Plan permissions
    {
      id: nanoid(),
      name: 'admin.plans.view',
      resource: ResourceType.PLAN,
      action: PermissionAction.READ,
      description: 'View plans'
    },
    {
      id: nanoid(),
      name: 'admin.plans.create',
      resource: ResourceType.PLAN,
      action: PermissionAction.CREATE,
      description: 'Create plans'
    },
    {
      id: nanoid(),
      name: 'admin.plans.update',
      resource: ResourceType.PLAN,
      action: PermissionAction.UPDATE,
      description: 'Update plans'
    },
    {
      id: nanoid(),
      name: 'admin.plans.delete',
      resource: ResourceType.PLAN,
      action: PermissionAction.DELETE,
      description: 'Delete plans'
    },

    // Payment gateway permissions
    {
      id: nanoid(),
      name: 'admin.payment_gateways.view',
      resource: ResourceType.PAYMENT,
      action: PermissionAction.READ,
      description: 'View payment gateways'
    },
    {
      id: nanoid(),
      name: 'admin.payment_gateways.manage',
      resource: ResourceType.PAYMENT,
      action: PermissionAction.MANAGE,
      description: 'Manage payment gateways'
    },

    // Catalog permissions
    {
      id: nanoid(),
      name: 'admin.catalog.view',
      resource: ResourceType.SYSTEM_SETTINGS,
      action: PermissionAction.READ,
      description: 'View catalog dashboard'
    },
    {
      id: nanoid(),
      name: 'admin.catalog.products.manage',
      resource: ResourceType.SYSTEM_SETTINGS,
      action: PermissionAction.MANAGE,
      description: 'Manage catalog products'
    },
    {
      id: nanoid(),
      name: 'admin.catalog.components.manage',
      resource: ResourceType.SYSTEM_SETTINGS,
      action: PermissionAction.MANAGE,
      description: 'Manage catalog components'
    },

    // Support permissions
    {
      id: nanoid(),
      name: 'admin.support.view',
      resource: ResourceType.SUPPORT_TICKET,
      action: PermissionAction.READ,
      description: 'View support dashboard'
    },
    {
      id: nanoid(),
      name: 'admin.support.tickets.view',
      resource: ResourceType.SUPPORT_TICKET,
      action: PermissionAction.READ,
      description: 'View support tickets'
    },
    {
      id: nanoid(),
      name: 'admin.support.tickets.manage',
      resource: ResourceType.SUPPORT_TICKET,
      action: PermissionAction.MANAGE,
      description: 'Manage support tickets'
    },

    // Role and permission management
    {
      id: nanoid(),
      name: 'admin.roles.view',
      resource: ResourceType.SYSTEM_SETTINGS,
      action: PermissionAction.READ,
      description: 'View roles'
    },
    {
      id: nanoid(),
      name: 'admin.roles.create',
      resource: ResourceType.SYSTEM_SETTINGS,
      action: PermissionAction.CREATE,
      description: 'Create roles'
    },
    {
      id: nanoid(),
      name: 'admin.roles.update',
      resource: ResourceType.SYSTEM_SETTINGS,
      action: PermissionAction.UPDATE,
      description: 'Update roles'
    },
    {
      id: nanoid(),
      name: 'admin.roles.delete',
      resource: ResourceType.SYSTEM_SETTINGS,
      action: PermissionAction.DELETE,
      description: 'Delete roles'
    },
    {
      id: nanoid(),
      name: 'admin.roles.manage_permissions',
      resource: ResourceType.SYSTEM_SETTINGS,
      action: PermissionAction.MANAGE,
      description: 'Manage role permissions'
    },

    // Plugin management
    {
      id: nanoid(),
      name: 'admin.plugins.view',
      resource: ResourceType.PLUGIN,
      action: PermissionAction.READ,
      description: 'View plugins'
    },
    {
      id: nanoid(),
      name: 'admin.plugins.manage',
      resource: ResourceType.PLUGIN,
      action: PermissionAction.MANAGE,
      description: 'Manage plugins'
    },

    // Audit logs
    {
      id: nanoid(),
      name: 'admin.audit_logs.view',
      resource: ResourceType.AUDIT_LOG,
      action: PermissionAction.READ,
      description: 'View audit logs'
    },

    // Analytics
    {
      id: nanoid(),
      name: 'admin.analytics.view',
      resource: ResourceType.ANALYTICS,
      action: PermissionAction.READ,
      description: 'View analytics'
    }
  ];

  for (const permission of defaultPermissions) {
    await db.insert(permissions)
      .values(permission)
      .onConflictDoNothing();
  }

  logger.info('Default permissions seeded successfully');
}

async function seedRolePermissions() {
  const allPermissions = await db.select().from(permissions);
  const permissionMap = new Map(allPermissions.map(p => [p.name, p.id]));

  const rolePermissionsMap = {
    [Role.SUPER_ADMIN]: allPermissions.map(p => p.name),
    [Role.ADMIN]: allPermissions.map(p => p.name).filter(p => !p.includes('delete')),
    [Role.MANAGER]: [
      'admin.dashboard.view',
      'admin.clients.view',
      'admin.clients.create',
      'admin.clients.update',
      'admin.invoices.view',
      'admin.invoices.create',
      'admin.plans.view',
      'admin.support.view',
      'admin.support.tickets.view',
      'admin.support.tickets.manage',
      'admin.analytics.view'
    ],
    [Role.SUPPORT_AGENT]: [
      'admin.dashboard.view',
      'admin.clients.view',
      'admin.support.view',
      'admin.support.tickets.view',
      'admin.support.tickets.manage'
    ],
    [Role.BILLING_AGENT]: [
      'admin.dashboard.view',
      'admin.clients.view',
      'admin.invoices.view',
      'admin.invoices.create',
      'admin.payment_gateways.view'
    ],
    [Role.RESELLER]: [
      'admin.dashboard.view',
      'admin.clients.view',
      'admin.clients.create',
      'admin.invoices.view',
      'admin.plans.view'
    ],
    [Role.CLIENT]: [
      'client.dashboard.view',
      'client.invoices.view',
      'client.support.tickets.create',
      'client.support.tickets.view'
    ],
    [Role.CLIENT_USER]: [
      'client.dashboard.view',
      'client.support.tickets.create',
      'client.support.tickets.view'
    ]
  };

  for (const [roleId, permissionNames] of Object.entries(rolePermissionsMap)) {
    for (const permissionName of permissionNames) {
      const permissionId = permissionMap.get(permissionName);
      if (permissionId) {
        await db.insert(rolePermissions)
          .values({
            roleId,
            permissionId,
            grantedAt: new Date(),
            grantedBy: 'system'
          })
          .onConflictDoNothing();
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
    { parentRole: Role.CLIENT, childRole: Role.CLIENT_USER }
  ];

  for (const { parentRole, childRole } of hierarchyData) {
    await db.insert(roleHierarchy)
      .values({
        parentRole,
        childRole,
        metadata: {}
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
    logger.error('Error seeding RBAC data:', error);
    throw error;
  }
}

// Run the seed if this file is executed directly
if (require.main === module) {
  seedRbacData()
    .then(() => process.exit(0))
    .catch(error => {
      logger.error('RBAC seeding failed:', error);
      process.exit(1);
    });
} 