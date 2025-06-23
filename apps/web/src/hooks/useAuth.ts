import { useState, useEffect } from 'react';
// import { supabase } from '../lib/supabase'; // TODO: Replace with tRPC
import { auditLogger } from '../lib/audit/AuditLogger';
import { emitEvent } from '../lib/events/EventEmitter';
import type { User, Session } from '@supabase/supabase-js';
import { trpc } from '../api/trpc';

export interface AuthUser {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role: 'ADMIN' | 'CLIENT' | 'RESELLER';
  is_active: boolean;
}

// Demo mode configuration
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
const DEMO_USER_ROLE = import.meta.env.VITE_DEMO_USER_ROLE || 'ADMIN';

// Mock demo user data
const createDemoUser = (role: string = DEMO_USER_ROLE): AuthUser => ({
  id: 'demo-user-id',
  email: 'demo@panel1.dev',
  first_name: 'Demo',
  last_name: 'User',
  role: role as 'ADMIN' | 'CLIENT' | 'RESELLER',
  is_active: true,
});

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  
  const utils = trpc.useContext();
  const { mutateAsync: loginMutation } = trpc.auth.login.useMutation();
  const { mutateAsync: registerMutation } = trpc.auth.register.useMutation();
  const { data: meData } = trpc.auth.me.useQuery(undefined, {
    enabled: !!session && !DEMO_MODE,
    onSuccess: (data) => {
      if (data) {
        setUser({
          id: data.id,
          email: data.email,
          first_name: data.firstName || undefined,
          last_name: data.lastName || undefined,
          role: data.role as 'ADMIN' | 'CLIENT' | 'RESELLER',
          is_active: data.isActive,
        });
      }
    },
  });

  useEffect(() => {
    // If demo mode is enabled, set mock user and skip auth
    if (DEMO_MODE) {
      console.log('🎭 Demo mode enabled - bypassing authentication');
      const demoUser = createDemoUser();
      setUser(demoUser);
      setSession({
        access_token: 'demo-token',
        refresh_token: 'demo-refresh',
        expires_in: 3600,
        token_type: 'bearer',
        user: {
          id: demoUser.id,
          email: demoUser.email,
          aud: 'authenticated',
          role: 'authenticated',
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      } as Session);
      setLoading(false);
      return;
    }

    // Normal auth flow for production
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      
      if (session?.user) {
        if (event === 'SIGNED_IN') {
          await auditLogger.logAuth('login', session.user.id);
          await emitEvent('user.loggedIn', { user: session.user }, {
            entityType: 'user',
            entityId: session.user.id,
            userId: session.user.id,
          });
          
          // Invalidate queries to refetch data
          utils.invalidate();
        }
      } else {
        if (event === 'SIGNED_OUT' && user) {
          await auditLogger.logAuth('logout', user.id);
          await emitEvent('user.loggedOut', { user }, {
            entityType: 'user',
            entityId: user.id,
            userId: user.id,
          });
          setUser(null);
          
          // Clear query cache on logout
          utils.invalidate();
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, userData?: { first_name?: string; last_name?: string }) => {
    if (DEMO_MODE) {
      console.log('🎭 Demo mode: Sign up simulated');
      return { data: { user: createDemoUser(), session: null }, error: null };
    }

    try {
      // Register with tRPC
      const result = await registerMutation({
        email,
        password,
        firstName: userData?.first_name,
        lastName: userData?.last_name,
      });

      return { data: result, error: null };
    } catch (error) {
      await auditLogger.logAuth('failed_login', undefined, { 
        email, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      throw error;
    }
  };

  const signIn = async (email: string, password: string) => {
    if (DEMO_MODE) {
      console.log('🎭 Demo mode: Sign in simulated');
      const demoUser = createDemoUser();
      setUser(demoUser);
      return { data: { user: demoUser, session: null }, error: null };
    }

    try {
      // Login with tRPC
      const result = await loginMutation({
        email,
        password,
      });

      setUser({
        id: result.user.id,
        email: result.user.email,
        first_name: result.user.firstName || undefined,
        last_name: result.user.lastName || undefined,
        role: result.user.role as 'ADMIN' | 'CLIENT' | 'RESELLER',
        is_active: result.user.isActive,
      });

      return { data: result, error: null };
    } catch (error) {
      throw error;
    }
  };

  const signOut = async () => {
    if (DEMO_MODE) {
      console.log('🎭 Demo mode: Sign out simulated');
      setUser(null);
      setSession(null);
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    
    // Clear user state
    setUser(null);
    setSession(null);
    
    // Clear query cache
    utils.invalidate();
  };

  const updateProfile = async (updates: { first_name?: string; last_name?: string }) => {
    if (!user) throw new Error('No user logged in');

    if (DEMO_MODE) {
      console.log('🎭 Demo mode: Profile update simulated', updates);
      const oldUser = { ...user };
      const newUser = { 
        ...user, 
        first_name: updates.first_name || user.first_name,
        last_name: updates.last_name || user.last_name
      };
      setUser(newUser);
      
      // Log the change even in demo mode
      await auditLogger.logDataChange('update', 'user', user.id, oldUser, newUser, user.id);
      
      return newUser;
    }

    const { data, error } = await utils.client.auth.updateProfile.mutate({
      firstName: updates.first_name,
      lastName: updates.last_name,
    });

    if (error) throw error;

    const newUser = { 
      ...user, 
      first_name: updates.first_name || user.first_name,
      last_name: updates.last_name || user.last_name
    };
    setUser(newUser);

    return data;
  };

  // Demo mode utilities
  const switchDemoRole = (role: 'ADMIN' | 'CLIENT' | 'RESELLER') => {
    if (DEMO_MODE && user) {
      console.log(`🎭 Demo mode: Switching to ${role} role`);
      const oldUser = { ...user };
      const newUser = { ...user, role };
      setUser(newUser);
      
      // Log role change even in demo mode
      auditLogger.logAdminAction('role_change', 'user', user.id, {
        old_role: oldUser.role,
        new_role: role,
      }, user.id);
    }
  };

  const isDemoMode = DEMO_MODE;

  return {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut,
    updateProfile,
    switchDemoRole,
    isDemoMode,
  };
}