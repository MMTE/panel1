import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { createBearerAuthMiddleware } from '../middleware/auth.js';
import { createTenantContextMiddleware } from '../middleware/tenant.js';
import { createRequirePermissionMiddleware } from '../middleware/requirePermission.js';
import type { Panel1AuthUser } from '../middleware/types.js';

const demoUser: Panel1AuthUser = {
  id: 'u1',
  email: 'a@b.c',
  firstName: 'A',
  lastName: 'B',
  role: 'ADMIN',
  tenantId: 't1',
};

describe('createBearerAuthMiddleware', () => {
  it('returns 401 when Authorization header missing', async () => {
    const resolveUser = vi.fn();
    const app = new Hono();
    app.use('*', createBearerAuthMiddleware({ resolveUser }));
    app.get('/x', (c) => c.json({ ok: true }));
    const res = await app.request('/x');
    expect(res.status).toBe(401);
    expect(resolveUser).not.toHaveBeenCalled();
  });

  it('returns 401 when token does not resolve', async () => {
    const resolveUser = vi.fn().mockResolvedValue(null);
    const app = new Hono();
    app.use('*', createBearerAuthMiddleware({ resolveUser }));
    app.get('/x', (c) => c.json({ ok: true }));
    const res = await app.request('/x', { headers: { Authorization: 'Bearer bad' } });
    expect(res.status).toBe(401);
  });

  it('sets user and continues when token resolves', async () => {
    const resolveUser = vi.fn().mockResolvedValue(demoUser);
    const app = new Hono();
    app.use('*', createBearerAuthMiddleware({ resolveUser }));
    app.get('/x', (c) => c.json({ id: c.get('user').id }));
    const res = await app.request('/x', { headers: { Authorization: 'Bearer good' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('u1');
  });

  it('skips auth when shouldSkipAuth returns true', async () => {
    const resolveUser = vi.fn();
    const app = new Hono();
    app.use(
      '*',
      createBearerAuthMiddleware({
        resolveUser,
        shouldSkipAuth: () => true,
      })
    );
    app.get('/x', (c) => c.json({ hasUser: c.get('user') != null }));
    const res = await app.request('/x');
    expect(res.status).toBe(200);
    expect(resolveUser).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.hasUser).toBe(false);
  });
});

describe('createTenantContextMiddleware', () => {
  it('returns 401 when user not set', async () => {
    const app = new Hono();
    app.use('*', createTenantContextMiddleware({ requireTenant: true }));
    const res = await app.request('/x');
    expect(res.status).toBe(401);
  });

  it('sets tenantId from user', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('user', demoUser);
      await next();
    });
    app.use('*', createTenantContextMiddleware({ requireTenant: true }));
    app.get('/x', (c) => c.json({ tenantId: c.get('tenantId') }));
    const res = await app.request('/x');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tenantId: 't1' });
  });

  it('returns 400 when requireTenant and user has no tenant', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('user', { ...demoUser, tenantId: null });
      await next();
    });
    app.use('*', createTenantContextMiddleware({ requireTenant: true }));
    app.get('/x', (c) => c.json({ ok: true }));
    const res = await app.request('/x');
    expect(res.status).toBe(400);
  });
});

describe('createRequirePermissionMiddleware', () => {
  it('returns 403 when no permission matches', async () => {
    const hasPermission = vi.fn().mockResolvedValue(false);
    const requirePermission = createRequirePermissionMiddleware({ hasPermission });
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('user', demoUser);
      await next();
    });
    app.use('*', requirePermission('a', 'b'));
    app.get('/x', (c) => c.json({ ok: true }));
    const res = await app.request('/x');
    expect(res.status).toBe(403);
    expect(hasPermission).toHaveBeenCalled();
  });

  it('continues when any permission matches (OR)', async () => {
    const hasPermission = vi.fn().mockImplementation(async (_ctx, id: string) => id === 'b');
    const requirePermission = createRequirePermissionMiddleware({ hasPermission });
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('user', demoUser);
      await next();
    });
    app.use('*', requirePermission('a', 'b'));
    app.get('/x', (c) => c.json({ ok: true }));
    const res = await app.request('/x');
    expect(res.status).toBe(200);
  });
});
