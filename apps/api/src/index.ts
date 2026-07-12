import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { Hono } from 'hono';
import { appRouter } from './routers/index';
import { createContext } from './trpc/context';

import { bootModules, shutdown, type BootResult, RetryManager, logger, EncryptionService } from '@panel1/core';
import type { ModuleDefinition } from '@panel1/types';
import { modules as moduleList, getDatabaseUrl, getRedisOptions } from './config';
import { db } from './db';
import { createEventOutboxHooks } from './lib/core/eventOutbox.js';
import { apiBearerAuthMiddleware, apiTenantMiddleware, apiRequirePermission } from './hono/security.js';
import { seedModulePermissionsFromDefinitions } from './lib/permissions/seedModulePermissions';
import { permissionManager } from './lib/auth/PermissionManager';
import {
  makeCorsOriginVerifier,
  buildConnectSrc,
  buildScriptSrc,
} from './lib/security/contentPolicy.js';

// Security policy inputs resolved once at boot (R13).
const securityPolicyInput = {
  nodeEnv: process.env.NODE_ENV,
  corsOrigin: process.env.CORS_ORIGIN,
  apiOrigin: process.env.API_ORIGIN,
};

const moduleRetryManager = new RetryManager();
const encryptionService = new EncryptionService();

// Module-level boot status — read by /health so it reflects the real async boot state.
// States: 'booting' (initial) -> 'ok' | 'degraded' | 'failed' once bootModularSystem() settles.
// `booted` is the count of modules whose setup() actually succeeded (core's BootResult.bootedModules.length),
// NOT the registered count. `failures` aggregates BOTH import-time and setup-time failures with a `phase`
// tag so monitors can distinguish them. status 'ok' requires zero failures; 'degraded' = partial boot
// (some failed, at least one booted); 'failed' = zero booted or bootModularSystem() threw.
type BootFailure = { name: string; error: string; phase: 'import' | 'setup' };
type BootStatus = {
  phase: 'booting' | 'ok' | 'degraded' | 'failed';
  booted: number;
  failures: BootFailure[];
};
let bootStatus: BootStatus = { phase: 'booting', booted: 0, failures: [] };

const app = express();
const PORT = process.env.API_PORT || 3001;

// Security middleware
// CSP/CORS are env-driven (R13): see lib/security/contentPolicy.ts. CSP drops
// 'unsafe-eval' entirely; connectSrc + CORS allowlist come from API_ORIGIN /
// CORS_ORIGIN, with localhost permitted only when NODE_ENV=development.
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: buildScriptSrc(securityPolicyInput),
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: buildConnectSrc(securityPolicyInput)
    }
  }
}));

app.use(cors({
  origin: makeCorsOriginVerifier(securityPolicyInput),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-TRPC', 'x-trpc-source'],
  exposedHeaders: ['set-cookie'],
  maxAge: 600
}));

app.get('/health', (req, res) => {
  const timestamp = new Date().toISOString();
  const version = process.env.npm_package_version || '0.1.0';
  if (bootStatus.phase === 'booting') {
    // 503 while boot is in progress — every body uses the same `failures` key (empty here).
    res.status(503).json({ status: 'booting', booted: bootStatus.booted, failures: bootStatus.failures, timestamp });
    return;
  }
  if (bootStatus.phase === 'failed') {
    // 503 when zero modules booted or bootModularSystem() threw.
    res.status(503).json({
      status: 'failed',
      booted: bootStatus.booted,
      failures: bootStatus.failures,
      timestamp,
      version,
    });
    return;
  }
  // 200 for both 'ok' (no failures) and 'degraded' (partial boot) — a degraded service should not
  // fail its own healthcheck into the ground, but the `status` field lets monitors alert on `degraded`.
  res.status(200).json({
    status: bootStatus.phase, // 'ok' | 'degraded'
    booted: bootStatus.booted,
    failures: bootStatus.failures,
    timestamp,
    version,
  });
});

// tRPC middleware (legacy — will be removed when all routers migrate to Hono)
app.use(
  '/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

let bootResult: BootResult | null = null;

async function bootModularSystem(): Promise<{ result: BootResult; failedImports: BootFailure[] }> {
  const moduleDefs: ModuleDefinition[] = [];
  const importFailures: BootFailure[] = [];

  for (const pkgName of moduleList) {
    try {
      const mod = await import(pkgName);
      moduleDefs.push(mod.default);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Module import failed, skipping: ${pkgName}`, { pkgName, error: msg });
      importFailures.push({ name: pkgName, error: msg, phase: 'import' });
    }
  }

  if (moduleDefs.length === 0) {
    throw new Error(`All ${moduleList.length} module imports failed; cannot boot`);
  }
  if (importFailures.length > 0) {
    logger.warn(`Boot proceeding with ${moduleDefs.length}/${moduleList.length} modules; failed: ${importFailures.map(f => f.name).join(', ')}`);
  }

  const result = await bootModules({
    modules: moduleDefs,
    db: { connectionString: getDatabaseUrl() },
    redis: getRedisOptions(),
    requirePermission: apiRequirePermission,
    eventBusOptions: {
      outbox: createEventOutboxHooks(db),
    },
    hostInfra: {
      encryption: encryptionService,
      retry: moduleRetryManager,
    },
  });

  await seedModulePermissionsFromDefinitions(moduleDefs);
  permissionManager.clearCache();

  const honoApp = new Hono();
  honoApp.use('*', apiBearerAuthMiddleware);
  honoApp.use('*', apiTenantMiddleware);

  for (const [moduleName, routes] of result.moduleRoutes) {
    honoApp.route(`/api/${moduleName}`, routes as any);
  }

  // Mount Hono as Express middleware for /api/* paths
  app.all('/api/*', async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    const url = new URL(req.url, `http://${req.headers.host}`);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }

    let body: BodyInit | undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      body = Buffer.concat(chunks);
    }

    const honoReq = new Request(url.toString(), {
      method: req.method,
      headers,
      body,
    });

    const honoRes = await honoApp.fetch(honoReq);
    res.status(honoRes.status);
    honoRes.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    const resBody = await honoRes.text();
    res.send(resBody);
  });

  console.log(`  Module routes mounted: ${[...result.moduleRoutes.keys()].map(n => `/api/${n}/`).join(', ')}`);
  return { result, failedImports: importFailures };
}

app.listen(PORT, async () => {
  console.log(`Panel1 API Server starting on http://localhost:${PORT}`);
  console.log(`  tRPC endpoint: http://localhost:${PORT}/trpc`);

  try {
    const { result, failedImports } = await bootModularSystem();
    bootResult = result;
    // I1: core tolerates per-module setup() failures (returned in result.failedModules) without throwing.
    // Combine them with import-time failures so /health can't report a false-positive 'ok' when a module
    // loaded but failed to set up. The booted count comes from result.bootedModules.length (the modules
    // whose setup() actually succeeded), NOT result.modules.length (the registered count).
    const setupFailures: BootFailure[] = result.failedModules.map((f) => ({
      name: f.name,
      error: f.error instanceof Error ? f.error.message : String(f.error),
      phase: 'setup',
    }));
    const failures = [...failedImports, ...setupFailures];
    const booted = result.bootedModules.length;
    const phase = failures.length === 0 ? 'ok' : booted > 0 ? 'degraded' : 'failed';
    bootStatus = { phase, booted, failures };
    console.log(`  Module system booted (${booted}/${result.modules.length} booted, ${failures.length} failed)`);
    await result.eventBus.emit('app.started', { timestamp: new Date() });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Module boot failed', { error: msg });
    // bootModularSystem() threw (e.g. all imports failed, dependency cycle, infra error) — zero modules booted.
    bootStatus = { phase: 'failed', booted: 0, failures: [{ name: 'boot', error: msg, phase: 'setup' }] };
  }

  console.log('Panel1 API Server ready');
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  if (bootResult) {
    await bootResult.eventBus.emit('app.stopping', { reason: 'SIGTERM' });
    await shutdown(bootResult);
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down...');
  if (bootResult) {
    await bootResult.eventBus.emit('app.stopping', { reason: 'SIGINT' });
    await shutdown(bootResult);
  }
  process.exit(0);
});
