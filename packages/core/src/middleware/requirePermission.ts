import type { MiddlewareHandler } from 'hono';
import type { Panel1AuthUser, Panel1UserPermissionContext } from './types.js';

export interface CreateRequirePermissionMiddlewareOptions {
  hasPermission: (
    ctx: Panel1UserPermissionContext,
    permissionId: string,
    resourceContext?: unknown
  ) => Promise<boolean>;
}

function toPermissionContext(user: Panel1AuthUser): Panel1UserPermissionContext {
  return {
    userId: user.id,
    role: user.role,
    tenantId: user.tenantId ?? undefined,
    clientId: user.clientId ?? undefined,
    permissions: [],
  };
}

/**
 * Returns a factory: `requirePermission('a', 'b')` grants if **any** permission passes (OR).
 */
export function createRequirePermissionMiddleware(options: CreateRequirePermissionMiddlewareOptions) {
  const { hasPermission } = options;

  return function requirePermission(...permissionIds: string[]): MiddlewareHandler {
    return async (c, next) => {
      const user = c.get('user') as Panel1AuthUser | undefined;
      if (!user) {
        return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
      }

      if (permissionIds.length === 0) {
        return c.json({ error: 'Internal Server Error', message: 'No permissions configured for route' }, 500);
      }

      const ctx = toPermissionContext(user);
      for (const pid of permissionIds) {
        if (await hasPermission(ctx, pid, undefined)) {
          return next();
        }
      }

      return c.json(
        {
          error: 'Forbidden',
          message: `Missing one of required permissions: ${permissionIds.join(', ')}`,
        },
        403
      );
    };
  };
}
