import { config as loadEnv } from 'dotenv';
loadEnv();

export const modules = [
  '@panel1/mod-audit',
  '@panel1/mod-support',
  // '@panel1/mod-catalog',   // DEFERRED (Phase C / roadmap Issue 3.1): module imports the
  //                          // deleted host runtime apps/api/src/lib/catalog/catalogRuntime.ts
  //                          // (ComponentProviderRegistry/Lifecycle/Management). Re-enable once
  //                          // the component-lifecycle machinery is migrated into the module/core.
  '@panel1/mod-payments',
  '@panel1/mod-billing',
  // '@panel1/mod-subscriptions',  // DEFERRED (Phase E): renewal engine not yet idempotent.
  // '@panel1/mod-provisioning',   // DEFERRED (Phase G): cPanel adapter still a stub.
];

export function getDatabaseUrl(): string {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  return url;
}

/** Redis connection for @panel1/core BullMQ (EventBus + module JobScheduler). */
export function getRedisOptions(): { host: string; port: number; password?: string } {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
  };
}
