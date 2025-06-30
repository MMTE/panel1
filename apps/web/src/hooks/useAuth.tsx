import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { trpc } from '../api/trpc';
import { auditLogger } from '../lib/audit/AuditLogger';
import { emitEvent } from '../lib/events/EventEmitter';

// Role-based permissions mapping (same as in DevBottomBar)
const rolePermissions = {
  ADMIN: [
    'client.create', 'client.read', 'client.update', 'client.delete',
    'user.create', 'user.read', 'user.update', 'user.delete',
    'invoice.create', 'invoice.read', 'invoice.update', 'invoice.delete', 'invoice.process_payment',
    'payment.create', 'payment.read', 'payment.read_sensitive', 'payment.refund',
    'subscription.create', 'subscription.read', 'subscription.update', 'subscription.cancel',
    'support_ticket.create', 'support_ticket.read', 'support_ticket.update', 'support_ticket.assign',
    'domain.create', 'domain.read', 'domain.update', 'domain.delete',
    'ssl_certificate.create', 'ssl_certificate.read', 'ssl_certificate.update', 'ssl_certificate.delete',
    'system_settings.read', 'system_settings.update',
    'audit_log.read',
    'report.read', 'analytics.read',
    'server.read', 'tenant.read',
  ],
  CLIENT: [
    'client.read_own',
    'invoice.read_own', 'invoice.process_payment',
    'subscription.read_own', 'subscription.cancel_own',
    'support_ticket.create', 'support_ticket.read_own',
    'domain.read_own',
    'ssl_certificate.read_own',
  ],
  RESELLER: [
    'client.create', 'client.read', 'client.update',
    'invoice.read',
    'subscription.read',
    'support_ticket.create', 'support_ticket.read',
    'domain.create', 'domain.read', 'domain.update',
    'ssl_certificate.create', 'ssl_certificate.read',
  ],
};

export interface AuthUser {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'SUPPORT_AGENT' | 'BILLING_AGENT' | 'RESELLER' | 'CLIENT' | 'CLIENT_USER';
  tenantId?: string | null;
  permissions?: string[];
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
  hasPermission: (permissionId: string) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const signInMutation = trpc.auth.signIn.useMutation();
  const signUpMutation = trpc.auth.signUp.useMutation();
  const impersonateMutation = trpc.auth.impersonate.useMutation();
  const updateProfileMutation = trpc.auth.updateProfile.useMutation();
  const { refetch } = trpc.auth.me.useQuery(undefined, {
    enabled: false,
  });

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        if (token) {
          const result = await refetch();
          if (result.data) {
            setUser(result.data);
          } else {
            // If there's a token but we can't get a user, the token is likely invalid.
            // Sign out to clear the bad token and user state.
            await signOut();
          }
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        // Also sign out on any other error during auth check
        await signOut();
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [refetch]);

  const signIn = async (email: string, password: string) => {
    try {
      const result = await signInMutation.mutateAsync({ email, password });
      
      try {
        localStorage.setItem('auth_token', result.token);
      } catch (storageError) {
        console.warn('Failed to store auth token:', storageError);
      }
      
      setUser(result.user);
      await refetch();

      await auditLogger.logAuth('sign_in', result.user.id);
      await emitEvent('user.signed_in', { user: result.user }, {
        entityType: 'user',
        entityId: result.user.id,
        userId: result.user.id,
      });
    } catch (error) {
      await auditLogger.logAuth('failed_sign_in', 'anonymous', { email, error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  };

  const signUp = async (email: string, password: string, userData?: { firstName?: string; lastName?: string }) => {
    try {
      const result = await signUpMutation.mutateAsync({ email, password, ...userData });
      
      try {
        localStorage.setItem('auth_token', result.token);
      } catch (storageError) {
        console.warn('Failed to store auth token:', storageError);
      }
      
      setUser(result.user);
      await refetch();

      await auditLogger.logAuth('sign_up', result.user.id);
      await emitEvent('user.signed_up', { user: result.user }, {
        entityType: 'user',
        entityId: result.user.id,
        userId: result.user.id,
      });
    } catch (error) {
      await auditLogger.logAuth('failed_sign_up', 'anonymous', { email, error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  };

  const signOut = async () => {
    const userId = user?.id || 'anonymous';
    try {
      localStorage.removeItem('auth_token');
      setUser(null);

      await auditLogger.logAuth('sign_out', userId);
      await emitEvent('user.signed_out', { user }, {
        entityType: 'user',
        entityId: userId,
        userId,
      });
    } catch (error) {
      await auditLogger.logAuth('failed_sign_out', userId, { error: error instanceof Error ? error.message : 'Unknown error' });
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

  const updateProfile = async (updates: { firstName?: string; lastName?: string }) => {
    if (!user) throw new Error('No user logged in');

    try {
      const result = await updateProfileMutation.mutateAsync(updates);
      setUser(result);
      await refetch();

      await auditLogger.logAuth('profile_updated', user.id, updates);
      await emitEvent('user.profile_updated', { user: result, updates }, {
        entityType: 'user',
        entityId: user.id,
        userId: user.id,
      });
    } catch (error) {
      await auditLogger.logAuth('failed_profile_update', user.id, { updates, error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  };

  const switchDemoProfile = async (profile: any) => {
    if (!profile || !profile.id) {
      console.error('Invalid profile for demo switch:', profile);
      return;
    }
    
    console.log(`🔄 Switching to demo profile: ${profile.firstName} ${profile.lastName} (${profile.role})`);
    try {
      await impersonateUser(profile.id);
      console.log(`✅ Successfully switched to demo profile: ${profile.firstName} ${profile.lastName}`);
    } catch (error) {
      console.error(`❌ Failed to switch to demo profile ${profile.firstName}:`, error);
      // If impersonation fails, sign out to ensure a clean state
      await signOut();
    }
  };

  const switchDemoRole = (role: 'ADMIN' | 'CLIENT' | 'RESELLER') => {
    if (user) {
      const updatedUser: AuthUser = {
        ...user,
        role: role,
        permissions: rolePermissions[role],
      };
      setUser(updatedUser);
      console.log(`🔄 Switched demo role to: ${role}`);
    }
  };

  const hasPermission = (permissionId: string): boolean => {
    if (!user) return false;
    
    // In development mode or demo mode, be more permissive
    const isDevelopment = import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true';
    if (isDevelopment && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')) {
      return true;
    }
    
    // Use database permissions if available, otherwise fall back to hardcoded role permissions
    if (user.permissions && Array.isArray(user.permissions)) {
      return user.permissions.includes(permissionId);
    }
    
    // Fallback to hardcoded role permissions for backward compatibility
    const userPermissions = rolePermissions[user.role as keyof typeof rolePermissions] || [];
    return userPermissions.includes(permissionId);
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
      hasPermission,
    }}>
      {children}
    </AuthContext.Provider>
  );
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