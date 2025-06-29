import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { getSessionByToken, type AuthUser } from '../lib/auth.js';
import { db } from '../db/index';

export interface Context {
  db: typeof db;
  user: AuthUser | null;
  tenantId: string | null;
}

export async function createContext({
  req,
}: CreateExpressContextOptions): Promise<Context> {
  const token = req.headers.authorization?.split(' ')[1];
  
  let user: AuthUser | null = null;
  let tenantId: string | null = null;
  
  if (token) {
    const sessionData = await getSessionByToken(token);
    if (sessionData) {
      user = {
        id: sessionData.users.id,
        email: sessionData.users.email,
        firstName: sessionData.users.firstName,
        lastName: sessionData.users.lastName,
        role: sessionData.users.role as 'ADMIN' | 'CLIENT' | 'RESELLER',
        tenantId: sessionData.users.tenantId,
      };
      tenantId = sessionData.users.tenantId;
    }
  }

  return {
    db,
    user,
    tenantId,
  };
}