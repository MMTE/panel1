import { useState, useEffect } from 'react';
import { tenantManager, type Tenant } from '../lib/tenant/TenantManager';
import { useAuth } from './useAuth';
import { trpc } from '../api/trpc';

export function useTenant() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, isDemoMode } = useAuth();
  
  const { data: tenantData, isLoading: isTenantLoading } = trpc.tenants.getCurrent.useQuery(undefined, {
    enabled: !!user && !isDemoMode,
    onSuccess: (data) => {
      if (data) {
        tenantManager.setCurrentTenant(data);
        setTenant(data);
      }
      setLoading(false);
    },
    onError: () => {
      setLoading(false);
    }
  });

  useEffect(() => {
    if (isDemoMode) {
      // For demo mode, use default tenant
      const defaultTenant: Tenant = {
        id: '00000000-0000-0000-0000-000000000000',
        name: 'Demo Tenant',
        slug: 'demo',
        settings: {
          features: {
            plugins: true,
            multi_currency: true,
            custom_branding: true
          }
        },
        branding: {
          primary_color: '#7c3aed',
          company_name: 'Panel1 Demo'
        },
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      tenantManager.setCurrentTenant(defaultTenant);
      setTenant(defaultTenant);
      setLoading(false);
    }
  }, [isDemoMode]);

  const switchTenant = async (tenantId: string) => {
    if (isDemoMode) {
      console.log('🎭 Demo mode: Tenant switch simulated');
      return;
    }
    
    try {
      setLoading(true);
      const { data } = await trpc.client.tenants.getById.query({ id: tenantId });
      
      if (data) {
        tenantManager.setCurrentTenant(data);
        setTenant(data);
      }
    } catch (error) {
      console.error('Error switching tenant:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateTenantBranding = async (branding: Partial<Tenant['branding']>) => {
    if (!tenant) return;

    if (isDemoMode) {
      console.log('🎭 Demo mode: Tenant branding update simulated', branding);
      const updatedTenant = {
        ...tenant,
        branding: {
          ...tenant.branding,
          ...branding
        }
      };
      tenantManager.setCurrentTenant(updatedTenant);
      setTenant(updatedTenant);
      return;
    }

    try {
      const result = await trpc.client.tenants.update.mutate({
        id: tenant.id,
        branding,
      });
      
      if (result) {
        tenantManager.setCurrentTenant(result);
        setTenant(result);
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
    loading: loading || isTenantLoading,
    switchTenant,
    updateTenantBranding,
    hasFeature,
    getBranding,
  };
}