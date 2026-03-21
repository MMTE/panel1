/**
 * RBAC names from `apps/api` seed. Issue 1.2: align with `audit.*` in defineModule.
 * Export/cleanup reuse `view` until dedicated permissions exist in seed.
 */
export const SEED_PERM = {
  auditLogsView: 'admin.audit_logs.view',
} as const;
