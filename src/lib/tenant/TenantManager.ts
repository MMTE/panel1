// import { supabase } from '../supabase'; // TODO: Replace with tRPC

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  settings: {
    features?: {
      plugins?: boolean;
      multi_currency?: boolean;
      custom_branding?: boolean;
    };
    limits?: {
      max_users?: number;
      max_clients?: number;
      max_storage?: number;
    };
  };
  branding: {
    primary_color?: string;
    secondary_color?: string;
    logo_url?: string;
    company_name?: string;
    favicon_url?: string;
    custom_css?: string;
  };
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TenantUser {
  id: string;
  tenant_id: string;
  user_id: string;
  role: 'ADMIN' | 'CLIENT' | 'RESELLER';
  is_active: boolean;
  created_at: string;
}

/**
 * Manages multi-tenant functionality
 */
export class TenantManager {
  private static instance: TenantManager;
  private currentTenant: Tenant | null = null;

  private constructor() {}

  static getInstance(): TenantManager {
    if (!TenantManager.instance) {
      TenantManager.instance = new TenantManager();
    }
    return TenantManager.instance;
  }

  /**
   * Get current tenant from context
   */
  getCurrentTenant(): Tenant | null {
    return this.currentTenant;
  }

  /**
   * Set current tenant
   */
  setCurrentTenant(tenant: Tenant): void {
    this.currentTenant = tenant;
  }

  /**
   * Get tenant by ID
   */
  async getTenant(tenantId: string): Promise<Tenant | null> {
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', tenantId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching tenant:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error fetching tenant:', error);
      return null;
    }
  }

  /**
   * Get tenant by slug or domain
   */
  async getTenantBySlugOrDomain(identifier: string): Promise<Tenant | null> {
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .or(`slug.eq.${identifier},domain.eq.${identifier}`)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        console.error('Error fetching tenant by identifier:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error fetching tenant by identifier:', error);
      return null;
    }
  }

  /**
   * Create a new tenant
   */
  async createTenant(tenantData: {
    name: string;
    slug: string;
    domain?: string;
    settings?: Tenant['settings'];
    branding?: Tenant['branding'];
  }): Promise<Tenant | null> {
    try {
      const { data, error } = await supabase
        .from('tenants')
        .insert({
          name: tenantData.name,
          slug: tenantData.slug,
          domain: tenantData.domain,
          settings: tenantData.settings || {},
          branding: tenantData.branding || {},
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating tenant:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error creating tenant:', error);
      return null;
    }
  }

  /**
   * Update tenant settings
   */
  async updateTenant(
    tenantId: string,
    updates: Partial<Pick<Tenant, 'name' | 'domain' | 'settings' | 'branding' | 'is_active'>>
  ): Promise<Tenant | null> {
    try {
      const { data, error } = await supabase
        .from('tenants')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tenantId)
        .select()
        .single();

      if (error) {
        console.error('Error updating tenant:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error updating tenant:', error);
      return null;
    }
  }

  /**
   * Get user's tenants
   */
  async getUserTenants(userId: string): Promise<TenantUser[]> {
    try {
      const { data, error } = await supabase
        .from('tenant_users')
        .select(`
          *,
          tenants!inner(*)
        `)
        .eq('user_id', userId)
        .eq('is_active', true);

      if (error) {
        console.error('Error fetching user tenants:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching user tenants:', error);
      return [];
    }
  }

  /**
   * Add user to tenant
   */
  async addUserToTenant(
    tenantId: string,
    userId: string,
    role: 'ADMIN' | 'CLIENT' | 'RESELLER' = 'CLIENT'
  ): Promise<TenantUser | null> {
    try {
      const { data, error } = await supabase
        .from('tenant_users')
        .insert({
          tenant_id: tenantId,
          user_id: userId,
          role,
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        console.error('Error adding user to tenant:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error adding user to tenant:', error);
      return null;
    }
  }

  /**
   * Remove user from tenant
   */
  async removeUserFromTenant(tenantId: string, userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('tenant_users')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('user_id', userId);

      if (error) {
        console.error('Error removing user from tenant:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error removing user from tenant:', error);
      return false;
    }
  }

  /**
   * Check if user has access to tenant
   */
  async hasUserAccess(tenantId: string, userId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('tenant_users')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        return false;
      }

      return !!data;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get tenant branding for theming
   */
  getTenantBranding(): Tenant['branding'] {
    return this.currentTenant?.branding || {
      primary_color: '#7c3aed',
      company_name: 'Panel1',
    };
  }

  /**
   * Check if tenant has feature enabled
   */
  hasFeature(feature: string): boolean {
    if (!this.currentTenant) return false;
    
    const features = this.currentTenant.settings.features || {};
    return features[feature as keyof typeof features] === true;
  }

  /**
   * Get tenant limits
   */
  getTenantLimits(): Tenant['settings']['limits'] {
    return this.currentTenant?.settings.limits || {};
  }

  /**
   * Apply tenant context to Supabase queries
   */
  withTenantContext<T>(query: any): any {
    if (!this.currentTenant) {
      throw new Error('No tenant context available');
    }

    return query.eq('tenant_id', this.currentTenant.id);
  }
}

// Export singleton instance
export const tenantManager = TenantManager.getInstance();

// Utility functions
export const getCurrentTenant = () => tenantManager.getCurrentTenant();
export const getTenantBranding = () => tenantManager.getTenantBranding();
export const hasFeature = (feature: string) => tenantManager.hasFeature(feature);
export const withTenantContext = <T>(query: any) => tenantManager.withTenantContext<T>(query);