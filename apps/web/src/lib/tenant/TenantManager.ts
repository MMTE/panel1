import { trpc } from '../../api/trpc';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  branding?: {
    logo?: string;
    colors?: {
      primary?: string;
      secondary?: string;
      accent?: string;
    };
    customCss?: string;
  };
  settings?: Record<string, any>;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantUser {
  userId: string;
  tenantId: string;
  role: string;
  permissions?: string[];
  metadata?: Record<string, any>;
}

export interface TenantCreateData {
  name: string;
  slug: string;
  domain?: string;
  branding?: Tenant['branding'];
  settings?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface TenantUpdateData {
  name?: string;
  slug?: string;
  domain?: string;
  branding?: Partial<Tenant['branding']>;
  settings?: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * Manages multi-tenant functionality
 * NOTE: This is a temporary implementation. In production, this should use tRPC calls
 * to the backend tenant service that manages tenants via Drizzle/PostgreSQL.
 */
export class TenantManager {
  private static instance: TenantManager;
  private trpcClient: typeof trpc;
  private currentTenant: Tenant | null = null;

  private constructor() {
    this.trpcClient = trpc;
  }

  public static getInstance(): TenantManager {
    if (!TenantManager.instance) {
      TenantManager.instance = new TenantManager();
    }
    return TenantManager.instance;
  }

  /**
   * Get tenant by ID
   */
  public async getTenant(tenantId: string): Promise<Tenant> {
    try {
      const tenant = await this.trpcClient.tenants.getTenant.query({ id: tenantId });
      return tenant;
    } catch (error) {
      console.error(`Failed to get tenant ${tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Get tenant by slug or domain
   */
  public async getTenantBySlugOrDomain(identifier: string): Promise<Tenant> {
    try {
      const tenant = await this.trpcClient.tenants.getTenantByIdentifier.query({ identifier });
      return tenant;
    } catch (error) {
      console.error(`Failed to get tenant by identifier ${identifier}:`, error);
      throw error;
    }
  }

  /**
   * Create a new tenant
   */
  public async createTenant(data: TenantCreateData): Promise<Tenant> {
    try {
      const tenant = await this.trpcClient.tenants.createTenant.mutate(data);
      return tenant;
    } catch (error) {
      console.error('Failed to create tenant:', error);
      throw error;
    }
  }

  /**
   * Update tenant
   */
  public async updateTenant(tenantId: string, updates: TenantUpdateData): Promise<Tenant> {
    try {
      const tenant = await this.trpcClient.tenants.updateTenant.mutate({
        id: tenantId,
        data: updates
      });
      return tenant;
    } catch (error) {
      console.error(`Failed to update tenant ${tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Get tenants for user
   */
  public async getUserTenants(userId: string): Promise<Tenant[]> {
    try {
      const tenants = await this.trpcClient.tenants.getUserTenants.query({ userId });
      return tenants;
    } catch (error) {
      console.error(`Failed to get tenants for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Add user to tenant
   */
  public async addUserToTenant(tenantId: string, userId: string, role: string): Promise<TenantUser> {
    try {
      const tenantUser = await this.trpcClient.tenants.addUser.mutate({
        tenantId,
        userId,
        role
      });
      return tenantUser;
    } catch (error) {
      console.error(`Failed to add user ${userId} to tenant ${tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Remove user from tenant
   */
  public async removeUserFromTenant(tenantId: string, userId: string): Promise<void> {
    try {
      await this.trpcClient.tenants.removeUser.mutate({
        tenantId,
        userId
      });
    } catch (error) {
      console.error(`Failed to remove user ${userId} from tenant ${tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Check if user has access to tenant
   */
  public async hasUserAccess(tenantId: string, userId: string): Promise<boolean> {
    try {
      const result = await this.trpcClient.tenants.checkUserAccess.query({
        tenantId,
        userId
      });
      return result.hasAccess;
    } catch (error) {
      console.error(`Failed to check access for user ${userId} to tenant ${tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Set current tenant
   */
  public setCurrentTenant(tenant: Tenant): void {
    this.currentTenant = tenant;
  }

  /**
   * Get current tenant
   */
  public getCurrentTenant(): Tenant | null {
    return this.currentTenant;
  }

  /**
   * Get current tenant ID
   */
  public getCurrentTenantId(): string | null {
    return this.currentTenant?.id || null;
  }

  /**
   * Clear current tenant
   */
  public clearCurrentTenant(): void {
    this.currentTenant = null;
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
    const features = this.currentTenant?.settings || this.defaultTenant.settings;
    return (features as any)?.[feature] || false;
  }

  /**
   * Get tenant limits
   */
  getTenantLimits(): Record<string, any> {
    return this.currentTenant?.settings || this.defaultTenant.settings;
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
export const getCurrentTenantId = () => tenantManager.getCurrentTenantId();
export const getTenantBranding = () => tenantManager.getTenantBranding();
export const hasFeature = (feature: string) => tenantManager.hasFeature(feature);
export const withTenantContext = <T>(query: any) => tenantManager.withTenantContext<T>(query);