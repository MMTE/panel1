import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export interface DbManagerOptions {
  connectionString: string;
  maxConnections?: number;
}

export class DbManager {
  private client: ReturnType<typeof postgres> | null = null;
  private drizzleInstance: ReturnType<typeof drizzle> | null = null;
  private schemas: Record<string, Record<string, unknown>> = {};

  constructor(private options: DbManagerOptions) {}

  collectSchema(moduleName: string, schema: Record<string, unknown>): void {
    this.schemas[moduleName] = schema;
  }

  getDb(): ReturnType<typeof drizzle> {
    if (!this.drizzleInstance) {
      const allSchemas = Object.values(this.schemas).reduce(
        (acc, s) => ({ ...acc, ...s }),
        {} as Record<string, unknown>
      );
      this.client = postgres(this.options.connectionString, {
        max: this.options.maxConnections || 10,
      });
      this.drizzleInstance = drizzle(this.client, { schema: allSchemas as any });
    }
    return this.drizzleInstance;
  }

  getAllSchemas(): Record<string, unknown> {
    return Object.values(this.schemas).reduce(
      (acc, s) => ({ ...acc, ...s }),
      {} as Record<string, unknown>
    );
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = null;
      this.drizzleInstance = null;
    }
  }
}
