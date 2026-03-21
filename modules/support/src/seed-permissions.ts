/**
 * RBAC permission **names** as seeded in `apps/api/src/scripts/seed-rbac-data.ts`.
 * Issue 1.2: rename to canonical `support.*` / `module.resource.action` and update seed + this file.
 */
export const SEED_PERM = {
  supportView: 'admin.support.view',
  ticketsViewAdmin: 'admin.support.tickets.view',
  ticketsViewClient: 'client.support.tickets.view',
  ticketsManage: 'admin.support.tickets.manage',
  ticketsCreateClient: 'client.support.tickets.create',
} as const;
