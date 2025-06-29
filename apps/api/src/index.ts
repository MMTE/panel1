import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './routers/index';
import { createContext } from './trpc/context';
import { jobProcessor } from './lib/jobs/JobProcessor';
import { initializeEmailService } from './lib/email';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.API_PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
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
    // Initialize email service first (other services may depend on it)
    await initializeEmailService();
    
    // Initialize job processor
    await jobProcessor.initialize();
    
    console.log('✅ All services initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize services:', error);
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
  await jobProcessor.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('📥 SIGINT received, shutting down gracefully...');
  await jobProcessor.shutdown();
  process.exit(0);
});