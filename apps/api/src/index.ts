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

const moduleRetryManager = new RetryManager();
const encryptionService = new EncryptionService();

// Module-level boot status — read by /health so it reflects the real async boot state.
// States: 'booting' (initial) -> 'ok' | 'failed' once bootModularSystem() settles.
type BootStatus = { phase: 'booting' | 'ok' | 'failed'; moduleCount: number; failedImports: { name: string; error: string }[] };
let bootStatus: BootStatus = { phase: 'booting', moduleCount: 0, failedImports: [] };

const app = express();
const PORT = process.env.API_PORT || 3001;

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "http://localhost:*", "ws://localhost:*"]
    }
  }
}));

app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://localhost:8000',
      'http://localhost:8080',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000'
    ];
    if (process.env.NODE_ENV === 'development') {
      const localhostRegex = /^http:\/\/localhost:\d+$/;
      if (!origin || localhostRegex.test(origin) || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
    } else {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-TRPC', 'x-trpc-source'],
  exposedHeaders: ['set-cookie'],
  maxAge: 600
}));

app.get('/health', (req, res) => {
  const timestamp = new Date().toISOString();
  if (bootStatus.phase === 'booting') {
    res.status(503).json({ status: 'booting', timestamp });
    return;
  }
  if (bootStatus.phase === 'failed') {
    res.status(503).json({
      status: 'failed',
      modules: bootStatus.moduleCount,
      failures: bootStatus.failedImports,
      timestamp,
    });
    return;
  }
  res.status(200).json({
    status: 'ok',
    modules: bootStatus.moduleCount,
    failedImports: bootStatus.failedImports,
    timestamp,
    version: process.env.npm_package_version || '0.1.0'
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

async function bootModularSystem(): Promise<{ result: BootResult; failedImports: { name: string; error: string }[] }> {
  const moduleDefs: ModuleDefinition[] = [];
  const importFailures: { name: string; error: string }[] = [];

  for (const pkgName of moduleList) {
    try {
      const mod = await import(pkgName);
      moduleDefs.push(mod.default);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`Module import failed, skipping: ${pkgName}`, { pkgName, error: msg });
      importFailures.push({ name: pkgName, error: msg });
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
    bootStatus = { phase: 'ok', moduleCount: result.modules.length, failedImports };
    console.log(`  Module system booted (${result.modules.length} modules)`);
    await result.eventBus.emit('app.started', { timestamp: new Date() });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Module boot failed', { error: msg });
    bootStatus = { phase: 'failed', moduleCount: bootStatus.moduleCount, failedImports: [{ name: 'boot', error: msg }] };
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
