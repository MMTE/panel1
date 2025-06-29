import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from 'dotenv';
import * as schema from './schema/index';

config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// Create the connection
const connectionString = process.env.DATABASE_URL;
const client = postgres(connectionString, { max: 1 });

// Create the drizzle instance with schema
export const db = drizzle(client, { schema });

// Export the client for raw queries if needed
export { client };

// Export all schema types for type safety
export * from './schema/index';