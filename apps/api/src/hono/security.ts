import {
  createBearerAuthMiddleware,
  createTenantContextMiddleware,
  createRequirePermissionMiddleware,
  type Panel1AuthUser,
  type Panel1UserPermissionContext,
} from '@panel1/core';
import { getSessionByToken } from '../lib/auth.js';
import { permissionManager, type Role, type ResourceContext } from '../lib/auth/PermissionManager.js';

/**
 * Maps DB session row to Panel1AuthUser for Hono context.
 */
export async function resolveUserFromBearerToken(token: string): Promise<Panel1AuthUser | null> {
  const row = await getSessionByToken(token);
  if (!row) return null;
  const u = row.users;
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
    tenantId: u.tenantId,
    clientId: (u as { clientId?: string | null }).clientId ?? null,
  };
}

const hasPermissionForHono = async (
  ctx: Panel1UserPermissionContext,
  permissionId: string,
  resourceContext?: unknown
): Promise<boolean> => {
  return await permissionManager.hasPermission(
    {
      userId: ctx.userId,
      role: ctx.role as Role,
      tenantId: ctx.tenantId,
      clientId: ctx.clientId,
      permissions: ctx.permissions ?? [],
    },
    permissionId,
    resourceContext as ResourceContext | undefined
  );
};

/** Storefront catalog listing (replaces tRPC `catalog.listPublic`). */
function skipCatalogPublicApi(c: { req: { path: string } }): boolean {
  const p = c.req.path;
  return p === '/api/catalog/public' || p.startsWith('/api/catalog/public/');
}

/** Applied to all `/api/*` Hono traffic (after OPTIONS short-circuit in Express). */
export const apiBearerAuthMiddleware = createBearerAuthMiddleware({
  resolveUser: resolveUserFromBearerToken,
  shouldSkipAuth: skipCatalogPublicApi,
});

/** Tenant from authenticated user only; 400 if missing. */
export const apiTenantMiddleware = createTenantContextMiddleware({
  requireTenant: true,
  shouldSkip: skipCatalogPublicApi as Parameters<
    typeof createTenantContextMiddleware
  >[0]['shouldSkip'],
});

/**
 * Factory with OR semantics. Use **seed RBAC names** until issue 1.2 renames permissions.
 * Injected into `bootModules({ requirePermission })` for modules.
 */
export const apiRequirePermission = createRequirePermissionMiddleware({
  hasPermission: hasPermissionForHono,
});
