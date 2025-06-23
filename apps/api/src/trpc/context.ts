import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { getSessionByToken, type AuthUser } from '../lib/auth.js';

export interface Context {
  user: AuthUser | null;
  tenantId: string | null;
}

export async function createContext({ req }: CreateExpressContextOptions): Promise<Context> {
  // Extract token from Authorization header
  const authHeader = req.headers.authorization;
  let user: AuthUser | null = null;
  let tenantId: string | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    try {
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
    } catch (error) {
      console.error('Error validating session:', error);
    }
  }

  return {
    user,
    tenantId,
  };
}