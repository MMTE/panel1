import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from 'dotenv';

config();

// Create the connection
const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);

// Create the drizzle instance
export const db = drizzle(client);

// Export the client for raw queries if needed
export { client };