import { config as loadEnv } from 'dotenv';
loadEnv();

export const modules = [
  '@panel1/mod-audit',
  '@panel1/mod-support',
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
