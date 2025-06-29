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
 * NOTE: This is a temporary implementation. In production, this should use tRPC calls
 * to the backend tenant service that manages tenants via Drizzle/PostgreSQL.
 */
export class TenantManager {
  private static instance: TenantManager;
  private currentTenant: Tenant | null = null;

  // Demo tenant for development
  private readonly defaultTenant: Tenant = {
    id: 'demo-tenant-id',
    name: 'Panel1 Demo',
    slug: 'demo',
    domain: 'demo.panel1.dev',
    settings: {
      features: {
        plugins: true,
        multi_currency: true,
        custom_branding: true,
      },
      limits: {
        max_users: 1000,
        max_clients: 10000,
        max_storage: 100000, // 100GB in MB
      },
    },
    branding: {
      primary_color: '#8B5CF6',
      secondary_color: '#EC4899',
      logo_url: '/logo.png',
      company_name: 'Panel1 Demo',
      favicon_url: '/favicon.ico',
      custom_css: '',
    },
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  private constructor() {
    // Initialize with default tenant for development
    this.currentTenant = this.defaultTenant;
  }

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
   * TODO: Replace with tRPC call to backend tenant service
   */
  async getTenant(tenantId: string): Promise<Tenant | null> {
    try {
      // For now, return default tenant if ID matches, null otherwise
      if (tenantId === this.defaultTenant.id) {
        return this.defaultTenant;
      }
      
      console.log(`TODO: Implement tRPC call for getTenant(${tenantId})`);
      return null;
    } catch (error) {
      console.error('Error fetching tenant:', error);
      return null;
    }
  }

  /**
   * Get tenant by slug or domain
   * TODO: Replace with tRPC call to backend tenant service
   */
  async getTenantBySlugOrDomain(identifier: string): Promise<Tenant | null> {
    try {
      // For now, return default tenant if identifier matches
      if (identifier === this.defaultTenant.slug || identifier === this.defaultTenant.domain) {
        return this.defaultTenant;
      }
      
      console.log(`TODO: Implement tRPC call for getTenantBySlugOrDomain(${identifier})`);
      return null;
    } catch (error) {
      console.error('Error fetching tenant by identifier:', error);
      return null;
    }
  }

  /**
   * Create a new tenant
   * TODO: Replace with tRPC call to backend tenant service
   */
  async createTenant(tenantData: {
    name: string;
    slug: string;
    domain?: string;
    settings?: Tenant['settings'];
    branding?: Tenant['branding'];
  }): Promise<Tenant | null> {
    try {
      console.log('TODO: Implement tRPC call for createTenant', tenantData);
      
      // For development, return a mock tenant
      const newTenant: Tenant = {
        id: `tenant-${Date.now()}`,
        name: tenantData.name,
        slug: tenantData.slug,
        domain: tenantData.domain,
        settings: tenantData.settings || this.defaultTenant.settings,
        branding: tenantData.branding || this.defaultTenant.branding,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      return newTenant;
    } catch (error) {
      console.error('Error creating tenant:', error);
      return null;
    }
  }

  /**
   * Update tenant settings
   * TODO: Replace with tRPC call to backend tenant service
   */
  async updateTenant(
    tenantId: string,
    updates: Partial<Pick<Tenant, 'name' | 'domain' | 'settings' | 'branding' | 'is_active'>>
  ): Promise<Tenant | null> {
    try {
      console.log('TODO: Implement tRPC call for updateTenant', { tenantId, updates });
      
      // For development, update default tenant if ID matches
      if (tenantId === this.defaultTenant.id) {
        const updatedTenant: Tenant = {
          ...this.defaultTenant,
          ...updates,
          updated_at: new Date().toISOString(),
        };
        this.currentTenant = updatedTenant;
        return updatedTenant;
      }
      
      return null;
    } catch (error) {
      console.error('Error updating tenant:', error);
      return null;
    }
  }

  /**
   * Get user's tenants
   * TODO: Replace with tRPC call to backend tenant service
   */
  async getUserTenants(userId: string): Promise<TenantUser[]> {
    try {
      console.log(`TODO: Implement tRPC call for getUserTenants(${userId})`);
      
      // For development, return default tenant user relationship
      return [{
        id: `tenant-user-${userId}`,
        tenant_id: this.defaultTenant.id,
        user_id: userId,
        role: 'ADMIN',
        is_active: true,
        created_at: new Date().toISOString(),
      }];
    } catch (error) {
      console.error('Error fetching user tenants:', error);
      return [];
    }
  }

  /**
   * Add user to tenant
   * TODO: Replace with tRPC call to backend tenant service
   */
  async addUserToTenant(
    tenantId: string,
    userId: string,
    role: 'ADMIN' | 'CLIENT' | 'RESELLER' = 'CLIENT'
  ): Promise<TenantUser | null> {
    try {
      console.log('TODO: Implement tRPC call for addUserToTenant', { tenantId, userId, role });
      
      // For development, return mock tenant user
      return {
        id: `tenant-user-${Date.now()}`,
        tenant_id: tenantId,
        user_id: userId,
        role,
        is_active: true,
        created_at: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error adding user to tenant:', error);
      return null;
    }
  }

  /**
   * Remove user from tenant
   * TODO: Replace with tRPC call to backend tenant service
   */
  async removeUserFromTenant(tenantId: string, userId: string): Promise<boolean> {
    try {
      console.log('TODO: Implement tRPC call for removeUserFromTenant', { tenantId, userId });
      return true;
    } catch (error) {
      console.error('Error removing user from tenant:', error);
      return false;
    }
  }

  /**
   * Check if user has access to tenant
   * TODO: Replace with tRPC call to backend tenant service
   */
  async hasUserAccess(tenantId: string, userId: string): Promise<boolean> {
    try {
      console.log(`TODO: Implement tRPC call for hasUserAccess(${tenantId}, ${userId})`);
      
      // For development, allow access to default tenant
      return tenantId === this.defaultTenant.id;
    } catch (error) {
      console.error('Error checking user access:', error);
      return false;
    }
  }

  /**
   * Get tenant branding configuration
   */
  getTenantBranding(): Tenant['branding'] {
    return this.currentTenant?.branding || this.defaultTenant.branding;
  }

  /**
   * Check if tenant has specific feature enabled
   */
  hasFeature(feature: string): boolean {
    const features = this.currentTenant?.settings?.features || this.defaultTenant.settings.features;
    return (features as any)?.[feature] || false;
  }

  /**
   * Get tenant limits
   */
  getTenantLimits(): Tenant['settings']['limits'] {
    return this.currentTenant?.settings?.limits || this.defaultTenant.settings.limits;
  }

  /**
   * Apply tenant context to queries (placeholder for future tRPC integration)
   */
  withTenantContext<T>(query: any): any {
    // TODO: Implement proper tenant context for tRPC queries
    return query;
  }
}

// Singleton instance
const tenantManager = TenantManager.getInstance();

// Export the singleton instance
export { tenantManager };

// Export convenience functions
export const getCurrentTenant = () => tenantManager.getCurrentTenant();
export const getTenantBranding = () => tenantManager.getTenantBranding();
export const hasFeature = (feature: string) => tenantManager.hasFeature(feature);
export const withTenantContext = <T>(query: any) => tenantManager.withTenantContext<T>(query);