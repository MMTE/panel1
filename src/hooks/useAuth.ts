import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { auditLogger } from '../lib/audit/AuditLogger';
import { emitEvent } from '../lib/events/EventEmitter';
import type { User, Session } from '@supabase/supabase-js';

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
      if (session?.user) {
        fetchUserProfile(session.user);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      if (session?.user) {
        await fetchUserProfile(session.user);
        
        // Log authentication events
        if (event === 'SIGNED_IN') {
          await auditLogger.logAuth('login', DEMO_MODE ? null : session.user.id);
          await emitEvent('user.loggedIn', { user: session.user }, {
            entityType: 'user',
            entityId: DEMO_MODE ? null : session.user.id,
            userId: DEMO_MODE ? null : session.user.id,
          });
        }
      } else {
        if (event === 'SIGNED_OUT' && user) {
          await auditLogger.logAuth('logout', DEMO_MODE ? null : user.id);
          await emitEvent('user.loggedOut', { user }, {
            entityType: 'user',
            entityId: DEMO_MODE ? null : user.id,
            userId: DEMO_MODE ? null : user.id,
          });
        }
        setUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserProfile = async (authUser: User) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('auth_user_id', authUser.id)
        .single();

      if (error) {
        console.error('Error fetching user profile:', error);
        setUser(null);
      } else if (data) {
        const userProfile = {
          id: data.id,
          email: data.email,
          first_name: data.first_name,
          last_name: data.last_name,
          role: data.role,
          is_active: data.is_active,
        };
        setUser(userProfile);
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, userData?: { first_name?: string; last_name?: string }) => {
    if (DEMO_MODE) {
      console.log('🎭 Demo mode: Sign up simulated');
      return { data: { user: createDemoUser(), session: null }, error: null };
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      // Create user profile if signup was successful
      if (data.user) {
        const { error: profileError } = await supabase
          .from('users')
          .insert({
            auth_user_id: data.user.id,
            email,
            first_name: userData?.first_name,
            last_name: userData?.last_name,
          });

        if (profileError) {
          console.error('Error creating user profile:', profileError);
        } else {
          // Log user creation
          await auditLogger.logDataChange('create', 'user', data.user.id, null, {
            email,
            first_name: userData?.first_name,
            last_name: userData?.last_name,
          });

          await emitEvent('user.created', {
            user: { id: data.user.id, email, ...userData }
          }, {
            entityType: 'user',
            entityId: data.user.id,
          });
        }
      }

      return data;
    } catch (error) {
      await auditLogger.logAuth('failed_login', undefined, { email, error: error instanceof Error ? error.message : 'Unknown error' });
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
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        await auditLogger.logAuth('failed_login', undefined, { email, error: error.message });
        throw error;
      }

      return data;
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
  };

  const updateProfile = async (updates: { first_name?: string; last_name?: string }) => {
    if (!user) throw new Error('No user logged in');

    if (DEMO_MODE) {
      console.log('🎭 Demo mode: Profile update simulated', updates);
      const oldUser = { ...user };
      const newUser = { ...user, ...updates };
      setUser(newUser);
      
      // Log the change even in demo mode, but with null user ID
      await auditLogger.logDataChange('update', 'user', null, oldUser, newUser, null);
      
      return newUser;
    }

    const oldValues = { ...user };

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single();

    if (error) throw error;

    const newUser = { ...user, ...updates };
    setUser(newUser);

    // Log the profile update
    await auditLogger.logDataChange('update', 'user', user.id, oldValues, newUser, user.id);
    
    await emitEvent('user.updated', {
      user: newUser,
      oldValues,
      newValues: updates,
    }, {
      entityType: 'user',
      entityId: user.id,
      userId: user.id,
    });

    return data;
  };

  // Demo mode utilities
  const switchDemoRole = (role: 'ADMIN' | 'CLIENT' | 'RESELLER') => {
    if (DEMO_MODE && user) {
      console.log(`🎭 Demo mode: Switching to ${role} role`);
      const oldUser = { ...user };
      const newUser = { ...user, role };
      setUser(newUser);
      
      // Log role change even in demo mode, but with null user ID
      auditLogger.logAdminAction('role_change', 'user', null, {
        old_role: oldUser.role,
        new_role: role,
      }, null);
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