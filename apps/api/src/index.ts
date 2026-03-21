import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { Hono } from 'hono';
import { appRouter } from './routers/index';
import { createContext } from './trpc/context';
import { jobProcessor } from './lib/jobs/JobProcessor';
import { initializeEmailService } from './lib/email';
import { componentProviderRegistry } from './lib/catalog/ComponentProviderRegistry';
import { CatalogEventHandlers } from './lib/catalog/CatalogEventHandlers';
import { EventProcessor } from './lib/jobs/processors/EventProcessor';
import { ComponentLifecycleService } from './lib/components/ComponentLifecycleService';
import { CpanelPlugin } from './lib/provisioning/plugins/CpanelPlugin';
import { DomainComponentHandler } from './lib/domains/DomainComponentHandler';
import { SslComponentHandler } from './lib/ssl/SslComponentHandler';
import { SupportComponentHandler } from './lib/support/SupportComponentHandler';
import { PaymentEventHandler } from './lib/payments/PaymentEventHandler';
import { PluginManager } from './lib/plugins/PluginManager';
import { logger } from './lib/logging/Logger';
import { bootModules, type BootResult } from '@panel1/core';
import type { ModuleDefinition } from '@panel1/types';
import { modules as moduleList, getDatabaseUrl } from './config';

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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-TRPC', 'x-trpc-source', 'x-tenant-id'],
  exposedHeaders: ['set-cookie'],
  maxAge: 600
}));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
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

async function bootModularSystem(): Promise<BootResult> {
  const moduleDefs: ModuleDefinition[] = [];

  for (const pkgName of moduleList) {
    const mod = await import(pkgName);
    moduleDefs.push(mod.default);
  }

  const result = await bootModules({
    modules: moduleDefs,
    db: { connectionString: getDatabaseUrl() },
  });

  const honoApp = new Hono();

  for (const [moduleName, routes] of result.moduleRoutes) {
    honoApp.route(`/api/${moduleName}`, routes as any);
  }

  // Mount Hono as Express middleware for /api/* paths
  app.all('/api/*', async (req, res) => {
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
  return result;
}

async function initializeServices() {
  try {
    const pluginManager = PluginManager.getInstance();
    await pluginManager.initialize();

    await initializeEmailService();
    await componentProviderRegistry.initialize();

    const catalogEventHandlers = CatalogEventHandlers.getInstance();
    await catalogEventHandlers.initialize();

    const paymentEventHandler = PaymentEventHandler.getInstance();
    await paymentEventHandler.initialize();

    await jobProcessor.initialize();

    const eventProcessor = EventProcessor.getInstance();
    await eventProcessor.start();

    const lifecycleService = ComponentLifecycleService.getInstance();

    const cpanelPlugin = new CpanelPlugin();
    lifecycleService.registerHandler('cpanel', cpanelPlugin);

    const domainHandler = new DomainComponentHandler();
    lifecycleService.registerHandler('domain-manager', domainHandler);

    const sslHandler = new SslComponentHandler();
    lifecycleService.registerHandler('ssl-manager', sslHandler);

    const supportHandler = new SupportComponentHandler();
    lifecycleService.registerHandler('support-manager', supportHandler);

    await lifecycleService.start();

    console.log('  Legacy services initialized');
  } catch (error) {
    logger.error('Failed to initialize legacy services:', error);
    process.exit(1);
  }
}

app.listen(PORT, async () => {
  console.log(`Panel1 API Server starting on http://localhost:${PORT}`);
  console.log(`  tRPC endpoint: http://localhost:${PORT}/trpc`);

  try {
    bootResult = await bootModularSystem();
    console.log(`  Module system booted (${bootResult.modules.length} modules)`);
    await bootResult.eventBus.emit('app.started', { timestamp: new Date() });
  } catch (error) {
    console.error('Module boot failed:', error);
  }

  await initializeServices();
  console.log('Panel1 API Server ready');
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  if (bootResult) {
    await bootResult.eventBus.emit('app.stopping', { reason: 'SIGTERM' });
    await bootResult.dbManager.close();
  }
  const eventProcessor = EventProcessor.getInstance();
  await eventProcessor.stop();
  const lifecycleService = ComponentLifecycleService.getInstance();
  await lifecycleService.stop();
  await jobProcessor.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down...');
  if (bootResult) {
    await bootResult.eventBus.emit('app.stopping', { reason: 'SIGINT' });
    await bootResult.dbManager.close();
  }
  const eventProcessor = EventProcessor.getInstance();
  await eventProcessor.stop();
  const lifecycleService = ComponentLifecycleService.getInstance();
  await lifecycleService.stop();
  await jobProcessor.shutdown();
  process.exit(0);
});