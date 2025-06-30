import { logger } from '../logging/Logger';
import { db } from '../../db';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, {
    status: 'pass' | 'fail' | 'warn';
    responseTime?: number;
    message?: string;
    details?: any;
  }>;
  timestamp: string;
  version: string;
  uptime: number;
}

export class HealthChecker {
  private startTime = Date.now();

  async performHealthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const checks: HealthCheckResult['checks'] = {};

    logger.debug('Starting health check');

    // Database check
    try {
      const dbStart = Date.now();
      await db.execute('SELECT 1 as health_check');
      const responseTime = Date.now() - dbStart;
      
      checks.database = {
        status: responseTime < 1000 ? 'pass' : 'warn',
        responseTime,
        message: responseTime < 1000 ? 'Database responsive' : 'Database slow response',
      };
    } catch (error) {
      checks.database = {
        status: 'fail',
        message: error instanceof Error ? error.message : 'Database check failed',
        details: { error: error instanceof Error ? error.stack : error },
      };
    }

    // Redis check (if Redis is available)
    try {
      const redisStart = Date.now();
      // Try to create a Redis client and ping
      const { createClient } = await import('redis');
      const redisClient = createClient({
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          connectTimeout: 5000,
        },
        password: process.env.REDIS_PASSWORD,
      });

      await redisClient.connect();
      await redisClient.ping();
      await redisClient.disconnect();
      
      const responseTime = Date.now() - redisStart;
      checks.redis = {
        status: responseTime < 500 ? 'pass' : 'warn',
        responseTime,
        message: responseTime < 500 ? 'Redis responsive' : 'Redis slow response',
      };
    } catch (error) {
      checks.redis = {
        status: 'warn', // Redis is optional for basic functionality
        message: error instanceof Error ? error.message : 'Redis check failed',
        details: { error: error instanceof Error ? error.stack : error },
      };
    }

    // Memory check
    try {
      const memUsage = process.memoryUsage();
      const memUsageMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      const memLimitMB = Math.round(memUsage.heapTotal / 1024 / 1024);
      const memUsagePercent = (memUsageMB / memLimitMB) * 100;

      checks.memory = {
        status: memUsagePercent < 80 ? 'pass' : memUsagePercent < 90 ? 'warn' : 'fail',
        message: `Memory usage: ${memUsageMB}MB / ${memLimitMB}MB (${memUsagePercent.toFixed(1)}%)`,
        details: {
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
          external: memUsage.external,
          rss: memUsage.rss,
        },
      };
    } catch (error) {
      checks.memory = {
        status: 'warn',
        message: 'Memory check failed',
        details: { error: error instanceof Error ? error.stack : error },
      };
    }

    // Disk space check (basic)
    try {
      const fs = await import('fs');
      const stats = fs.statSync('.');
      
      checks.disk = {
        status: 'pass',
        message: 'Disk accessible',
        details: {
          accessible: true,
        },
      };
    } catch (error) {
      checks.disk = {
        status: 'fail',
        message: 'Disk check failed',
        details: { error: error instanceof Error ? error.stack : error },
      };
    }

    // Environment check
    try {
      const requiredEnvVars = [
        'DATABASE_URL',
        'JWT_SECRET',
      ];

      const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
      
      checks.environment = {
        status: missingVars.length === 0 ? 'pass' : 'fail',
        message: missingVars.length === 0 
          ? 'All required environment variables present'
          : `Missing environment variables: ${missingVars.join(', ')}`,
        details: {
          missing: missingVars,
          nodeEnv: process.env.NODE_ENV,
        },
      };
    } catch (error) {
      checks.environment = {
        status: 'warn',
        message: 'Environment check failed',
        details: { error: error instanceof Error ? error.stack : error },
      };
    }

    // External services check (optional)
    await this.checkExternalServices(checks);

    // Determine overall status
    const failedChecks = Object.values(checks).filter(check => check.status === 'fail');
    const warnChecks = Object.values(checks).filter(check => check.status === 'warn');
    
    let status: HealthCheckResult['status'];
    if (failedChecks.length > 0) {
      status = 'unhealthy';
    } else if (warnChecks.length > 0) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    const result: HealthCheckResult = {
      status,
      checks,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
      uptime: Date.now() - this.startTime,
    };

    const duration = Date.now() - startTime;
    logger.info('Health check completed', {
      status,
      duration,
      failedChecks: failedChecks.length,
      warnChecks: warnChecks.length,
      totalChecks: Object.keys(checks).length,
    });

    return result;
  }

  private async checkExternalServices(checks: HealthCheckResult['checks']): Promise<void> {
    // Check SMTP service (if configured)
    if (process.env.SMTP_HOST) {
      try {
        const net = await import('net');
        const socket = new net.Socket();
        
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            socket.destroy();
            reject(new Error('SMTP connection timeout'));
          }, 5000);

          socket.connect(
            parseInt(process.env.SMTP_PORT || '25'),
            process.env.SMTP_HOST,
            () => {
              clearTimeout(timeout);
              socket.destroy();
              resolve(true);
            }
          );

          socket.on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
          });
        });

        checks.smtp = {
          status: 'pass',
          message: 'SMTP server reachable',
        };
      } catch (error) {
        checks.smtp = {
          status: 'warn', // SMTP is not critical for core functionality
          message: error instanceof Error ? error.message : 'SMTP check failed',
        };
      }
    }
  }

  // Quick health check for liveness probe
  async isAlive(): Promise<boolean> {
    try {
      await db.execute('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  // Ready check for readiness probe
  async isReady(): Promise<boolean> {
    try {
      const result = await this.performHealthCheck();
      return result.status !== 'unhealthy';
    } catch {
      return false;
    }
  }
}

export const healthChecker = new HealthChecker(); 