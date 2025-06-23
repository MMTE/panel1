import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { trpc } from '../api/trpc';
import { auditLogger } from '../lib/audit/AuditLogger';
import { emitEvent } from '../lib/events/EventEmitter';

export interface AuthUser {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role: 'ADMIN' | 'CLIENT' | 'RESELLER';
  tenantId?: string | null;
}

// Demo mode configuration
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
const DEMO_USER_ROLE = import.meta.env.VITE_DEMO_USER_ROLE || 'ADMIN';

// Mock demo user data
const createDemoUser = (role: string = DEMO_USER_ROLE): AuthUser => ({
  id: 'demo-user-id',
  email: 'demo@panel1.dev',
  firstName: 'Demo',
  lastName: 'User',
  role: role as 'ADMIN' | 'CLIENT' | 'RESELLER',
  tenantId: 'demo-tenant-id',
});

interface AuthContextType {
  user: AuthUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, userData?: { firstName?: string; lastName?: string }) => Promise<void>;
  signOut: () => void;
  loading: boolean;
  switchDemoRole: (role: 'ADMIN' | 'CLIENT' | 'RESELLER') => void;
  updateProfile: (updates: { firstName?: string; lastName?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // tRPC mutations
  const loginMutation = trpc.auth.login.useMutation();
  const registerMutation = trpc.auth.register.useMutation();
  const logoutMutation = trpc.auth.logout.useMutation();
  const updateProfileMutation = trpc.auth.updateProfile.useMutation();

  // Get current user
  const { data: currentUser, isLoading: userLoading, refetch } = trpc.auth.me.useQuery(undefined, {
    enabled: !!getStoredToken() && !DEMO_MODE,
    retry: false,
    onError: () => {
      if (!DEMO_MODE) {
        localStorage.removeItem('auth_token');
        setUser(null);
      }
    },
  });

  useEffect(() => {
    // If demo mode is enabled, set mock user and skip auth
    if (DEMO_MODE) {
      console.log('🎭 Demo mode enabled - bypassing authentication');
      const demoUser = createDemoUser();
      setUser(demoUser);
      setLoading(false);
      return;
    }

    if (currentUser) {
      setUser(currentUser);
    }
    setLoading(userLoading);
  }, [currentUser, userLoading]);

  const signIn = async (email: string, password: string) => {
    if (DEMO_MODE) {
      console.log('🎭 Demo mode: Sign in simulated');
      const demoUser = createDemoUser();
      setUser(demoUser);
      
      // Log demo authentication events
      await auditLogger.logAuth('login', 'demo-user-id');
      await emitEvent('user.loggedIn', { user: demoUser }, {
        entityType: 'user',
        entityId: 'demo-user-id',
        userId: 'demo-user-id',
      });
      
      return;
    }

    try {
      const result = await loginMutation.mutateAsync({ email, password });
      try {
        localStorage.setItem('auth_token', result.token);
      } catch (storageError) {
        console.warn('Failed to store auth token:', storageError);
      }
      setUser(result.user);

      // Log authentication events
      await auditLogger.logAuth('login', result.user.id);
      await emitEvent('user.loggedIn', { user: result.user }, {
        entityType: 'user',
        entityId: result.user.id,
        userId: result.user.id,
      });
    } catch (error) {
      await auditLogger.logAuth('failed_login', undefined, { email, error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  };

  const signUp = async (email: string, password: string, userData?: { firstName?: string; lastName?: string }) => {
    if (DEMO_MODE) {
      console.log('🎭 Demo mode: Sign up simulated');
      const demoUser = createDemoUser();
      setUser(demoUser);
      return;
    }

    try {
      const result = await registerMutation.mutateAsync({ 
        email, 
        password, 
        firstName: userData?.firstName, 
        lastName: userData?.lastName 
      });
      try {
        localStorage.setItem('auth_token', result.token);
      } catch (storageError) {
        console.warn('Failed to store auth token:', storageError);
      }
      setUser(result.user);

      // Log user creation
      await auditLogger.logDataChange('create', 'user', result.user.id, null, {
        email,
        firstName: userData?.firstName,
        lastName: userData?.lastName,
      });

      await emitEvent('user.created', {
        user: result.user
      }, {
        entityType: 'user',
        entityId: result.user.id,
      });
    } catch (error) {
      await auditLogger.logAuth('failed_registration', undefined, { email, error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  };

  const signOut = async () => {
    if (DEMO_MODE) {
      console.log('🎭 Demo mode: Sign out simulated');
      if (user) {
        await auditLogger.logAuth('logout', user.id);
        await emitEvent('user.loggedOut', { user }, {
          entityType: 'user',
          entityId: user.id,
          userId: user.id,
        });
      }
      setUser(null);
      return;
    }

    if (user) {
      await auditLogger.logAuth('logout', user.id);
      await emitEvent('user.loggedOut', { user }, {
        entityType: 'user',
        entityId: user.id,
        userId: user.id,
      });
    }

    try {
      localStorage.removeItem('auth_token');
    } catch (storageError) {
      console.warn('Failed to remove auth token:', storageError);
    }
    setUser(null);
    // Optionally call logout mutation to clean up server-side session
    logoutMutation.mutate();
  };

  const updateProfile = async (updates: { firstName?: string; lastName?: string }) => {
    if (DEMO_MODE) {
      console.log('🎭 Demo mode: Profile update simulated');
      if (user) {
        const updatedUser = { ...user, ...updates };
        setUser(updatedUser);
        
        await auditLogger.logDataChange('update', 'user', user.id, user, updatedUser);
        await emitEvent('user.profileUpdated', { user: updatedUser }, {
          entityType: 'user',
          entityId: user.id,
          userId: user.id,
        });
      }
      return;
    }

    if (!user) {
      throw new Error('No user logged in');
    }

    try {
      const updatedUser = await updateProfileMutation.mutateAsync(updates);
      setUser(updatedUser);
      await refetch();

      await auditLogger.logDataChange('update', 'user', user.id, user, updatedUser);
      await emitEvent('user.profileUpdated', { user: updatedUser }, {
        entityType: 'user',
        entityId: user.id,
        userId: user.id,
      });
    } catch (error) {
      throw error;
    }
  };

  const switchDemoRole = (role: 'ADMIN' | 'CLIENT' | 'RESELLER') => {
    if (!DEMO_MODE) {
      console.warn('switchDemoRole called outside of demo mode');
      return;
    }

    console.log(`🎭 Demo mode: Switching role to ${role}`);
    const newDemoUser = createDemoUser(role);
    setUser(newDemoUser);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      signIn, 
      signUp, 
      signOut, 
      loading,
      switchDemoRole,
      updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem('auth_token');
  } catch (error) {
    console.warn('Failed to access localStorage:', error);
    return null;
  }
}

// Simple hook for components that need auth status without context
export function useAuthStatus() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (DEMO_MODE) {
      const demoUser = createDemoUser();
      setUser(demoUser);
      setLoading(false);
      return;
    }

    const token = getStoredToken();
    if (!token) {
      setLoading(false);
      return;
    }

    // This would need to be implemented differently since we can't use the hook here
    // For now, just check if token exists
    setLoading(false);
  }, []);

  return { user, loading };
}