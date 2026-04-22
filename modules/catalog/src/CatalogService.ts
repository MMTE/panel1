import { and, asc, desc, eq, ne } from 'drizzle-orm';
import type { ModuleContext } from '@panel1/types';
import type { Panel1AuthUser } from '@panel1/core';
import {
  billingPlans,
  components,
  productComponents,
  products,
  subscribedComponents,
  plans,
} from './schema.js';
import { getPanel1CatalogRuntime } from '../../../apps/api/src/lib/catalog/catalogRuntime.js';

/** Subset of host registry provider — avoids importing `ComponentProviderRegistry` (pulls full API graph into module `tsc`). */
type RegistryProvider = {
  version: string;
  getComponentMetadata?: () => {
    supportedPricingModels: string[];
    requiredConfigFields: string[];
    optionalConfigFields: string[];
    usageTrackingSupported: boolean;
  };
  validateComponentConfig?: (config: Record<string, unknown>) => Promise<boolean>;
};

type Db = ReturnType<ModuleContext['db'] extends infer D ? () => D : never> extends never
  ? any
  : any;

export class CatalogService {
  constructor(readonly ctx: ModuleContext) {}

  private get db(): Db {
    return this.ctx.db as Db;
  }

  private runtime() {
    return getPanel1CatalogRuntime();
  }

  getProvidersMetadata() {
    return this.runtime().providerRegistry.getProvidersMetadata();
  }

  async performHealthCheck() {
    return this.runtime().providerRegistry.performHealthCheck();
  }

  private async validateConfiguration(
    provider: RegistryProvider,
    configuration: Record<string, unknown>
  ): Promise<void> {
    const metadata = provider.getComponentMetadata?.();
    if (!metadata) return;
    const missing = metadata.requiredConfigFields.filter((f) => !(f in configuration));
    if (missing.length > 0) {
      throw new Error(`Missing required configuration fields: ${missing.join(', ')}`);
    }
    if (provider.validateComponentConfig) {
      const ok = await provider.validateComponentConfig(configuration);
      if (!ok) throw new Error('Component configuration validation failed');
    }
  }

  private compareVersions(v1: string, v2: string): number {
    const normalize = (v: string) => v.split('.').map((n) => parseInt(n, 10));
    const [major1, minor1, patch1] = normalize(v1);
    const [major2, minor2, patch2] = normalize(v2);
    if (major1 !== major2) return major1 - major2;
    if (minor1 !== minor2) return minor1 - minor2;
    return patch1 - patch2;
  }

  private validateDependenciesSync(deps: import('./types.js').IComponentDependency[]): void {
    const reg = this.runtime().providerRegistry;
    for (const d of deps) {
      const p = reg.getProvider(d.componentKey);
      if (!p) throw new Error(`Dependency component provider not found: ${d.componentKey}`);
      if (d.minVersion || d.maxVersion) {
        const pv = p.version;
        if (d.minVersion && this.compareVersions(pv, d.minVersion) < 0) {
          throw new Error(
            `Dependency ${d.componentKey} version ${pv} is below minimum ${d.minVersion}`
          );
        }
        if (d.maxVersion && this.compareVersions(pv, d.maxVersion) > 0) {
          throw new Error(
            `Dependency ${d.componentKey} version ${pv} is above maximum ${d.maxVersion}`
          );
        }
      }
    }
  }

  async createComponentDefinition(input: {
    name: string;
    description: string;
    componentKey: string;
    configuration: Record<string, unknown>;
    dependencies?: import('./types.js').IComponentDependency[];
    isActive?: boolean;
    tenantId?: string | null;
  }) {
    const reg = this.runtime().providerRegistry;
    const provider = reg.getProvider(input.componentKey);
    if (!provider) throw new Error(`Provider not found for component key: ${input.componentKey}`);
    await this.validateConfiguration(provider, input.configuration);
    if (input.dependencies?.length) this.validateDependenciesSync(input.dependencies);

    const baseMeta = provider.getComponentMetadata?.() ?? {
      supportedPricingModels: [] as string[],
      requiredConfigFields: [] as string[],
      optionalConfigFields: [] as string[],
      usageTrackingSupported: false,
    };
    const metadata = {
      ...baseMeta,
      ...(input.dependencies?.length ? { dependencies: input.dependencies } : {}),
    };

    const [row] = await this.db
      .insert(components)
      .values({
        name: input.name,
        description: input.description,
        componentKey: input.componentKey,
        version: provider.version,
        isActive: input.isActive ?? true,
        configuration: input.configuration,
        metadata,
        tenantId: input.tenantId ?? undefined,
      })
      .returning();

    await this.ctx.emit('catalog.component.definition_created', {
      componentId: row.id,
      componentKey: row.componentKey,
    });
    return row;
  }

  async updateComponentDefinition(
    id: string,
    input: {
      name?: string;
      description?: string;
      configuration?: Record<string, unknown>;
      dependencies?: import('./types.js').IComponentDependency[];
      isActive?: boolean;
    }
  ) {
    const existing = await this.db.query.components.findFirst({ where: eq(components.id, id) });
    if (!existing) throw new Error('Component definition not found');

    const reg = this.runtime().providerRegistry;
    const provider = reg.getProvider(existing.componentKey);
    if (!provider) throw new Error(`Provider not found for component key: ${existing.componentKey}`);

    if (input.configuration) await this.validateConfiguration(provider, input.configuration);
    if (input.dependencies?.length) this.validateDependenciesSync(input.dependencies);

    const metadata = {
      ...(existing.metadata as Record<string, unknown>),
      ...(input.dependencies !== undefined ? { dependencies: input.dependencies } : {}),
    };

    const [row] = await this.db
      .update(components)
      .set({
        name: input.name ?? existing.name,
        description: input.description ?? existing.description,
        configuration: input.configuration ?? existing.configuration,
        metadata,
        isActive: input.isActive ?? existing.isActive,
        updatedAt: new Date(),
      })
      .where(eq(components.id, id))
      .returning();

    await this.ctx.emit('catalog.component.definition_updated', {
      componentId: row.id,
      componentKey: row.componentKey,
    });
    return row;
  }

  async deleteComponentDefinition(id: string) {
    const existing = await this.db.query.components.findFirst({ where: eq(components.id, id) });
    if (!existing) throw new Error('Component definition not found');
    await this.db.delete(components).where(eq(components.id, id));
    await this.ctx.emit('catalog.component.definition_deleted', {
      componentId: id,
      componentKey: existing.componentKey,
    });
  }

  async getComponentDefinition(id: string) {
    return this.db.query.components.findFirst({ where: eq(components.id, id) });
  }

  listComponentDefinitions() {
    return this.db.query.components.findMany();
  }

  async registerComponent(
    tenantId: string,
    input: {
      componentKey: string;
      name: string;
      description: string;
      supportedPricingModels: string[];
      usageTrackingSupported: boolean;
      requiredConfigFields: string[];
      optionalConfigFields: string[];
      configFieldTypes?: Record<string, string>;
      configFieldOptions?: Record<string, Array<{ value: string; label: string }>>;
      defaultConfiguration: Record<string, unknown>;
      tags: string[];
      icon?: string;
      isActive: boolean;
      provisioningRequired: boolean;
      provisioningProvider?: string;
    }
  ) {
    const existing = await this.db.query.components.findFirst({
      where: eq(components.componentKey, input.componentKey),
    });
    if (existing) throw new Error(`Component with key '${input.componentKey}' already exists`);

    const metadata = {
      requiredConfigFields: input.requiredConfigFields,
      optionalConfigFields: input.optionalConfigFields,
      supportedPricingModels: input.supportedPricingModels,
      usageTrackingSupported: input.usageTrackingSupported,
      provisioningRequired: input.provisioningRequired,
      provisioningProvider: input.provisioningProvider,
      configFieldTypes: input.configFieldTypes ?? {},
      configFieldOptions: input.configFieldOptions ?? {},
      tags: input.tags,
      icon: input.icon,
    };

    const [row] = await this.db
      .insert(components)
      .values({
        componentKey: input.componentKey,
        name: input.name,
        description: input.description,
        version: '1.0.0',
        configuration: input.defaultConfiguration ?? {},
        metadata,
        isActive: input.isActive,
        tenantId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return { success: true as const, component: row, message: `Component '${input.name}' registered` };
  }

  async updateRegisteredComponent(
    tenantId: string,
    id: string,
    input: Partial<{
      name: string;
      description: string;
      defaultConfiguration: Record<string, unknown>;
      supportedPricingModels: string[];
      usageTrackingSupported: boolean;
      requiredConfigFields: string[];
      optionalConfigFields: string[];
      provisioningRequired: boolean;
      provisioningProvider: string;
      configFieldTypes: Record<string, string>;
      configFieldOptions: Record<string, Array<{ value: string; label: string }>>;
      tags: string[];
      icon: string;
      isActive: boolean;
    }>
  ) {
    const existing = await this.db.query.components.findFirst({
      where: and(eq(components.id, id), eq(components.tenantId, tenantId)),
    });
    if (!existing) throw new Error('Component not found');

    let metadata = { ...(existing.metadata as Record<string, unknown>) };
    if (
      input.requiredConfigFields ||
      input.optionalConfigFields ||
      input.supportedPricingModels ||
      input.usageTrackingSupported !== undefined ||
      input.provisioningRequired !== undefined ||
      input.provisioningProvider ||
      input.configFieldTypes ||
      input.configFieldOptions ||
      input.tags ||
      input.icon
    ) {
      metadata = {
        ...metadata,
        ...(input.requiredConfigFields && { requiredConfigFields: input.requiredConfigFields }),
        ...(input.optionalConfigFields && { optionalConfigFields: input.optionalConfigFields }),
        ...(input.supportedPricingModels && { supportedPricingModels: input.supportedPricingModels }),
        ...(input.usageTrackingSupported !== undefined && {
          usageTrackingSupported: input.usageTrackingSupported,
        }),
        ...(input.provisioningRequired !== undefined && {
          provisioningRequired: input.provisioningRequired,
        }),
        ...(input.provisioningProvider && { provisioningProvider: input.provisioningProvider }),
        ...(input.configFieldTypes && { configFieldTypes: input.configFieldTypes }),
        ...(input.configFieldOptions && { configFieldOptions: input.configFieldOptions }),
        ...(input.tags && { tags: input.tags }),
        ...(input.icon && { icon: input.icon }),
      };
    }

    const [row] = await this.db
      .update(components)
      .set({
        name: input.name ?? existing.name,
        description: input.description ?? existing.description,
        configuration: input.defaultConfiguration ?? existing.configuration,
        metadata,
        isActive: input.isActive ?? existing.isActive,
        updatedAt: new Date(),
      })
      .where(eq(components.id, id))
      .returning();

    return { success: true as const, component: row, message: `Component '${row.name}' updated` };
  }

  async validateComponentKey(componentKey: string, excludeId?: string) {
    const existing = await this.db.query.components.findFirst({
      where: excludeId
        ? and(eq(components.componentKey, componentKey), ne(components.id, excludeId))
        : eq(components.componentKey, componentKey),
    });
    return {
      isAvailable: !existing,
      message: existing
        ? `Component key '${componentKey}' is already in use`
        : `Component key '${componentKey}' is available`,
    };
  }

  async getComponentRegistrationStats() {
    const all = await this.db.query.components.findMany();
    const active = all.filter((c) => c.isActive);
    const byType: Record<string, number> = {};
    for (const c of all) {
      const t = (c.metadata as { componentType?: string })?.componentType ?? 'UNKNOWN';
      byType[t] = (byType[t] || 0) + 1;
    }
    return {
      total: all.length,
      active: active.length,
      inactive: all.length - active.length,
      byType,
    };
  }

  async listPublicProducts(input?: {
    category?: string;
    sortBy?: 'name' | 'createdAt' | 'sortOrder';
    sortDirection?: 'asc' | 'desc';
  }) {
    const cond = [eq(products.isPublic, true), eq(products.isActive, true)];
    if (input?.category) cond.push(eq(products.category, input.category));

    const sortBy = input?.sortBy ?? 'sortOrder';
    const dir = input?.sortDirection ?? 'asc';
    const order =
      sortBy === 'name'
        ? dir === 'asc'
          ? asc(products.name)
          : desc(products.name)
        : sortBy === 'createdAt'
          ? dir === 'asc'
            ? asc(products.createdAt)
            : desc(products.createdAt)
          : dir === 'asc'
            ? asc(products.sortOrder)
            : desc(products.sortOrder);

    return this.db.query.products.findMany({
      where: and(...cond),
      with: {
        components: { with: { component: true } },
        billingPlans: { where: eq(billingPlans.isActive, true) },
      },
      orderBy: [order],
    });
  }

  async createProduct(
    tenantId: string,
    input: {
      name: string;
      description?: string;
      shortDescription?: string;
      category?: string;
      tags: string[];
      isActive: boolean;
      isPublic: boolean;
      sortOrder: number;
      trialPeriodDays?: number;
      setupRequired: boolean;
      components: Array<{
        componentId: string;
        pricing: string;
        unitPrice?: string;
        includedUnits?: number;
        configuration?: Record<string, string | unknown>;
        tiers?: Array<{ from: number; to: number | null; price: string }>;
      }>;
      billingPlans: Array<{
        name: string;
        basePrice: string;
        interval: string;
        setupFee?: string;
      }>;
    }
  ) {
    return this.db.transaction(async (tx: Db) => {
      const [product] = await tx
        .insert(products)
        .values({
          name: input.name,
          description: input.description ?? '',
          shortDescription: input.shortDescription,
          category: input.category,
          tags: input.tags,
          isActive: input.isActive,
          isPublic: input.isPublic,
          sortOrder: input.sortOrder,
          trialPeriodDays: input.trialPeriodDays,
          setupRequired: input.setupRequired,
          tenantId,
        })
        .returning();

      if (input.components.length > 0) {
        await tx.insert(productComponents).values(
          input.components.map((comp, index) => ({
            productId: product.id,
            componentId: comp.componentId,
            pricingModel: comp.pricing,
            pricingDetails: {
              unitPrice: comp.unitPrice,
              includedUnits: comp.includedUnits,
              tiers: comp.tiers,
            },
            configuration: comp.configuration ?? {},
            sortOrder: index,
            tenantId,
          }))
        );
      }

      await tx.insert(billingPlans).values(
        input.billingPlans.map((plan, index) => ({
          productId: product.id,
          name: plan.name,
          basePrice: plan.basePrice,
          interval: plan.interval,
          setupFee: plan.setupFee ?? '0',
          isDefault: index === 0,
          isActive: true,
          sortOrder: index,
          tenantId,
        }))
      );

      return tx.query.products.findFirst({
        where: eq(products.id, product.id),
        with: {
          components: { with: { component: true } },
          billingPlans: true,
        },
      });
    });
  }

  async updateProduct(
    tenantId: string,
    productId: string,
    input: {
      name?: string;
      description?: string;
      shortDescription?: string;
      category?: string;
      tags?: string[];
      isActive?: boolean;
      isPublic?: boolean;
      sortOrder?: number;
      trialPeriodDays?: number;
      setupRequired?: boolean;
      components?: Array<{
        componentId: string;
        pricing: string;
        unitPrice?: string;
        includedUnits?: number;
        configuration?: Record<string, string | unknown>;
        tiers?: Array<{ from: number; to: number | null; price: string }>;
      }>;
      billingPlans?: Array<{
        name: string;
        basePrice: string;
        interval: string;
        setupFee?: string;
      }>;
    }
  ) {
    const existing = await this.db.query.products.findFirst({
      where: and(eq(products.id, productId), eq(products.tenantId, tenantId)),
    });
    if (!existing) throw new Error('Product not found');

    return this.db.transaction(async (tx: Db) => {
      const { components: compList, billingPlans: planList, ...productScalars } = input;
      await tx
        .update(products)
        .set({
          ...productScalars,
          updatedAt: new Date(),
        })
        .where(eq(products.id, productId));

      if (compList !== undefined) {
        await tx.delete(productComponents).where(eq(productComponents.productId, productId));
        if (compList.length > 0) {
          await tx.insert(productComponents).values(
            compList.map((comp, index) => ({
              productId,
              componentId: comp.componentId,
              pricingModel: comp.pricing,
              pricingDetails: {
                unitPrice: comp.unitPrice,
                includedUnits: comp.includedUnits,
                tiers: comp.tiers,
              },
              configuration: comp.configuration ?? {},
              sortOrder: index,
              tenantId,
            }))
          );
        }
      }

      if (planList !== undefined) {
        await tx.delete(billingPlans).where(eq(billingPlans.productId, productId));
        if (planList.length > 0) {
          await tx.insert(billingPlans).values(
            planList.map((plan, index) => ({
              productId,
              name: plan.name,
              basePrice: plan.basePrice,
              interval: plan.interval,
              setupFee: plan.setupFee ?? '0',
              isDefault: index === 0,
              isActive: true,
              sortOrder: index,
              tenantId,
            }))
          );
        }
      }

      return tx.query.products.findFirst({
        where: eq(products.id, productId),
        with: {
          components: { with: { component: true } },
          billingPlans: true,
        },
      });
    });
  }

  async deleteProduct(tenantId: string, productId: string) {
    const existing = await this.db.query.products.findFirst({
      where: and(eq(products.id, productId), eq(products.tenantId, tenantId)),
    });
    if (!existing) throw new Error('Product not found');
    await this.db.delete(products).where(eq(products.id, productId));
    await this.ctx.emit('catalog.product.deleted', { productId, name: existing.name });
  }

  async getProduct(tenantId: string, productId: string) {
    const p = await this.db.query.products.findFirst({
      where: and(eq(products.id, productId), eq(products.tenantId, tenantId)),
      with: {
        components: { with: { component: true } },
        billingPlans: true,
      },
    });
    if (!p) throw new Error('Product not found');
    return p;
  }

  async listProducts(
    tenantId: string,
    input?: {
      category?: string;
      isActive?: boolean;
      isPublic?: boolean;
      sortBy?: 'name' | 'createdAt' | 'sortOrder';
      sortDirection?: 'asc' | 'desc';
    }
  ) {
    const cond = [eq(products.tenantId, tenantId)];
    if (input?.category) cond.push(eq(products.category, input.category));
    if (input?.isActive !== undefined) cond.push(eq(products.isActive, input.isActive));
    if (input?.isPublic !== undefined) cond.push(eq(products.isPublic, input.isPublic));

    const sortBy = input?.sortBy ?? 'sortOrder';
    const dir = input?.sortDirection ?? 'asc';
    const order =
      sortBy === 'name'
        ? dir === 'asc'
          ? asc(products.name)
          : desc(products.name)
        : sortBy === 'createdAt'
          ? dir === 'asc'
            ? asc(products.createdAt)
            : desc(products.createdAt)
          : dir === 'asc'
            ? asc(products.sortOrder)
            : desc(products.sortOrder);

    return this.db.query.products.findMany({
      where: and(...cond),
      with: {
        components: { with: { component: true } },
        billingPlans: true,
      },
      orderBy: [order],
    });
  }

  async searchProducts(tenantId: string, query: string) {
    const list = await this.listProducts(tenantId, { isActive: true, isPublic: true });
    const q = query.toLowerCase();
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description?.toLowerCase().includes(q) ?? false) ||
        (p.shortDescription?.toLowerCase().includes(q) ?? false) ||
        (p.tags as string[] | null)?.some((t) => t.toLowerCase().includes(q))
    );
  }

  async createBillingPlan(
    tenantId: string,
    input: {
      productId: string;
      name: string;
      description?: string;
      interval: string;
      intervalCount?: number;
      basePrice: string;
      currency?: string;
      setupFee?: string;
      trialPeriodDays?: number;
      isDefault?: boolean;
      isActive?: boolean;
      sortOrder?: number;
      metadata?: Record<string, unknown>;
    }
  ) {
    const product = await this.db.query.products.findFirst({
      where: and(eq(products.id, input.productId), eq(products.tenantId, tenantId)),
    });
    if (!product) throw new Error('Product not found');

    if (input.isDefault) {
      await this.db
        .update(billingPlans)
        .set({ isDefault: false })
        .where(and(eq(billingPlans.productId, input.productId), eq(billingPlans.tenantId, tenantId)));
    }

    const [row] = await this.db
      .insert(billingPlans)
      .values({
        productId: input.productId,
        name: input.name,
        description: input.description,
        interval: input.interval,
        intervalCount: input.intervalCount ?? 1,
        basePrice: input.basePrice,
        currency: input.currency ?? 'USD',
        setupFee: input.setupFee ?? '0',
        trialPeriodDays: input.trialPeriodDays ?? 0,
        isDefault: input.isDefault ?? false,
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
        metadata: input.metadata,
        tenantId,
      })
      .returning();
    return row;
  }

  async updateBillingPlan(
    tenantId: string,
    planId: string,
    input: Partial<{
      name: string;
      description: string;
      interval: string;
      intervalCount: number;
      basePrice: string;
      currency: string;
      setupFee: string;
      trialPeriodDays: number;
      isDefault: boolean;
      isActive: boolean;
      sortOrder: number;
      metadata: Record<string, unknown>;
    }>
  ) {
    const existing = await this.db.query.billingPlans.findFirst({
      where: and(eq(billingPlans.id, planId), eq(billingPlans.tenantId, tenantId)),
    });
    if (!existing) throw new Error('Billing plan not found');

    if (input.isDefault) {
      await this.db
        .update(billingPlans)
        .set({ isDefault: false })
        .where(
          and(eq(billingPlans.productId, existing.productId), eq(billingPlans.tenantId, tenantId))
        );
    }

    const [row] = await this.db
      .update(billingPlans)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(billingPlans.id, planId), eq(billingPlans.tenantId, tenantId)))
      .returning();
    return row;
  }

  async deleteBillingPlan(tenantId: string, planId: string) {
    const existing = await this.db.query.billingPlans.findFirst({
      where: and(eq(billingPlans.id, planId), eq(billingPlans.tenantId, tenantId)),
    });
    if (!existing) throw new Error('Billing plan not found');

    const others = await this.db.query.billingPlans.findMany({
      where: and(
        eq(billingPlans.productId, existing.productId),
        eq(billingPlans.tenantId, tenantId),
        eq(billingPlans.isActive, true),
        ne(billingPlans.id, planId)
      ),
    });
    if (others.length === 0) {
      throw new Error('Cannot delete the only active billing plan for a product');
    }

    await this.db
      .delete(billingPlans)
      .where(and(eq(billingPlans.id, planId), eq(billingPlans.tenantId, tenantId)));
  }

  async getBillingPlan(tenantId: string, planId: string) {
    const row = await this.db.query.billingPlans.findFirst({
      where: and(eq(billingPlans.id, planId), eq(billingPlans.tenantId, tenantId)),
      with: { product: true },
    });
    if (!row) throw new Error('Billing plan not found');
    return row;
  }

  async listBillingPlans(
    tenantId: string,
    input?: {
      productId?: string;
      isActive?: boolean;
      interval?: string;
      sortBy?: 'name' | 'basePrice' | 'sortOrder';
      sortDirection?: 'asc' | 'desc';
    }
  ) {
    const cond = [eq(billingPlans.tenantId, tenantId)];
    if (input?.productId) cond.push(eq(billingPlans.productId, input.productId));
    if (input?.isActive !== undefined) cond.push(eq(billingPlans.isActive, input.isActive));
    if (input?.interval) cond.push(eq(billingPlans.interval, input.interval));

    const sortBy = input?.sortBy ?? 'sortOrder';
    const dir = input?.sortDirection ?? 'asc';
    const order =
      sortBy === 'name'
        ? dir === 'asc'
          ? asc(billingPlans.name)
          : desc(billingPlans.name)
        : sortBy === 'basePrice'
          ? dir === 'asc'
            ? asc(billingPlans.basePrice)
            : desc(billingPlans.basePrice)
          : dir === 'asc'
            ? asc(billingPlans.sortOrder)
            : desc(billingPlans.sortOrder);

    return this.db.query.billingPlans.findMany({
      where: and(...cond),
      with: { product: true },
      orderBy: [order],
    });
  }

  async productComponentsAdd(
    tenantId: string,
    input: {
      productId: string;
      componentDefinitionId: string;
      pricingModel: string;
      pricingDetails: Record<string, unknown>;
      defaultConfig?: Record<string, unknown>;
      isRequired?: boolean;
      isConfigurable?: boolean;
      sortOrder?: number;
    }
  ) {
    const [p] = await this.db
      .select()
      .from(products)
      .where(and(eq(products.id, input.productId), eq(products.tenantId, tenantId)));
    if (!p) throw new Error('Product not found');

    const [c] = await this.db
      .select()
      .from(components)
      .where(and(eq(components.id, input.componentDefinitionId), eq(components.tenantId, tenantId)));
    if (!c) throw new Error('Component definition not found');

    const [row] = await this.db
      .insert(productComponents)
      .values({
        productId: input.productId,
        componentId: input.componentDefinitionId,
        pricingModel: input.pricingModel,
        pricingDetails: input.pricingDetails,
        configuration: input.defaultConfig ?? {},
        sortOrder: input.sortOrder ?? 0,
        tenantId,
      })
      .returning();
    return row;
  }

  async productComponentsUpdate(
    tenantId: string,
    id: string,
    input: Partial<{
      pricingModel: string;
      pricingDetails: Record<string, unknown>;
      defaultConfig: Record<string, unknown>;
      sortOrder: number;
    }>
  ) {
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.pricingModel !== undefined) patch.pricingModel = input.pricingModel;
    if (input.pricingDetails !== undefined) patch.pricingDetails = input.pricingDetails;
    if (input.defaultConfig !== undefined) patch.configuration = input.defaultConfig;
    if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;

    const [row] = await this.db
      .update(productComponents)
      .set(patch as typeof productComponents.$inferInsert)
      .where(and(eq(productComponents.id, id), eq(productComponents.tenantId, tenantId)))
      .returning();
    if (!row) throw new Error('Product component not found');
    return row;
  }

  async productComponentsRemove(tenantId: string, id: string) {
    const [del] = await this.db
      .delete(productComponents)
      .where(and(eq(productComponents.id, id), eq(productComponents.tenantId, tenantId)))
      .returning();
    if (!del) throw new Error('Product component not found');
  }

  async reportUsage(tenantId: string, subscribedComponentId: string, usageAmount: number, mode: 'increment' | 'set') {
    const [sub] = await this.db
      .select()
      .from(subscribedComponents)
      .where(
        and(eq(subscribedComponents.id, subscribedComponentId), eq(subscribedComponents.tenantId, tenantId))
      )
      .limit(1);
    if (!sub) throw new Error('Subscribed component not found');

    const current = parseFloat(String(sub.currentUsage ?? '0'));
    const newUsage = mode === 'increment' ? current + usageAmount : usageAmount;

    await this.db
      .update(subscribedComponents)
      .set({ currentUsage: newUsage.toString(), updatedAt: new Date() })
      .where(eq(subscribedComponents.id, subscribedComponentId));

    return { success: true as const, previousUsage: current, newUsage };
  }

  async plansGetAll(tenantId: string, activeOnly: boolean) {
    const cond = [eq(plans.tenantId, tenantId)];
    if (activeOnly) cond.push(eq(plans.isActive, true));
    return this.db.select().from(plans).where(and(...cond)).orderBy(asc(plans.price));
  }

  async plansGetById(tenantId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(plans)
      .where(and(eq(plans.id, id), eq(plans.tenantId, tenantId)))
      .limit(1);
    if (!row) throw new Error('Plan not found');
    return row;
  }

  async plansCreate(
    tenantId: string,
    input: {
      name: string;
      description?: string;
      price: string;
      currency?: string;
      interval: 'MONTHLY' | 'YEARLY' | 'WEEKLY' | 'DAILY';
      features?: Record<string, unknown>;
      trialPeriodDays?: number;
      setupFee?: string;
    }
  ) {
    const [row] = await this.db
      .insert(plans)
      .values({
        ...input,
        tenantId,
        setupFee: input.setupFee ?? '0',
        trialPeriodDays: input.trialPeriodDays ?? 0,
      })
      .returning();
    return row;
  }

  async plansUpdate(
    tenantId: string,
    id: string,
    input: Partial<{
      name: string;
      description: string;
      price: string;
      currency: string;
      interval: 'MONTHLY' | 'YEARLY' | 'WEEKLY' | 'DAILY';
      isActive: boolean;
      features: Record<string, unknown>;
      trialPeriodDays: number;
      setupFee: string;
    }>
  ) {
    const [row] = await this.db
      .update(plans)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(plans.id, id), eq(plans.tenantId, tenantId)))
      .returning();
    if (!row) throw new Error('Plan not found');
    return row;
  }

  async plansDelete(tenantId: string, id: string) {
    const [del] = await this.db
      .delete(plans)
      .where(and(eq(plans.id, id), eq(plans.tenantId, tenantId)))
      .returning({ id: plans.id });
    if (!del) throw new Error('Plan not found');
  }

  async checkComponentHealth(componentId: string, providerKey: string) {
    const lifecycle = this.runtime().componentLifecycle;
    const handler = lifecycle.getHandler(providerKey);
    if (!handler) {
      return {
        status: 'down' as const,
        message: 'Handler not found',
        lastChecked: new Date().toISOString(),
      };
    }
    if ('healthCheck' in handler && typeof handler.healthCheck === 'function') {
      const healthResult = await handler.healthCheck();
      return {
        status: healthResult.healthy ? ('healthy' as const) : ('degraded' as const),
        message: healthResult.message || 'Health check completed',
        lastChecked: new Date().toISOString(),
        details: healthResult.details,
      };
    }
    return {
      status: 'healthy' as const,
      message: 'Handler available (no health check implemented)',
      lastChecked: new Date().toISOString(),
    };
  }

  async restartSubscribedComponent(tenantId: string, componentId: string) {
    const ok = await this.runtime().componentManagement.restartComponent(componentId, tenantId);
    return { success: ok };
  }

  async updateSubscribedConfiguration(tenantId: string, componentId: string, configuration: Record<string, unknown>) {
    const ok = await this.runtime().componentManagement.updateConfiguration(
      componentId,
      tenantId,
      configuration as Record<string, any>
    );
    return { success: ok };
  }

  async scaleSubscribedComponent(tenantId: string, componentId: string, quantity: number) {
    const ok = await this.runtime().componentManagement.scaleComponent(componentId, tenantId, quantity);
    return { success: ok };
  }

  async getSubscribedComponentStatus(tenantId: string, componentId: string) {
    return this.runtime().componentManagement.getComponentStatus(componentId, tenantId);
  }
}

export function requireAdmin(user: Panel1AuthUser | undefined): void {
  if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
    throw new Error('Admin role required');
  }
}
