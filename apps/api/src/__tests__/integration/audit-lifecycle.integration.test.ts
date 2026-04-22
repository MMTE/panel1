import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  auditModuleTablesExist,
  createTestContext,
  deleteSeedData,
  ensureDir,
  integrationEnabled,
  rmDir,
  seedTestData,
  teardownTestContext,
  uniqueAuditExportDir,
  type TestContext,
} from './helpers.js';

const run = integrationEnabled() && (await auditModuleTablesExist());

async function waitForExportStatus(
  req: TestContext['request'],
  token: string,
  exportId: string,
  timeoutMs = 20_000,
): Promise<{ status: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await req(`/api/audit/exports/${exportId}`, token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    if (body.status === 'completed' || body.status === 'failed') {
      return body;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Timed out waiting for export');
}

describe.skipIf(!run)('audit module integration (DB + Hono)', () => {
  let seed: Awaited<ReturnType<typeof seedTestData>>;
  let ctx: TestContext;
  let exportDir: string;

  beforeAll(async () => {
    exportDir = uniqueAuditExportDir();
    process.env.AUDIT_EXPORT_DIR = exportDir;
    await ensureDir(exportDir);

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
    delete process.env.AUDIT_EXPORT_DIR;
    await rmDir(exportDir).catch(() => {});
  }, 60_000);

  it('returns 401 without Authorization', async () => {
    const res = await ctx.request('/api/audit/logs', null);
    expect(res.status).toBe(401);
  });

  it('returns 403 when role lacks audit.logs.view', async () => {
    const res = await ctx.request('/api/audit/logs', seed.restrictedToken);
    expect(res.status).toBe(403);
  });

  it('logs an event and queries logs', async () => {
    const logRes = await ctx.request('/api/audit/events', seed.superAdminToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actionType: 'integration.test',
        resourceType: 'integration',
        resourceId: 'res-1',
        metadata: { source: 'vitest' },
      }),
    });
    expect(logRes.status).toBe(201);

    const listRes = await ctx.request(
      '/api/audit/logs?limit=10&actionTypes=integration.test',
      seed.superAdminToken,
    );
    expect(listRes.status).toBe(200);
    const body = (await listRes.json()) as { logs: Array<{ actionType: string }>; total: number };
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.logs.some((l) => l.actionType === 'integration.test')).toBe(true);
  });

  it('creates JSON export, completes, and download returns bytes', async () => {
    const start = new Date(Date.now() - 2 * 86400000).toISOString();
    const end = new Date(Date.now() + 86400000).toISOString();

    const createRes = await ctx.request('/api/audit/exports', seed.superAdminToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate: start,
        endDate: end,
        format: 'json',
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { exportId: string };
    const final = await waitForExportStatus(ctx.request, seed.superAdminToken, created.exportId);
    expect(final.status).toBe('completed');

    const dl = await ctx.request(`/api/audit/exports/${created.exportId}/download`, seed.superAdminToken);
    expect(dl.status).toBe(200);
    const buf = new Uint8Array(await dl.arrayBuffer());
    expect(buf.length).toBeGreaterThan(10);
    const text = new TextDecoder().decode(buf);
    expect(text).toContain('exportId');
  });

  it('POST /cleanup is forbidden without audit.logs.cleanup', async () => {
    const res = await ctx.request('/api/audit/cleanup', seed.restrictedToken, { method: 'POST' });
    expect(res.status).toBe(403);
  });

  it('runs audit-cleanup job (weekly maintenance) without throwing', async () => {
    await expect(ctx.bootResult.jobScheduler.runNow('audit-cleanup')).resolves.toBeUndefined();
  });
});
