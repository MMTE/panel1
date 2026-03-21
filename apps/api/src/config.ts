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
