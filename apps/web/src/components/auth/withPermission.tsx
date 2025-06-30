import React from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermissions } from '../../hooks/usePermissions';
import { ResourceContext } from '../../lib/auth/types';
import { Loader2 } from 'lucide-react';

interface WithPermissionOptions {
  permissionId: string;
  resourceContext?: ResourceContext;
  fallbackPath?: string;
  LoadingComponent?: React.ComponentType;
  UnauthorizedComponent?: React.ComponentType;
}

const DefaultLoadingComponent = () => (
  <div className="flex items-center justify-center p-4">
    <Loader2 className="h-6 w-6 animate-spin" />
  </div>
);

const DefaultUnauthorizedComponent = () => (
  <div className="flex items-center justify-center p-4 text-red-500">
    You do not have permission to access this resource.
  </div>
);

export function withPermission<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options: WithPermissionOptions
) {
  return function WithPermissionComponent(props: P) {
    const navigate = useNavigate();
    const { can, loading } = usePermissions();
    
    const {
      permissionId,
      fallbackPath = '/unauthorized',
      LoadingComponent = DefaultLoadingComponent,
      UnauthorizedComponent = DefaultUnauthorizedComponent
    } = options;

    if (loading) {
      return <LoadingComponent />;
    }

    const hasAccess = can(permissionId);
    
    if (!hasAccess) {
      if (fallbackPath) {
        navigate(fallbackPath);
      }
      return <UnauthorizedComponent />;
    }

    return <WrappedComponent {...props} />;
  };
}

// Example usage:
// const ProtectedComponent = withPermission(MyComponent, {
//   permissionId: 'admin.access',
//   fallbackPath: '/dashboard'
// }); 