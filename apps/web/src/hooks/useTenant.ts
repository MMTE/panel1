import { useState, useEffect } from 'react';
import { tenantManager, type Tenant } from '../lib/tenant/TenantManager';
import { useAuth } from './useAuth';
import { trpc } from '../api/trpc';

export function useTenant() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  // Get current tenant using tRPC
  const { data: currentTenant, isLoading: isLoadingTenant, error: tenantError } = trpc.tenants.getCurrent.useQuery(undefined, {
    enabled: !!user, // Only run if user is logged in
    retry: 3, // Retry 3 times before giving up
    retryDelay: 1000, // Wait 1 second between retries
  });

  useEffect(() => {
    if (isLoadingTenant) {
      setLoading(true);
      setError(null);
      return;
    }

    if (tenantError) {
      console.error('Failed to load tenant:', tenantError);
      setError('Failed to load tenant data');
      setLoading(false);
      return;
    }

    if (currentTenant) {
      // Transform the tRPC tenant data to match our Tenant interface
      const transformedTenant: Tenant = {
        id: currentTenant.id,
        name: currentTenant.name,
        slug: currentTenant.slug,
        domain: currentTenant.domain || undefined,
        settings: currentTenant.settings || {
          features: {
            plugins: true,
            multi_currency: true,
            custom_branding: true,
          },
          limits: {
            max_users: 1000,
            max_clients: 10000,
            max_storage: 100000,
          },
        },
        branding: currentTenant.branding || {
          primary_color: '#8B5CF6',
          secondary_color: '#EC4899',
          logo_url: '/logo.png',
          company_name: 'Panel1 Demo',
          favicon_url: '/favicon.ico',
          custom_css: '',
        },
        is_active: currentTenant.isActive,
        created_at: typeof currentTenant.createdAt === 'string' ? currentTenant.createdAt : currentTenant.createdAt.toISOString(),
        updated_at: typeof currentTenant.updatedAt === 'string' ? currentTenant.updatedAt : currentTenant.updatedAt.toISOString(),
      };

      tenantManager.setCurrentTenant(transformedTenant);
      setTenant(transformedTenant);
      setError(null);
      setLoading(false);
    } else if (!user) {
      // No user, use default tenant for demo/fallback
      const defaultTenant = tenantManager.getCurrentTenant();
      setTenant(defaultTenant);
      setError(null);
      setLoading(false);
    } else {
      // User exists but no tenant found - this shouldn't happen in normal flow
      console.warn('User exists but no tenant found - falling back to default tenant');
      const defaultTenant = tenantManager.getCurrentTenant();
      setTenant(defaultTenant);
      setError('No tenant found for user');
      setLoading(false);
    }
  }, [currentTenant, isLoadingTenant, tenantError, user]);

  const switchTenant = async (tenantId: string) => {
    try {
      setLoading(true);
      setError(null);
      // For now, just get the current tenant as switching isn't fully implemented
      // In a real multi-tenant scenario, this would involve switching context
      console.log('TODO: Implement tenant switching for:', tenantId);
    } catch (error) {
      console.error('Error switching tenant:', error);
      setError('Failed to switch tenant');
    } finally {
      setLoading(false);
    }
  };

  const updateTenantBranding = async (branding: Partial<Tenant['branding']>) => {
    if (!tenant) return;

    try {
      setLoading(true);
      setError(null);
      const updatedTenant = await tenantManager.updateTenant(tenant.id, { branding });
      if (updatedTenant) {
        setTenant(updatedTenant);
        tenantManager.setCurrentTenant(updatedTenant);
      }
    } catch (error) {
      console.error('Error updating tenant branding:', error);
      setError('Failed to update tenant branding');
    } finally {
      setLoading(false);
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
    error,
    switchTenant,
    updateTenantBranding,
    hasFeature,
    getBranding,
  };
}