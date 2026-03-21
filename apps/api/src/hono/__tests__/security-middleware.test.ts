import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createRequirePermissionMiddleware } from '@panel1/core';
import { apiBearerAuthMiddleware, apiTenantMiddleware, resolveUserFromBearerToken } from '../security.js';

vi.mock('../../lib/auth.js', () => ({
  getSessionByToken: vi.fn(),
}));

import { getSessionByToken } from '../../lib/auth.js';

describe('API Hono security stack', () => {
  beforeEach(() => {
    vi.mocked(getSessionByToken).mockReset();
  });

  it('returns 401 without Authorization', async () => {
    const app = new Hono();
    app.use('*', apiBearerAuthMiddleware);
    app.use('*', apiTenantMiddleware);
    app.get('/api/support/tickets', (c) => c.json({ ok: true }));

    const res = await app.request('http://localhost/api/support/tickets');
    expect(res.status).toBe(401);
  });

  it('returns 200 with valid Bearer session and sets tenant', async () => {
    vi.mocked(getSessionByToken).mockResolvedValue({
      users: {
        id: 'user-1',
        email: 'a@b.test',
        firstName: 'A',
        lastName: 'B',
        role: 'ADMIN',
        tenantId: 'tenant-1',
      },
    } as any);

    const app = new Hono();
    app.use('*', apiBearerAuthMiddleware);
    app.use('*', apiTenantMiddleware);
    app.get('/x', (c) =>
      c.json({ tenantId: c.get('tenantId'), userId: c.get('user').id })
    );

    const res = await app.request('http://localhost/x', {
      headers: { Authorization: 'Bearer fake-jwt' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tenantId: 'tenant-1', userId: 'user-1' });
  });

  it('returns 400 when user has no tenant and tenant is required', async () => {
    vi.mocked(getSessionByToken).mockResolvedValue({
      users: {
        id: 'user-1',
        email: 'a@b.test',
        firstName: null,
        lastName: null,
        role: 'ADMIN',
        tenantId: null,
      },
    } as any);

    const app = new Hono();
    app.use('*', apiBearerAuthMiddleware);
    app.use('*', apiTenantMiddleware);
    app.get('/x', (c) => c.json({ ok: true }));

    const res = await app.request('http://localhost/x', {
      headers: { Authorization: 'Bearer x' },
    });
    expect(res.status).toBe(400);
  });

  it('returns 403 when requirePermission denies all ids', async () => {
    vi.mocked(getSessionByToken).mockResolvedValue({
      users: {
        id: 'user-1',
        email: 'a@b.test',
        firstName: null,
        lastName: null,
        role: 'CLIENT',
        tenantId: 'tenant-1',
      },
    } as any);

    const deny = createRequirePermissionMiddleware({
      hasPermission: async () => false,
    });

    const app = new Hono();
    app.use('*', apiBearerAuthMiddleware);
    app.use('*', apiTenantMiddleware);
    app.use('*', deny('some.permission'));
    app.get('/x', (c) => c.json({ ok: true }));

    const res = await app.request('http://localhost/x', {
      headers: { Authorization: 'Bearer x' },
    });
    expect(res.status).toBe(403);
  });
});

describe('resolveUserFromBearerToken', () => {
  beforeEach(() => {
    vi.mocked(getSessionByToken).mockReset();
  });

  it('returns null when session missing', async () => {
    vi.mocked(getSessionByToken).mockResolvedValue(null as any);
    const u = await resolveUserFromBearerToken('t');
    expect(u).toBeNull();
  });
});
