import React from 'react';
import { usePermissions } from '../../hooks/usePermissions';

interface CanProps {
  permissionId: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * A component that conditionally renders its children based on user permissions
 * 
 * @example
 * ```tsx
 * <Can permissionId="invoice.create">
 *   <button>Create Invoice</button>
 * </Can>
 * 
 * <Can permissionId="client.delete" fallback={<p>You don't have permission to delete clients</p>}>
 *   <button>Delete Client</button>
 * </Can>
 * ```
 */
export function Can({ permissionId, children, fallback = null }: CanProps) {
  const { can, loading } = usePermissions();

  if (loading) {
    return null;
  }

  if (!can(permissionId)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

/**
 * A hook for checking permissions in custom components
 * 
 * @example
 * ```tsx
 * const { can } = usePermissions();
 * 
 * if (can('invoice.create')) {
 *   // Do something
 * }
 * ```
 */
export function usePermissions() {
  const { hasPermission } = useAuth();

  return {
    can: hasPermission,
  };
} 