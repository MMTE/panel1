import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestContext,
  deleteSeedData,
  integrationEnabled,
  seedTestData,
  supportModuleTablesExist,
  teardownTestContext,
  type TestContext,
} from './helpers.js';

const run = integrationEnabled() && (await supportModuleTablesExist());

describe.skipIf(!run)('support module integration (DB + Hono)', () => {
  let seed: Awaited<ReturnType<typeof seedTestData>>;
  let ctx: TestContext;

  beforeAll(async () => {
    seed = await seedTestData();
    ctx = await createTestContext(seed);
  }, 120_000);

  afterAll(async () => {
    if (ctx) {
      await teardownTestContext(ctx);
    }
    if (seed) {
      await deleteSeedData(seed);
    }
  }, 60_000);

  it('returns 401 without Authorization', async () => {
    const res = await ctx.request('/api/support/stats', null);
    expect(res.status).toBe(401);
  });

  it('returns 403 when role lacks support.dashboard.view', async () => {
    const res = await ctx.request('/api/support/stats', seed.restrictedToken);
    expect(res.status).toBe(403);
  });

  it('returns stats for authorized user', async () => {
    const res = await ctx.request('/api/support/stats', seed.superAdminToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.totalTickets).toBe('number');
  });

  it('returns SLA metrics', async () => {
    const res = await ctx.request('/api/support/sla/metrics', seed.superAdminToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.firstResponseSlaRate).toBe('number');
  });

  it('lists automation rules (may be empty)', async () => {
    const res = await ctx.request('/api/support/automation/rules', seed.superAdminToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });

  it('creates a ticket, loads it, adds a staff message (automation hook on create)', async () => {
    const createRes = await ctx.request('/api/support/tickets', seed.superAdminToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: 'Integration ticket',
        content: 'Hello from integration test',
        priority: 'MEDIUM',
      }),
    });
    expect(createRes.status).toBe(201);
    const ticket = (await createRes.json()) as { id: string; ticketNumber: string };
    expect(ticket.id).toBeTruthy();

    const getRes = await ctx.request(`/api/support/tickets/${ticket.id}`, seed.superAdminToken);
    expect(getRes.status).toBe(200);

    const msgRes = await ctx.request(`/api/support/tickets/${ticket.id}/messages`, seed.superAdminToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'Staff follow-up',
        messageType: 'STAFF_REPLY',
        isInternal: false,
      }),
    });
    expect(msgRes.status).toBe(201);

    const listRes = await ctx.request('/api/support/tickets?limit=5', seed.superAdminToken);
    expect(listRes.status).toBe(200);
  });

  it('runs support-escalation-check job without throwing', async () => {
    await expect(ctx.bootResult.jobScheduler.runNow('support-escalation-check')).resolves.toBeUndefined();
  });
});
