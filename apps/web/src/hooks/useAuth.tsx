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

interface AuthContextType {
  user: AuthUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, userData?: { firstName?: string; lastName?: string }) => Promise<void>;
  signOut: () => void;
  loading: boolean;
  impersonateUser: (userId: string) => Promise<void>;
  updateProfile: (updates: { firstName?: string; lastName?: string }) => Promise<void>;
  switchDemoProfile: (profile: any) => void;
  switchDemoRole: (role: 'ADMIN' | 'CLIENT' | 'RESELLER') => void;
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
  const impersonateMutation = trpc.auth.devImpersonate.useMutation();

  // Get current user - real API only
  const { data: currentUser, isLoading: userLoading, refetch } = trpc.auth.me.useQuery(undefined, {
    enabled: !!getStoredToken(),
    retry: 1,
  });

  useEffect(() => {
    if (currentUser) {
      setUser(currentUser);
      setLoading(false);
    } else if (!userLoading && !getStoredToken()) {
      // No token and not loading - user is not authenticated
      setUser(null);
      setLoading(false);
    } else {
      setLoading(userLoading);
    }
  }, [currentUser, userLoading]);

  const signIn = async (email: string, password: string) => {
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
      await auditLogger.logAuth('failed_login', undefined, { email, error: error instanceof Error ? error.message : 'Unknown error', type: 'registration' });
      throw error;
    }
  };

  const signOut = async () => {
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

  const impersonateUser = async (userId: string) => {
    // In development mode, allow impersonation without admin check
    const isDevelopment = import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true';
    
    if (!isDevelopment && (!user || user.role !== 'ADMIN')) {
      throw new Error('Only administrators can impersonate users');
    }

    try {
      const result = await impersonateMutation.mutateAsync({ userId });
      
      // Store the impersonation token
      try {
        localStorage.setItem('auth_token', result.token);
      } catch (storageError) {
        console.warn('Failed to store impersonation token:', storageError);
      }
      
      setUser(result.user);
      await refetch();

      const currentUserId = user?.id || 'dev-user';
      await auditLogger.logAuth('impersonate', currentUserId, { targetUserId: userId });
      await emitEvent('user.impersonated', { 
        originalUser: user, 
        targetUser: result.user 
      }, {
        entityType: 'user',
        entityId: userId,
        userId: currentUserId,
      });
    } catch (error) {
      const currentUserId = user?.id || 'dev-user';
      await auditLogger.logAuth('failed_impersonate', currentUserId, { targetUserId: userId, error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  };

  const switchDemoProfile = (profile: any) => {
    // For demo/development mode - directly set user without authentication
    const demoUser: AuthUser = {
      id: profile.id,
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      role: profile.role,
      tenantId: profile.tenantId,
    };
    
    setUser(demoUser);
    console.log(`🔄 Switched to demo profile: ${profile.firstName} ${profile.lastName} (${profile.role})`);
  };

  const switchDemoRole = (role: 'ADMIN' | 'CLIENT' | 'RESELLER') => {
    if (user) {
      const updatedUser: AuthUser = {
        ...user,
        role: role,
      };
      setUser(updatedUser);
      console.log(`🔄 Switched demo role to: ${role}`);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      signIn,
      signUp,
      signOut,
      loading,
      impersonateUser,
      updateProfile,
      switchDemoProfile,
      switchDemoRole,
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
  try {
    return localStorage.getItem('auth_token');
  } catch {
    return null;
  }
}

export function useAuthStatus() {
  const { user, loading } = useAuth();
  return {
    isAuthenticated: !!user,
    isLoading: loading,
    user,
  };
}