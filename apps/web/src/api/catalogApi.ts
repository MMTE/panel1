import { fetchJson, fetchJsonPublic, getApiBaseUrl } from './http';

const base = () => `${getApiBaseUrl()}/api/catalog`;

export interface LegacyPlanRow {
  id: string;
  name: string;
  description: string | null;
  price: string;
  currency: string | null;
  interval: 'MONTHLY' | 'YEARLY' | 'WEEKLY' | 'DAILY';
  isActive: boolean | null;
  features: Record<string, unknown> | null;
  trialPeriodDays: number | null;
  setupFee: string | null;
  tenantId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export const catalogApi = {
  async listPublicProducts(params?: {
    category?: string;
    sortBy?: 'name' | 'createdAt' | 'sortOrder';
    sortDirection?: 'asc' | 'desc';
  }): Promise<unknown[]> {
    const qs = new URLSearchParams();
    if (params?.category) qs.set('category', params.category);
    if (params?.sortBy) qs.set('sortBy', params.sortBy);
    if (params?.sortDirection) qs.set('sortDirection', params.sortDirection);
    const q = qs.toString();
    return fetchJsonPublic<unknown[]>(`${base()}/public/products${q ? `?${q}` : ''}`);
  },

  getProviders(): Promise<unknown[]> {
    return fetchJson(`${base()}/providers`);
  },

  getProviderHealth(): Promise<unknown> {
    return fetchJson(`${base()}/providers/health`);
  },

  listComponents(): Promise<unknown[]> {
    return fetchJson(`${base()}/components`);
  },

  getComponentDefinition(id: string): Promise<unknown> {
    return fetchJson(`${base()}/components/definitions/${encodeURIComponent(id)}`);
  },

  createComponentDefinition(body: unknown): Promise<unknown> {
    return fetchJson(`${base()}/components/definitions`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  updateComponentDefinition(id: string, body: unknown): Promise<unknown> {
    return fetchJson(`${base()}/components/definitions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  deleteComponentDefinition(id: string): Promise<{ success: boolean }> {
    return fetchJson(`${base()}/components/definitions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  registerComponent(body: unknown): Promise<unknown> {
    return fetchJson(`${base()}/components/register`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  updateRegisteredComponent(id: string, body: unknown): Promise<unknown> {
    return fetchJson(`${base()}/components/register/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  validateComponentKey(componentKey: string, excludeId?: string): Promise<{ isAvailable: boolean; message: string }> {
    const qs = new URLSearchParams({ componentKey });
    if (excludeId) qs.set('excludeId', excludeId);
    return fetchJson(`${base()}/components/validate-key?${qs}`);
  },

  getComponentRegistrationStats(): Promise<unknown> {
    return fetchJson(`${base()}/components/stats`);
  },

  listProducts(params?: Record<string, string | boolean | undefined>): Promise<unknown[]> {
    const qs = new URLSearchParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== '') qs.set(k, String(v));
      }
    }
    const q = qs.toString();
    return fetchJson(`${base()}/products${q ? `?${q}` : ''}`);
  },

  getProduct(id: string): Promise<unknown> {
    return fetchJson(`${base()}/products/${encodeURIComponent(id)}`);
  },

  createProduct(body: unknown): Promise<unknown> {
    return fetchJson(`${base()}/products`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  updateProduct(id: string, body: unknown): Promise<unknown> {
    return fetchJson(`${base()}/products/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  deleteProduct(id: string): Promise<{ success: boolean }> {
    return fetchJson(`${base()}/products/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  searchProducts(q: string): Promise<unknown[]> {
    return fetchJson(`${base()}/products-search?q=${encodeURIComponent(q)}`);
  },

  checkInstanceHealth(componentId: string, providerKey: string): Promise<unknown> {
    const qs = new URLSearchParams({ componentId, providerKey });
    return fetchJson(`${base()}/instances/health?${qs}`);
  },

  restartInstance(id: string): Promise<{ success: boolean }> {
    return fetchJson(`${base()}/instances/${encodeURIComponent(id)}/restart`, { method: 'POST' });
  },

  updateInstanceConfiguration(id: string, configuration: Record<string, unknown>): Promise<{ success: boolean }> {
    return fetchJson(`${base()}/instances/${encodeURIComponent(id)}/configuration`, {
      method: 'PATCH',
      body: JSON.stringify({ configuration }),
    });
  },

  scaleInstance(id: string, quantity: number): Promise<{ success: boolean }> {
    return fetchJson(`${base()}/instances/${encodeURIComponent(id)}/scale`, {
      method: 'POST',
      body: JSON.stringify({ quantity }),
    });
  },

  getInstanceStatus(id: string): Promise<unknown> {
    return fetchJson(`${base()}/instances/${encodeURIComponent(id)}/status`);
  },

  listLegacyPlans(activeOnly = true): Promise<LegacyPlanRow[]> {
    return fetchJson(`${base()}/legacy-plans?activeOnly=${activeOnly}`);
  },

  getLegacyPlan(id: string): Promise<LegacyPlanRow> {
    return fetchJson(`${base()}/legacy-plans/${encodeURIComponent(id)}`);
  },

  createLegacyPlan(body: unknown): Promise<LegacyPlanRow> {
    return fetchJson(`${base()}/legacy-plans`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  updateLegacyPlan(id: string, body: unknown): Promise<LegacyPlanRow> {
    return fetchJson(`${base()}/legacy-plans/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  deleteLegacyPlan(id: string): Promise<{ success: boolean }> {
    return fetchJson(`${base()}/legacy-plans/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
};
