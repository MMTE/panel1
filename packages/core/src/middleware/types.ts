/**
 * Minimal user shape for Hono auth context (matches apps/api AuthUser fields used in RBAC).
 */
export interface Panel1AuthUser {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role: string;
  tenantId?: string | null;
  clientId?: string | null;
}

/** Passed to permission checker (aligns with API PermissionManager async hasPermission userContext). */
export interface Panel1UserPermissionContext {
  userId: string;
  role: string;
  tenantId?: string;
  clientId?: string;
  /** Reserved; DB-backed checks use role today. */
  permissions: string[];
}
