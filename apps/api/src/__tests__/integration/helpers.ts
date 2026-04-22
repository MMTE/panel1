import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { SQL } from 'drizzle-orm';
import { Hono } from 'hono';
import { bootModules, shutdown, type BootResult } from '@panel1/core';
import { getDatabaseUrl } from '../../config.js';
import { createEventOutboxHooks } from '../../lib/core/eventOutbox.js';

export function integrationEnabled(): boolean {
  return !!process.env.DATABASE_URL;
}

/** True when the support module tables are present (migrations applied). */
export async function supportModuleTablesExist(): Promise<boolean> {
  return tableExists('support_ticket_counters');
}

/** True when the audit module tables are present (migrations applied). */
export async function auditModuleTablesExist(): Promise<boolean> {
  return tableExists('audit_logs');
}

async function tableExists(tableName: string): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    const { client } = await import('../../db/index.js');
    const rows = await client`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ${tableName}
      ) AS ok
    `;
    return rows[0]?.ok === true;
  } catch {
    return false;
  }
}

/** Build a `Request` for `app.fetch` / `Hono.request` with optional Bearer token. */
export function createAuthenticatedRequest(
  path: string,
  token: string | null,
  init: RequestInit = {},
): Request {
  const headers = new Headers(init.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return new Request(`http://localhost${path}`, { ...init, headers });
}

export interface SeedTestDataResult {
  tenantId: string;
  superAdminUserId: string;
  restrictedUserId: string;
  superAdminToken: string;
  restrictedToken: string;
}

/**
 * Inserts tenant + users + sessions in the host DB (same DATABASE_URL as integration boot).
 * SUPER_ADMIN: full access. CLIENT: used for 403 checks — seed has no support.dashboard / audit.logs (role hierarchy is one parent hop; CLIENT inherits from RESELLER only).
 */
export async function seedTestData(): Promise<SeedTestDataResult> {
  const suffix = `${Date.now()}-${randomBytes(4).toString('hex')}`;
  const slug = `int-test-${suffix}`;
  const saEmail = `integration-test-sa-${suffix}@test.local`;
  const rEmail = `integration-test-cl-${suffix}@test.local`;

  const { db } = await import('../../db/index.js');
  const { tenants } = await import('../../db/schema/tenants.js');
  const { users } = await import('../../db/schema/users.js');
  const { hashPassword, createSession } = await import('../../lib/auth.js');
  const { sql } = await import('drizzle-orm');

  const [tenant] = await db
    .insert(tenants)
    .values({ name: `Integration ${suffix}`, slug })
    .returning({ id: tenants.id });

  const pwd = await hashPassword('IntegrationTest!1');

  const [superAdmin] = await db
    .insert(users)
    .values({
      email: saEmail,
      password: pwd,
      firstName: 'Int',
      lastName: 'SA',
      role: 'SUPER_ADMIN',
      tenantId: tenant.id,
    })
    .returning({ id: users.id });

  const [restricted] = await db
    .insert(users)
    .values({
      email: rEmail,
      password: pwd,
      firstName: 'Int',
      lastName: 'Client',
      role: 'CLIENT',
      tenantId: tenant.id,
    })
    .returning({ id: users.id });

  const superAdminToken = await createSession(superAdmin.id);
  const restrictedToken = await createSession(restricted.id);

  return {
    tenantId: tenant.id,
    superAdminUserId: superAdmin.id,
    restrictedUserId: restricted.id,
    superAdminToken,
    restrictedToken,
  };
}

export interface TestContext {
  app: Hono;
  bootResult: BootResult;
  seed: SeedTestDataResult;
  /** GET/POST helper — path must start with `/api/...` */
  request: (path: string, token: string | null, init?: RequestInit) => Promise<Response>;
}

export async function createTestContext(seed: SeedTestDataResult): Promise<TestContext> {
  const { apiBearerAuthMiddleware, apiTenantMiddleware, apiRequirePermission } = await import(
    '../../hono/security.js'
  );
  const auditMod = await import('@panel1/mod-audit');
  const supportMod = await import('@panel1/mod-support');
  const { db } = await import('../../db/index.js');

  const bootResult = await bootModules({
    modules: [auditMod.default, supportMod.default],
    db: { connectionString: getDatabaseUrl(), maxConnections: 5 },
    eventBusOptions: {
      outbox: createEventOutboxHooks(db),
    },
    requirePermission: apiRequirePermission,
    hostInfra: {
      email: { sendEmail: async () => {} },
    },
  });

  if (bootResult.failedModules.length) {
    await shutdown(bootResult);
    throw new Error(
      `Module boot failed: ${bootResult.failedModules.map((f) => `${f.name}: ${f.error.message}`).join('; ')}`
    );
  }

  const app = new Hono();
  app.use('*', apiBearerAuthMiddleware);
  app.use('*', apiTenantMiddleware);

  for (const [moduleName, routes] of bootResult.moduleRoutes) {
    app.route(`/api/${moduleName}`, routes as any);
  }

  const request = (path: string, token: string | null, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return app.request(`http://localhost${path}`, { ...init, headers });
  };

  return { app, bootResult, seed, request };
}

export async function teardownTestContext(ctx: TestContext): Promise<void> {
  await shutdown(ctx.bootResult);
}

/** Deletes rows created for integration tests (module tables + core tenant/users). */
export async function deleteSeedData(seed: SeedTestDataResult): Promise<void> {
  const { db } = await import('../../db/index.js');
  const { users, sessions } = await import('../../db/schema/users.js');
  const { tenants } = await import('../../db/schema/tenants.js');
  const { eq, inArray } = await import('drizzle-orm');
  const { sql } = await import('drizzle-orm');

  const tenantId = seed.tenantId;
  const userIds = [seed.superAdminUserId, seed.restrictedUserId];

  await executeOptionalDelete(sql`DELETE FROM knowledge_base_articles WHERE tenant_id = ${tenantId}`);
  await executeOptionalDelete(sql`DELETE FROM knowledge_base_categories WHERE tenant_id = ${tenantId}`);
  await executeOptionalDelete(sql`DELETE FROM support_automation_rules WHERE tenant_id = ${tenantId}`);
  await executeOptionalDelete(sql`DELETE FROM support_sla_profiles WHERE tenant_id = ${tenantId}`);
  await executeOptionalDelete(sql`DELETE FROM support_agent_profiles WHERE tenant_id = ${tenantId}`);
  await executeOptionalDelete(sql`DELETE FROM ticket_messages WHERE tenant_id = ${tenantId}`);
  await executeOptionalDelete(sql`DELETE FROM support_tickets WHERE tenant_id = ${tenantId}`);
  await executeOptionalDelete(sql`DELETE FROM support_categories WHERE tenant_id = ${tenantId}`);
  await executeOptionalDelete(sql`DELETE FROM support_ticket_counters WHERE tenant_id = ${tenantId}`);
  await executeOptionalDelete(sql`DELETE FROM audit_log_exports WHERE tenant_id = ${tenantId}`);
  await executeOptionalDelete(sql`DELETE FROM audit_log_retention_policies WHERE tenant_id = ${tenantId}`);
  await executeOptionalDelete(sql`DELETE FROM audit_logs WHERE tenant_id = ${tenantId}`);

  await db.delete(sessions).where(inArray(sessions.userId, userIds));
  await db.delete(users).where(inArray(users.id, userIds));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
}

async function executeOptionalDelete(q: SQL): Promise<void> {
  const { db } = await import('../../db/index.js');
  try {
    await db.execute(q);
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code !== '42P01') {
      throw e;
    }
  }
}

export function uniqueAuditExportDir(): string {
  const dir = join(tmpdir(), `panel1-audit-int-${Date.now()}-${randomBytes(4).toString('hex')}`);
  return dir;
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function rmDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}
