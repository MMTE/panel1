import { useMemo } from 'react';
import { usePermissions } from './usePermissions';

interface MenuItem {
  id: string;
  label: string;
  path?: string;
  icon?: React.ComponentType<{ className?: string }>;
  items?: MenuItem[];
  requiredPermission?: string;
}

interface UseNavigationProps {
  navigation: MenuItem[];
}

/**
 * Hook for managing permission-based navigation
 * 
 * @example
 * ```tsx
 * const { filteredNavigation } = useNavigation({
 *   navigation: [
 *     {
 *       id: 'invoices',
 *       label: 'Invoices',
 *       path: '/invoices',
 *       requiredPermission: 'invoice.read'
 *     }
 *   ]
 * });
 * ```
 */
export function useNavigation({ navigation }: UseNavigationProps) {
  const { can } = usePermissions();

  const filterMenuItems = async (items: MenuItem[]): Promise<MenuItem[]> => {
    const filteredItems = [];

    for (const item of items) {
      // Check if the item has a permission requirement
      if (item.requiredPermission) {
        const hasAccess = can(item.requiredPermission);
        if (!hasAccess) continue;
      }

      // If the item has subitems, filter them recursively
      if (item.items) {
        const filteredSubItems = await filterMenuItems(item.items);
        
        // Only include the parent item if it has visible subitems
        if (filteredSubItems.length > 0) {
          filteredItems.push({
            ...item,
            items: filteredSubItems
          });
        }
      } else {
        // Include items without subitems that passed the permission check
        filteredItems.push(item);
      }
    }

    return filteredItems;
  };

  const filteredNavigation = useMemo(async () => {
    return await filterMenuItems(navigation);
  }, [navigation, can]);

  return {
    filteredNavigation
  };
} 