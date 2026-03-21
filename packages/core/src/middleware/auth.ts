import type { MiddlewareHandler } from 'hono';
import type { Panel1AuthUser } from './types.js';

export interface CreateBearerAuthMiddlewareOptions {
  /** Resolve session from raw Bearer token (e.g. JWT stored in sessions table). */
  resolveUser: (token: string) => Promise<Panel1AuthUser | null>;
}

/**
 * Requires `Authorization: Bearer <token>`. Sets `c.set('user', user)` on success.
 * Skips validation when `shouldSkipAuth(c)` returns true (e.g. OPTIONS or public webhooks).
 */
export function createBearerAuthMiddleware(
  options: CreateBearerAuthMiddlewareOptions & {
    shouldSkipAuth?: (c: { req: { method: string; path: string } }) => boolean;
  }
): MiddlewareHandler {
  const { resolveUser, shouldSkipAuth } = options;

  return async (c, next) => {
    if (shouldSkipAuth?.(c)) {
      return next();
    }

    const auth = c.req.header('Authorization');
    if (!auth?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized', message: 'Missing or invalid Authorization header' }, 401);
    }

    const token = auth.slice('Bearer '.length).trim();
    if (!token) {
      return c.json({ error: 'Unauthorized', message: 'Empty Bearer token' }, 401);
    }

    const user = await resolveUser(token);
    if (!user) {
      return c.json({ error: 'Unauthorized', message: 'Invalid or expired session' }, 401);
    }

    c.set('user', user);
    await next();
  };
}
