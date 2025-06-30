import { useState, useEffect, useContext, createContext, ReactNode } from 'react';
import { trpc } from '../api/trpc';
import { useAuth } from './useAuth';

interface Permission {
  id: string;
  name: string;
  description: string;
  resource: string;
  action: string;
}

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
}

interface User {
  id: string;
  email: string;
  roles: Role[];
}

interface PermissionsContextValue {
  permissions: Permission[];
  userPermissions: Set<string>;
  can: (permission: string) => boolean;
  hasRole: (roleName: string) => boolean;
  loading: boolean;
  error: Error | null;
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

export const PermissionsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [userPermissions, setUserPermissions] = useState<Set<string>>(new Set());
  const [permissions, setPermissions] = useState<Permission[]>([]);

  // Fetch user permissions
  const { 
    data: userWithPermissions, 
    isLoading: permissionsLoading, 
    error,
    refetch
  } = trpc.auth.me.useQuery(
    undefined,
    { 
      enabled: isAuthenticated && !!user,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    }
  );

  // Update user permissions when data changes
  useEffect(() => {
    if (userWithPermissions) {
      const permissionSet = new Set<string>();
      
      // Add permissions from the user object
      if (userWithPermissions.permissions) {
        userWithPermissions.permissions.forEach(permission => {
          permissionSet.add(permission);
        });
      }

      setUserPermissions(permissionSet);
      
      // For now, we don't have detailed permission objects, just IDs
      setPermissions([]);
    }
  }, [userWithPermissions]);

  const can = (permission: string): boolean => {
    // In development mode or demo mode, be more permissive for admin users
    const isDevelopment = import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true';
    if (isDevelopment && user && (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')) {
      return true;
    }
    
    return userPermissions.has(permission);
  };

  const hasRole = (roleName: string): boolean => {
    return user?.role === roleName;
  };

  const value: PermissionsContextValue = {
    permissions,
    userPermissions,
    can,
    hasRole,
    loading: permissionsLoading,
    error: error || null,
  };

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
};

export const usePermissions = () => {
  const context = useContext(PermissionsContext);
  if (!context) {
    throw new Error('usePermissions must be used within a PermissionsProvider');
  }
  return context;
};

// Convenience hooks for common permission checks
export const useCanAccess = (permission: string): boolean => {
  const { can, loading } = usePermissions();
  return !loading && can(permission);
};

export const useHasRole = (roleName: string): boolean => {
  const { hasRole, loading } = usePermissions();
  return !loading && hasRole(roleName);
};

// Component wrapper for conditional rendering based on permissions
interface CanProps {
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
}

export const Can: React.FC<CanProps> = ({ permission, children, fallback = null }) => {
  const { can, loading } = usePermissions();
  
  if (loading) {
    return <div className="animate-pulse bg-gray-200 h-8 w-24 rounded"></div>;
  }
  
  return can(permission) ? <>{children}</> : <>{fallback}</>;
}; 