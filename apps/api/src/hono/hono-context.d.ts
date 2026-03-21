import type { Panel1AuthUser } from '@panel1/core';

declare module 'hono' {
  interface ContextVariableMap {
    user: Panel1AuthUser;
    tenantId: string | null;
  }
}

export {};
