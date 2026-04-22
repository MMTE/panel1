/**
 * Canonical RBAC permission names — aligned with `apps/api` seed.
 */
export const SEED_PERM = {
  supportView: 'support.dashboard.view',
  ticketsViewAdmin: 'support.tickets.view',
  ticketsViewClient: 'support.tickets.view_own',
  ticketsManage: 'support.tickets.manage',
  ticketsCreateClient: 'support.tickets.create',
} as const;
