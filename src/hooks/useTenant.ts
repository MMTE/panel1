import { useState, useEffect } from 'react';
import { tenantManager, type Tenant } from '../lib/tenant/TenantManager';
import { useAuth } from './useAuth';

export function useTenant() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const initializeTenant = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        // In a real implementation, this would:
        // 1. Extract tenant from subdomain/domain
        // 2. Or get user's default tenant
        // 3. Or use tenant from JWT claims
        
        // For now, use default tenant
        const defaultTenant = await tenantManager.getTenant('00000000-0000-0000-0000-000000000000');
        
        if (defaultTenant) {
          tenantManager.setCurrentTenant(defaultTenant);
          setTenant(defaultTenant);
        }
      } catch (error) {
        console.error('Error initializing tenant:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeTenant();
  }, [user]);

  const switchTenant = async (tenantId: string) => {
    try {
      const newTenant = await tenantManager.getTenant(tenantId);
      if (newTenant) {
        tenantManager.setCurrentTenant(newTenant);
        setTenant(newTenant);
      }
    } catch (error) {
      console.error('Error switching tenant:', error);
    }
  };

  const updateTenantBranding = async (branding: Partial<Tenant['branding']>) => {
    if (!tenant) return;

    try {
      const updatedTenant = await tenantManager.updateTenant(tenant.id, { branding });
      if (updatedTenant) {
        setTenant(updatedTenant);
        tenantManager.setCurrentTenant(updatedTenant);
      }
    } catch (error) {
      console.error('Error updating tenant branding:', error);
    }
  };

  const hasFeature = (feature: string): boolean => {
    return tenantManager.hasFeature(feature);
  };

  const getBranding = () => {
    return tenantManager.getTenantBranding();
  };

  return {
    tenant,
    loading,
    switchTenant,
    updateTenantBranding,
    hasFeature,
    getBranding,
  };
}