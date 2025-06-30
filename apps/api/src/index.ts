import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
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
import dotenv from 'dotenv';
import { PluginManager } from './lib/plugins/PluginManager';
import { NotificationPlugin } from './lib/plugins/examples/NotificationPlugin';
import { logger } from './lib/logging/Logger';

// Load environment variables
dotenv.config();

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
      'http://localhost:3000',  // Common React dev port
      'http://localhost:5173',  // Vite default
      'http://localhost:5174',  // Vite alternate
      'http://localhost:5175',  // Vite alternate
      'http://localhost:8000',  // Another common dev port
      'http://localhost:8080',  // Another common dev port
      'http://127.0.0.1:5173', // Support for IPv4 loopback
      'http://127.0.0.1:3000'  // Support for IPv4 loopback
    ];
    
    // Allow all localhost origins in development
    if (process.env.NODE_ENV === 'development') {
      const localhostRegex = /^http:\/\/localhost:\d+$/;
      if (!origin || localhostRegex.test(origin) || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
    } else {
      // In production, strictly check against allowedOrigins
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
  maxAge: 600 // 10 minutes
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0'
  });
});

// tRPC middleware
app.use(
  '/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

// Initialize all services
async function initializeServices() {
  try {
    // Initialize plugin manager first
    const pluginManager = PluginManager.getInstance();
    await pluginManager.initialize();

    // For development, load the notification plugin in-process
    if (process.env.NODE_ENV === 'development') {
      try {
        // Temporarily disable notification plugin
        /*
        const notificationPlugin = new NotificationPlugin();
        await pluginManager.registerPlugin('notification-plugin', notificationPlugin, {
          config: {
            enabled: true,
            channels: {
              email: {
                enabled: true,
                from: process.env.NOTIFICATION_EMAIL_FROM || 'noreply@panel1.dev',
              },
              slack: {
                enabled: process.env.NOTIFICATION_SLACK_ENABLED === 'true',
                webhookUrl: process.env.NOTIFICATION_SLACK_WEBHOOK_URL || '',
              },
              sms: {
                enabled: process.env.NOTIFICATION_SMS_ENABLED === 'true',
                apiKey: process.env.NOTIFICATION_SMS_API_KEY || '',
                from: process.env.NOTIFICATION_SMS_FROM || '',
              },
            },
            templates: {},
          },
        });

        await pluginManager.enablePlugin('notification-plugin');
        logger.info('✅ Notification plugin loaded and enabled in development mode');
        */
      } catch (pluginError) {
        logger.warn('⚠️ Failed to setup notification plugin:', pluginError);
        // Continue with initialization - don't let plugin failure stop the server
      }
    } else {
      // In production, try to load the compiled plugin
      try {
        await pluginManager.installPlugin('notification-plugin', {
          config: {
            enabled: true,
            channels: {
              email: {
                enabled: true,
                from: process.env.NOTIFICATION_EMAIL_FROM || 'noreply@panel1.dev',
              },
              slack: {
                enabled: process.env.NOTIFICATION_SLACK_ENABLED === 'true',
                webhookUrl: process.env.NOTIFICATION_SLACK_WEBHOOK_URL || '',
              },
              sms: {
                enabled: process.env.NOTIFICATION_SMS_ENABLED === 'true',
                apiKey: process.env.NOTIFICATION_SMS_API_KEY || '',
                from: process.env.NOTIFICATION_SMS_FROM || '',
              },
            },
            templates: {},
          },
        });

        await pluginManager.enablePlugin('notification-plugin');
        logger.info('✅ Notification plugin loaded and enabled from filesystem');
      } catch (pluginError) {
        logger.warn('⚠️ Failed to load notification plugin from filesystem:', pluginError);
      }
    }

    // Initialize email service first (other services may depend on it)
    await initializeEmailService();
    
    // Initialize component provider registry
    await componentProviderRegistry.initialize();
    
    // Initialize catalog event handlers
    const catalogEventHandlers = CatalogEventHandlers.getInstance();
    await catalogEventHandlers.initialize();
    
    // Initialize payment event handler
    const paymentEventHandler = PaymentEventHandler.getInstance();
    await paymentEventHandler.initialize();
    
    // Initialize job processor
    await jobProcessor.initialize();
    
    // Initialize and start event processor
    const eventProcessor = EventProcessor.getInstance();
    await eventProcessor.start();
    
    // Initialize ComponentLifecycleService and register handlers
    const lifecycleService = ComponentLifecycleService.getInstance();
    
    // Register the CpanelPlugin as a handler for 'cpanel' provider
    const cpanelPlugin = new CpanelPlugin();
    lifecycleService.registerHandler('cpanel', cpanelPlugin);
    
    // Register the DomainComponentHandler for 'domain-manager' provider
    const domainHandler = new DomainComponentHandler();
    lifecycleService.registerHandler('domain-manager', domainHandler);
    
    // Register the SslComponentHandler for 'ssl-manager' provider
    const sslHandler = new SslComponentHandler();
    lifecycleService.registerHandler('ssl-manager', sslHandler);
    
    // Register the SupportComponentHandler for 'support-manager' provider
    const supportHandler = new SupportComponentHandler();
    lifecycleService.registerHandler('support-manager', supportHandler);
    
    // Start the lifecycle service
    await lifecycleService.start();
    
    console.log('✅ All services initialized successfully');
  } catch (error) {
    logger.error('❌ Failed to initialize services:', error);
    process.exit(1);
  }
}

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Panel1 API Server running on http://localhost:${PORT}`);
  console.log(`📡 tRPC endpoint: http://localhost:${PORT}/trpc`);
  
  // Initialize background services
  await initializeServices();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('📥 SIGTERM received, shutting down gracefully...');
  const eventProcessor = EventProcessor.getInstance();
  await eventProcessor.stop();
  const lifecycleService = ComponentLifecycleService.getInstance();
  await lifecycleService.stop();
  await jobProcessor.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('📥 SIGINT received, shutting down gracefully...');
  const eventProcessor = EventProcessor.getInstance();
  await eventProcessor.stop();
  const lifecycleService = ComponentLifecycleService.getInstance();
  await lifecycleService.stop();
  await jobProcessor.shutdown();
  process.exit(0);
});