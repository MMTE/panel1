import type { MiddlewareHandler } from 'hono';
import type { Panel1AuthUser } from './types.js';

export interface CreateTenantContextMiddlewareOptions {
  /** When true, respond 400 if user has no tenantId (after trim). */
  requireTenant: boolean;
  /**
   * Skip tenant logic (e.g. OPTIONS). When true, next() without setting tenantId.
   */
  shouldSkip?: (c: { req: { method: string }; get: (k: 'user') => Panel1AuthUser | undefined }) => boolean;
}

/**
 * Sets `c.set('tenantId', user.tenantId ?? null)` from authenticated user only (never from headers).
 * Run after bearer auth unless `shouldSkip` applies.
 */
export function createTenantContextMiddleware(
  options: CreateTenantContextMiddlewareOptions
): MiddlewareHandler {
  const { requireTenant, shouldSkip } = options;

  return async (c, next) => {
    if (shouldSkip?.(c)) {
      return next();
    }

    const user = c.get('user') as Panel1AuthUser | undefined;
    if (!user) {
      return c.json({ error: 'Unauthorized', message: 'Authentication required' }, 401);
    }

    const raw = user.tenantId;
    const tenantId = raw != null && String(raw).trim() !== '' ? String(raw) : null;
    c.set('tenantId', tenantId);

    if (requireTenant && !tenantId) {
      return c.json({ error: 'Bad Request', message: 'Tenant required for this resource' }, 400);
    }

    await next();
  };
}
