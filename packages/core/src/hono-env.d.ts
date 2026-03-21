import type { Panel1AuthUser } from './middleware/types.js';

declare module 'hono' {
  interface ContextVariableMap {
    user: Panel1AuthUser;
    tenantId: string | null;
  }
}

export {};
