import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from 'dotenv';
import * as schema from './schema/index.js';

config();

// Create the connection
const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);

// Create the drizzle instance with schema
export const db = drizzle(client, { schema });

// Export the client for raw queries if needed
export { client };

// Export all schema types for type safety
export * from './schema/index.js';