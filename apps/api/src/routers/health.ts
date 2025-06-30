import { router, publicProcedure } from '../trpc/trpc';
import { healthChecker } from '../lib/health/HealthChecker';
import { retryManager } from '../lib/resilience/RetryManager';

export const healthRouter = router({
  // Full health check with detailed information
  check: publicProcedure
    .query(async () => {
      return await healthChecker.performHealthCheck();
    }),

  // Simple liveness probe (for Kubernetes/Docker)
  live: publicProcedure
    .query(async () => {
      const isAlive = await healthChecker.isAlive();
      return {
        status: isAlive ? 'ok' : 'error',
        timestamp: new Date().toISOString(),
      };
    }),

  // Readiness probe (for Kubernetes/Docker)
  ready: publicProcedure
    .query(async () => {
      const isReady = await healthChecker.isReady();
      return {
        status: isReady ? 'ready' : 'not_ready',
        timestamp: new Date().toISOString(),
      };
    }),

  // Circuit breaker status
  circuits: publicProcedure
    .query(async () => {
      const stats = retryManager.getCircuitBreakerStats();
      return {
        circuitBreakers: stats,
        timestamp: new Date().toISOString(),
      };
    }),
}); 