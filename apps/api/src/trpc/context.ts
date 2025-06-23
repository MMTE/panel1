import type { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { db } from '../db/index.js';
import { users } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface Context {
  req: Request;
  res: Response;
  db: typeof db;
  supabase: typeof supabase;
  user?: {
    id: string;
    email: string;
    role: string;
    tenantId?: string;
  };
  tenantId?: string;
}

export async function createContext({ req, res }: { req: Request; res: Response }): Promise<Context> {
  // Get token from Authorization header
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  let user = undefined;
  let tenantId = undefined;
  
  if (token) {
    try {
      // Verify token with Supabase
      const { data: { user: authUser }, error } = await supabase.auth.getUser(token);
      
      if (authUser && !error) {
        // Get user details from our database
        const [dbUser] = await db
          .select()
          .from(users)
          .where(eq(users.authUserId, authUser.id))
          .limit(1);
        
        if (dbUser && dbUser.isActive) {
          user = {
            id: dbUser.id,
            email: dbUser.email,
            role: dbUser.role || 'CLIENT',
            tenantId: dbUser.tenantId || undefined,
          };
          tenantId = dbUser.tenantId || undefined;
        }
      }
    } catch (error) {
      // Invalid token, user remains undefined
      console.error('Auth error:', error);
    }
  }

  return {
    req,
    res,
    db,
    supabase,
    user,
    tenantId,
  };
}