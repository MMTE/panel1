/**
 * Canonical RBAC names — aligned with `apps/api` seed (`audit.logs.view`).
 */
export const SEED_PERM = {
  auditLogsView: 'audit.logs.view',
  auditLogsExport: 'audit.logs.export',
  auditLogsCleanup: 'audit.logs.cleanup',
} as const;
