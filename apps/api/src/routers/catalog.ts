import { z } from 'zod';
import { router, publicProcedure, protectedProcedure, adminProcedure, requirePermission } from '../trpc/trpc';
import { db } from '../db';
import { 
  components, 
  products, 
  productComponents, 
  billingPlans,
  subscribedComponents,
  type ComponentDefinition,
  type Product,
  type ProductComponent,
  type BillingPlan
} from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { ComponentDefinitionService } from '../lib/catalog/ComponentDefinitionService';
import { ComponentProviderRegistry } from '../lib/catalog/ComponentProviderRegistry';

// Input validation schemas
const componentDefinitionCreateSchema = z.object({
  key: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  type: z.enum(['HOSTING', 'DOMAIN', 'SSL', 'EMAIL', 'DATABASE', 'STORAGE', 'BANDWIDTH', 'CPU', 'RAM', 'BACKUP', 'OTHER']),
  provisioningRequired: z.boolean().default(true),
  provisioningProvider: z.string().optional(),
  configSchema: z.record(z.any()).optional(),
  defaultConfig: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
  isActive: z.boolean().default(true),
});

// Dynamic component registration schema
const dynamicComponentRegistrationSchema = z.object({
  componentKey: z.string().min(2).max(50).regex(/^[a-z0-9_-]+$/i, 'Component key must contain only letters, numbers, hyphens, and underscores'),
  name: z.string().min(1).max(255),
  description: z.string().min(1).max(1000),
  type: z.enum(['HOSTING', 'DOMAIN', 'SSL', 'EMAIL', 'DATABASE', 'STORAGE', 'BANDWIDTH', 'CPU', 'RAM', 'BACKUP', 'OTHER']),
  provisioningRequired: z.boolean().default(true),
  provisioningProvider: z.string().optional(),
  supportedPricingModels: z.array(z.enum(['FIXED', 'PER_UNIT', 'TIERED', 'VOLUME', 'USAGE_BASED'])).min(1),
  usageTrackingSupported: z.boolean().default(false),
  requiredConfigFields: z.array(z.string()).default([]),
  optionalConfigFields: z.array(z.string()).default([]),
  configFieldTypes: z.record(z.enum(['string', 'number', 'boolean', 'select', 'array'])).optional(),
  configFieldOptions: z.record(z.array(z.object({
    value: z.string(),
    label: z.string()
  }))).optional(),
  defaultConfiguration: z.record(z.any()).default({}),
  tags: z.array(z.string()).default([]),
  icon: z.string().optional(),
  isActive: z.boolean().default(true),
});

const componentRegistrationUpdateSchema = dynamicComponentRegistrationSchema.partial().omit({ componentKey: true });

const productCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  shortDescription: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  isActive: z.boolean().default(true),
  isPublic: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  trialPeriodDays: z.number().int().min(0).default(0),
  setupRequired: z.boolean().default(false),
  metadata: z.record(z.any()).optional(),
});

const productComponentCreateSchema = z.object({
  productId: z.string().uuid(),
  componentDefinitionId: z.string().uuid(),
  pricingModel: z.enum(['FIXED', 'PER_UNIT', 'TIERED', 'VOLUME', 'USAGE_BASED']),
  pricingDetails: z.object({
    fixedPrice: z.number().optional(),
    pricePerUnit: z.number().optional(),
    minQuantity: z.number().int().optional(),
    maxQuantity: z.number().int().optional(),
    tiers: z.array(z.object({
      minQuantity: z.number().int(),
      maxQuantity: z.number().int().optional(),
      pricePerUnit: z.number(),
    })).optional(),
    includedQuantity: z.number().int().optional(),
    billingUnit: z.string().optional(),
    currency: z.string().default('USD'),
  }),
  defaultConfig: z.record(z.any()).optional(),
  isRequired: z.boolean().default(true),
  isConfigurable: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

const billingPlanCreateSchema = z.object({
  productId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  interval: z.enum(['MONTHLY', 'YEARLY', 'WEEKLY', 'DAILY', 'HOURLY']),
  intervalCount: z.number().int().min(1).default(1),
  basePrice: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'),
  currency: z.string().default('USD'),
  setupFee: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'),
  trialPeriodDays: z.number().int().min(0).default(0),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  metadata: z.record(z.any()).optional(),
});

const usageReportSchema = z.object({
  subscribedComponentId: z.string().uuid(),
  usageAmount: z.number().min(0),
  mode: z.enum(['increment', 'set']).default('increment'),
});

// Validation schemas
const componentConfigSchema = z.record(z.unknown());

const createComponentSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  componentKey: z.string().min(1),
  configuration: componentConfigSchema,
  isActive: z.boolean().optional(),
});

const updateComponentSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  configuration: componentConfigSchema.optional(),
  isActive: z.boolean().optional(),
});

export const catalogRouter = router({
  // Component Provider Registry endpoints
  getProviders: protectedProcedure
    .query(async () => {
      const registry = ComponentProviderRegistry.getInstance();
      return registry.getProvidersMetadata();
    }),

  getProviderHealth: protectedProcedure
    .query(async () => {
      const registry = ComponentProviderRegistry.getInstance();
      return registry.performHealthCheck();
    }),

  // Component Definition endpoints
  createComponent: adminProcedure
    .input(createComponentSchema)
    .mutation(async ({ input }) => {
      try {
        const service = ComponentDefinitionService.getInstance();
        return await service.createComponentDefinition(input);
      } catch (error) {
        if (error instanceof Error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
          });
        }
        throw error;
      }
    }),

  updateComponent: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      data: updateComponentSchema,
    }))
    .mutation(async ({ input }) => {
      try {
        const service = ComponentDefinitionService.getInstance();
        return await service.updateComponentDefinition(input.id, input.data);
      } catch (error) {
        if (error instanceof Error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
          });
        }
        throw error;
      }
    }),

  deleteComponent: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      try {
        const service = ComponentDefinitionService.getInstance();
        await service.deleteComponentDefinition(input.id);
        return { success: true };
      } catch (error) {
        if (error instanceof Error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
          });
        }
        throw error;
      }
    }),

  getComponent: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const service = ComponentDefinitionService.getInstance();
      const component = await service.getComponentDefinition(input.id);
      
      if (!component) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Component definition not found',
        });
      }

      return component;
    }),

  listComponents: protectedProcedure
    .query(async () => {
      const service = ComponentDefinitionService.getInstance();
      return service.listComponentDefinitions();
    }),

  // Dynamic Component Registration endpoints
  registerComponent: adminProcedure
    .input(dynamicComponentRegistrationSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        if (!ctx.user.tenantId) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Tenant ID is required',
          });
        }

        // Check if component key already exists
        const existingComponent = await db.query.components.findFirst({
          where: eq(components.componentKey, input.componentKey)
        });

        if (existingComponent) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Component with key '${input.componentKey}' already exists`,
          });
        }

        // Create component metadata
        const metadata = {
          requiredConfigFields: input.requiredConfigFields,
          optionalConfigFields: input.optionalConfigFields,
          supportedPricingModels: input.supportedPricingModels,
          usageTrackingSupported: input.usageTrackingSupported,
          provisioningRequired: input.provisioningRequired,
          provisioningProvider: input.provisioningProvider,
          configFieldTypes: input.configFieldTypes || {},
          configFieldOptions: input.configFieldOptions || {},
          tags: input.tags,
          icon: input.icon,
        };

        // Insert the new component
        const [newComponent] = await db.insert(components)
          .values({
            componentKey: input.componentKey,
            name: input.name,
            description: input.description,
            version: '1.0.0',
            configuration: input.defaultConfiguration || {},
            metadata,
            isActive: input.isActive,
            tenantId: ctx.user.tenantId,
            createdAt: new Date(),
            updatedAt: new Date()
          } as typeof components.$inferInsert)
          .returning();

        return {
          success: true,
          component: newComponent,
          message: `Component '${input.name}' registered successfully`,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to register component',
        });
      }
    }),

  updateRegisteredComponent: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      data: componentRegistrationUpdateSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        if (!ctx.user.tenantId) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'Tenant ID is required',
          });
        }

        // Check if component exists and belongs to tenant
        const existingComponent = await db.query.components.findFirst({
          where: and(
            eq(components.id, input.id),
            eq(components.tenantId, ctx.user.tenantId)
          )
        });

        if (!existingComponent) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Component not found',
          });
        }

        // Update metadata if needed
        let metadata = existingComponent.metadata;
        if (input.data.requiredConfigFields || input.data.optionalConfigFields || 
            input.data.supportedPricingModels || input.data.usageTrackingSupported !== undefined ||
            input.data.provisioningRequired !== undefined || input.data.provisioningProvider ||
            input.data.configFieldTypes || input.data.configFieldOptions || 
            input.data.tags || input.data.icon) {
          
          metadata = {
            ...metadata,
            ...(input.data.requiredConfigFields && { requiredConfigFields: input.data.requiredConfigFields }),
            ...(input.data.optionalConfigFields && { optionalConfigFields: input.data.optionalConfigFields }),
            ...(input.data.supportedPricingModels && { supportedPricingModels: input.data.supportedPricingModels }),
            ...(input.data.usageTrackingSupported !== undefined && { usageTrackingSupported: input.data.usageTrackingSupported }),
            ...(input.data.provisioningRequired !== undefined && { provisioningRequired: input.data.provisioningRequired }),
            ...(input.data.provisioningProvider && { provisioningProvider: input.data.provisioningProvider }),
            ...(input.data.configFieldTypes && { configFieldTypes: input.data.configFieldTypes }),
            ...(input.data.configFieldOptions && { configFieldOptions: input.data.configFieldOptions }),
            ...(input.data.tags && { tags: input.data.tags }),
            ...(input.data.icon && { icon: input.data.icon }),
          };
        }

        // Update the component
        const [updatedComponent] = await db.update(components)
          .set({
            name: input.data.name || existingComponent.name,
            description: input.data.description || existingComponent.description,
            configuration: input.data.defaultConfiguration || existingComponent.configuration,
            metadata,
            isActive: input.data.isActive ?? existingComponent.isActive,
            updatedAt: new Date()
          } as Partial<typeof components.$inferInsert>)
          .where(eq(components.id, input.id))
          .returning();

        return {
          success: true,
          component: updatedComponent,
          message: `Component '${updatedComponent.name}' updated successfully`,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update component',
        });
      }
    }),

  validateComponentKey: adminProcedure
    .input(z.object({
      componentKey: z.string().min(2).max(50),
      excludeId: z.string().uuid().optional(),
    }))
    .query(async ({ input }) => {
      try {
        const whereCondition = input.excludeId 
          ? and(eq(components.componentKey, input.componentKey), eq(components.id, input.excludeId))
          : eq(components.componentKey, input.componentKey);

        const existingComponent = await db.query.components.findFirst({
          where: whereCondition
        });

        return {
          isAvailable: !existingComponent,
          message: existingComponent 
            ? `Component key '${input.componentKey}' is already in use`
            : `Component key '${input.componentKey}' is available`,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to validate component key',
        });
      }
    }),

  getComponentRegistrationStats: adminProcedure
    .query(async () => {
      try {
        const totalComponents = await db.query.components.findMany();
        const activeComponents = totalComponents.filter(c => c.isActive);
        const componentsByType = totalComponents.reduce((acc, component) => {
          acc[component.type] = (acc[component.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        return {
          total: totalComponents.length,
          active: activeComponents.length,
          inactive: totalComponents.length - activeComponents.length,
          byType: componentsByType,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to get component registration stats',
        });
      }
    }),

  // Public endpoint for customer storefront
  listPublicProducts: publicProcedure
    .input(z.object({
      category: z.string().optional(),
      sortBy: z.enum(['name', 'createdAt', 'sortOrder']).optional().default('sortOrder'),
      sortDirection: z.enum(['asc', 'desc']).optional().default('asc')
    }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [
        eq(products.isPublic, true),
        eq(products.isActive, true)
      ];

      if (input?.category) {
        conditions.push(eq(products.category, input.category));
      }

      const publicProducts = await db.query.products.findMany({
        where: and(...conditions),
        with: {
          components: {
            with: {
              component: true
            }
          },
          billingPlans: {
            where: eq(billingPlans.isActive, true)
          }
        },
        orderBy: input?.sortBy === 'name' 
          ? [products.name, input.sortDirection === 'asc' ? 'asc' : 'desc']
          : input?.sortBy === 'createdAt'
          ? [products.createdAt, input.sortDirection === 'asc' ? 'asc' : 'desc']
          : [products.sortOrder, input.sortDirection === 'asc' ? 'asc' : 'desc']
      });

      return publicProducts;
    }),

  // Product Management endpoints - Enhanced for ProductBuilder
  createProduct: requirePermission('catalog.create')
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      shortDescription: z.string().optional(),
      category: z.string().optional(),
      tags: z.array(z.string()).default([]),
      isActive: z.boolean().default(true),
      isPublic: z.boolean().default(false),
      sortOrder: z.number().default(0),
      trialPeriodDays: z.number().optional(),
      setupRequired: z.boolean().default(false),
      components: z.array(z.object({
        componentId: z.string().uuid(),
        pricing: z.enum(['FIXED', 'PER_UNIT', 'TIERED', 'VOLUME', 'USAGE_BASED']),
        unitPrice: z.string().optional(),
        includedUnits: z.number().optional(),
        configuration: z.record(z.string(), z.any()).optional(),
        tiers: z.array(z.object({
          from: z.number(),
          to: z.number().nullable(),
          price: z.string()
        })).optional()
      })).default([]),
      billingPlans: z.array(z.object({
        name: z.string().min(1),
        basePrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
        interval: z.enum(['MONTHLY', 'YEARLY', 'QUARTERLY']),
        setupFee: z.string().regex(/^\d+(\.\d{1,2})?$/).optional()
      })).min(1).default([{ name: 'Monthly', basePrice: '0.00', interval: 'MONTHLY' }])
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        // Start transaction
        return await db.transaction(async (tx) => {
          // Create product
          const [product] = await tx.insert(products).values({
            name: input.name,
            description: input.description,
            shortDescription: input.shortDescription,
            category: input.category,
            tags: input.tags,
            isActive: input.isActive,
            isPublic: input.isPublic,
            sortOrder: input.sortOrder,
            trialPeriodDays: input.trialPeriodDays,
            setupRequired: input.setupRequired,
            tenantId: ctx.tenantId!,
          }).returning();

          // Create product components if provided
          if (input.components.length > 0) {
            const componentInserts = input.components.map((comp, index) => ({
              productId: product.id,
              componentId: comp.componentId,
              pricingModel: comp.pricing,
              pricingDetails: {
                unitPrice: comp.unitPrice,
                includedUnits: comp.includedUnits,
                tiers: comp.tiers
              },
              configuration: comp.configuration || {},
              sortOrder: index,
              tenantId: ctx.tenantId!,
            }));
            await tx.insert(productComponents).values(componentInserts);
          }

          // Create billing plans
          const planInserts = input.billingPlans.map((plan, index) => ({
            productId: product.id,
            name: plan.name,
            basePrice: plan.basePrice,
            interval: plan.interval,
            setupFee: plan.setupFee || '0',
            isDefault: index === 0, // First plan is default
            isActive: true,
            sortOrder: index,
            tenantId: ctx.tenantId!,
          }));
          await tx.insert(billingPlans).values(planInserts);

          // Return complete product with relations
          const createdProduct = await tx.query.products.findFirst({
            where: eq(products.id, product.id),
            with: {
              components: {
                with: {
                  component: true
                }
              },
              billingPlans: true
            }
          });

          return createdProduct;
        });
      } catch (error) {
        logger.error('Failed to create product:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create product',
        });
      }
    }),

  updateProduct: requirePermission('catalog.update')
    .input(z.object({
      id: z.string().uuid(),
      data: z.object({
        name: z.string().optional(),
        description: z.string().optional(),
        shortDescription: z.string().optional(),
        category: z.string().optional(),
        tags: z.array(z.string()).optional(),
        isActive: z.boolean().optional(),
        isPublic: z.boolean().optional(),
        sortOrder: z.number().optional(),
        trialPeriodDays: z.number().optional(),
        setupRequired: z.boolean().optional(),
        components: z.array(z.object({
          componentId: z.string().uuid(),
          pricing: z.enum(['FIXED', 'PER_UNIT', 'TIERED', 'VOLUME', 'USAGE_BASED']),
          unitPrice: z.string().optional(),
          includedUnits: z.number().optional(),
          configuration: z.record(z.string(), z.any()).optional(),
          tiers: z.array(z.object({
            from: z.number(),
            to: z.number().nullable(),
            price: z.string()
          })).optional()
        })).optional(),
        billingPlans: z.array(z.object({
          name: z.string().min(1),
          basePrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
          interval: z.enum(['MONTHLY', 'YEARLY', 'QUARTERLY']),
          setupFee: z.string().regex(/^\d+(\.\d{1,2})?$/).optional()
        })).optional()
      })
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        // Check if product exists and belongs to tenant
        const existingProduct = await db.query.products.findFirst({
          where: and(
            eq(products.id, input.id),
            eq(products.tenantId, ctx.tenantId!)
          )
        });

        if (!existingProduct) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Product not found'
          });
        }

        // Start transaction
        return await db.transaction(async (tx) => {
          // Update product
          const [updatedProduct] = await tx.update(products)
            .set({
              ...input.data,
              updatedAt: new Date()
            })
            .where(eq(products.id, input.id))
            .returning();

          // Update components if provided
          if (input.data.components !== undefined) {
            // Delete existing components
            await tx.delete(productComponents).where(eq(productComponents.productId, input.id));
            
            // Insert new components
            if (input.data.components.length > 0) {
              const componentInserts = input.data.components.map((comp, index) => ({
                productId: input.id,
                componentId: comp.componentId,
                pricingModel: comp.pricing,
                pricingDetails: {
                  unitPrice: comp.unitPrice,
                  includedUnits: comp.includedUnits,
                  tiers: comp.tiers
                },
                configuration: comp.configuration || {},
                sortOrder: index,
                tenantId: ctx.tenantId!,
              }));
              await tx.insert(productComponents).values(componentInserts);
            }
          }

          // Update billing plans if provided
          if (input.data.billingPlans !== undefined) {
            // Delete existing billing plans
            await tx.delete(billingPlans).where(eq(billingPlans.productId, input.id));
            
            // Insert new billing plans
            if (input.data.billingPlans.length > 0) {
              const planInserts = input.data.billingPlans.map((plan, index) => ({
                productId: input.id,
                name: plan.name,
                basePrice: plan.basePrice,
                interval: plan.interval,
                setupFee: plan.setupFee || '0',
                isDefault: index === 0, // First plan is default
                isActive: true,
                sortOrder: index,
                tenantId: ctx.tenantId!,
              }));
              await tx.insert(billingPlans).values(planInserts);
            }
          }

          // Return complete updated product with relations
          const finalProduct = await tx.query.products.findFirst({
            where: eq(products.id, input.id),
            with: {
              components: {
                with: {
                  component: true
                }
              },
              billingPlans: true
            }
          });

          return finalProduct;
        });
      } catch (error) {
        logger.error('Failed to update product:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to update product',
        });
      }
    }),

  deleteProduct: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      try {
        const { ProductService } = await import('../lib/catalog/ProductService');
        const productService = ProductService.getInstance();
        await productService.deleteProduct(input.id);
        return { success: true };
      } catch (error) {
        if (error instanceof Error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
          });
        }
        throw error;
      }
    }),

  getProduct: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const product = await db.query.products.findFirst({
        where: and(
          eq(products.id, input.id),
          eq(products.tenantId, ctx.tenant.id)
        ),
        with: {
          components: {
            with: {
              component: true
            }
          },
          billingPlans: true
        }
      });

      if (!product) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Product not found'
        });
      }

      return product;
    }),

  listProducts: protectedProcedure
    .input(z.object({
      category: z.string().optional(),
      isActive: z.boolean().optional(),
      isPublic: z.boolean().optional(),
      sortBy: z.enum(['name', 'createdAt', 'sortOrder']).optional().default('sortOrder'),
      sortDirection: z.enum(['asc', 'desc']).optional().default('asc')
    }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [eq(products.tenantId, ctx.tenant.id)];
      
      if (input?.category) {
        conditions.push(eq(products.category, input.category));
      }
      if (input?.isActive !== undefined) {
        conditions.push(eq(products.isActive, input.isActive));
      }
      if (input?.isPublic !== undefined) {
        conditions.push(eq(products.isPublic, input.isPublic));
      }

      const productList = await db.query.products.findMany({
        where: and(...conditions),
        with: {
          components: {
            with: {
              component: true
            }
          },
          billingPlans: true
        },
        orderBy: input?.sortBy === 'name' 
          ? [products.name, input.sortDirection === 'asc' ? 'asc' : 'desc']
          : input?.sortBy === 'createdAt'
          ? [products.createdAt, input.sortDirection === 'asc' ? 'asc' : 'desc']
          : [products.sortOrder, input.sortDirection === 'asc' ? 'asc' : 'desc']
      });

      return productList;
    }),

  searchProducts: protectedProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input }) => {
      const { ProductService } = await import('../lib/catalog/ProductService');
      const productService = ProductService.getInstance();
      return productService.searchProducts(input.query);
    }),

  // Billing Plan endpoints
  createBillingPlan: adminProcedure
    .input(billingPlanCreateSchema)
    .mutation(async ({ input, ctx }) => {
      // Check if product exists and belongs to tenant
      const product = await db.query.products.findFirst({
        where: and(
          eq(products.id, input.productId),
          eq(products.tenantId, ctx.tenant.id)
        )
      });

      if (!product) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Product not found'
        });
      }

      // If this is set as default, unset any existing default plan
      if (input.isDefault) {
        await db.update(billingPlans)
          .set({ isDefault: false })
          .where(and(
            eq(billingPlans.productId, input.productId),
            eq(billingPlans.tenantId, ctx.tenant.id)
          ));
      }

      const [billingPlan] = await db.insert(billingPlans)
        .values({
          ...input,
          tenantId: ctx.tenant.id
        })
        .returning();

      return billingPlan;
    }),

  updateBillingPlan: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      data: billingPlanCreateSchema.partial().omit({ productId: true })
    }))
    .mutation(async ({ input, ctx }) => {
      const existingPlan = await db.query.billingPlans.findFirst({
        where: and(
          eq(billingPlans.id, input.id),
          eq(billingPlans.tenantId, ctx.tenant.id)
        )
      });

      if (!existingPlan) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Billing plan not found'
        });
      }

      // If setting as default, unset any existing default plan
      if (input.data.isDefault) {
        await db.update(billingPlans)
          .set({ isDefault: false })
          .where(and(
            eq(billingPlans.productId, existingPlan.productId),
            eq(billingPlans.tenantId, ctx.tenant.id),
            eq(billingPlans.id, input.id, true) // not equal to current plan
          ));
      }

      const [updatedPlan] = await db.update(billingPlans)
        .set({
          ...input.data,
          updatedAt: new Date()
        })
        .where(and(
          eq(billingPlans.id, input.id),
          eq(billingPlans.tenantId, ctx.tenant.id)
        ))
        .returning();

      return updatedPlan;
    }),

  deleteBillingPlan: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const existingPlan = await db.query.billingPlans.findFirst({
        where: and(
          eq(billingPlans.id, input.id),
          eq(billingPlans.tenantId, ctx.tenant.id)
        )
      });

      if (!existingPlan) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Billing plan not found'
        });
      }

      // Check if this is the only active plan for the product
      const activePlansCount = await db.query.billingPlans.findMany({
        where: and(
          eq(billingPlans.productId, existingPlan.productId),
          eq(billingPlans.tenantId, ctx.tenant.id),
          eq(billingPlans.isActive, true),
          eq(billingPlans.id, input.id, true) // not equal to current plan
        )
      }).then(plans => plans.length);

      if (activePlansCount === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot delete the only active billing plan for a product'
        });
      }

      await db.delete(billingPlans)
        .where(and(
          eq(billingPlans.id, input.id),
          eq(billingPlans.tenantId, ctx.tenant.id)
        ));

      return { success: true };
    }),

  getBillingPlan: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const billingPlan = await db.query.billingPlans.findFirst({
        where: and(
          eq(billingPlans.id, input.id),
          eq(billingPlans.tenantId, ctx.tenant.id)
        ),
        with: {
          product: true
        }
      });

      if (!billingPlan) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Billing plan not found'
        });
      }

      return billingPlan;
    }),

  listBillingPlans: protectedProcedure
    .input(z.object({
      productId: z.string().uuid().optional(),
      isActive: z.boolean().optional(),
      interval: z.enum(['MONTHLY', 'YEARLY', 'WEEKLY', 'DAILY', 'HOURLY']).optional(),
      sortBy: z.enum(['name', 'basePrice', 'sortOrder']).optional().default('sortOrder'),
      sortDirection: z.enum(['asc', 'desc']).optional().default('asc')
    }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [eq(billingPlans.tenantId, ctx.tenant.id)];

      if (input?.productId) {
        conditions.push(eq(billingPlans.productId, input.productId));
      }
      if (input?.isActive !== undefined) {
        conditions.push(eq(billingPlans.isActive, input.isActive));
      }
      if (input?.interval) {
        conditions.push(eq(billingPlans.interval, input.interval));
      }

      const plans = await db.query.billingPlans.findMany({
        where: and(...conditions),
        with: {
          product: true
        },
        orderBy: input?.sortBy === 'name'
          ? [billingPlans.name, input.sortDirection === 'asc' ? 'asc' : 'desc']
          : input?.sortBy === 'basePrice'
          ? [billingPlans.basePrice, input.sortDirection === 'asc' ? 'asc' : 'desc']
          : [billingPlans.sortOrder, input.sortDirection === 'asc' ? 'asc' : 'desc']
      });

      return plans;
    }),

  // Product Components
  productComponents: router({
    add: adminProcedure
      .input(productComponentCreateSchema)
      .mutation(async ({ input, ctx }) => {
        // Verify product exists and belongs to tenant
        const [product] = await db
          .select()
          .from(products)
          .where(and(
            eq(products.id, input.productId),
            eq(products.tenantId, ctx.user.tenantId)
          ));

        if (!product) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Product not found',
          });
        }

        // Verify component definition exists and belongs to tenant
        const [componentDef] = await db
          .select()
          .from(components)
          .where(and(
            eq(components.id, input.componentDefinitionId),
            eq(components.tenantId, ctx.user.tenantId)
          ));

        if (!componentDef) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Component definition not found',
          });
        }

        const [productComponent] = await db
          .insert(productComponents)
          .values({
            ...input,
            tenantId: ctx.user.tenantId,
          })
          .returning();

        return productComponent;
      }),

    update: adminProcedure
      .input(z.object({
        id: z.string().uuid(),
        data: productComponentCreateSchema.omit({ productId: true, componentDefinitionId: true }).partial(),
      }))
      .mutation(async ({ input, ctx }) => {
        const [productComponent] = await db
          .update(productComponents)
          .set({
            ...input.data,
            updatedAt: new Date(),
          })
          .where(and(
            eq(productComponents.id, input.id),
            eq(productComponents.tenantId, ctx.user.tenantId)
          ))
          .returning();

        if (!productComponent) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Product component not found',
          });
        }

        return productComponent;
      }),

    remove: adminProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        const [deleted] = await db
          .delete(productComponents)
          .where(and(
            eq(productComponents.id, input.id),
            eq(productComponents.tenantId, ctx.user.tenantId)
          ))
          .returning();

        if (!deleted) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Product component not found',
          });
        }

        return { success: true };
      }),
  }),

  // Billing Plans
  billingPlans: router({
    create: adminProcedure
      .input(billingPlanCreateSchema)
      .mutation(async ({ input, ctx }) => {
        // Verify product exists and belongs to tenant
        const [product] = await db
          .select()
          .from(products)
          .where(and(
            eq(products.id, input.productId),
            eq(products.tenantId, ctx.user.tenantId)
          ));

        if (!product) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Product not found',
          });
        }

        // If this is set as default, unset other defaults for this product
        if (input.isDefault) {
          await db
            .update(billingPlans)
            .set({ isDefault: false })
            .where(and(
              eq(billingPlans.productId, input.productId),
              eq(billingPlans.tenantId, ctx.user.tenantId)
            ));
        }

        const [billingPlan] = await db
          .insert(billingPlans)
          .values({
            ...input,
            tenantId: ctx.user.tenantId,
          })
          .returning();

        return billingPlan;
      }),

    update: adminProcedure
      .input(z.object({
        id: z.string().uuid(),
        data: billingPlanCreateSchema.omit({ productId: true }).partial(),
      }))
      .mutation(async ({ input, ctx }) => {
        // If setting as default, unset other defaults for this product
        if (input.data.isDefault) {
          const [currentPlan] = await db
            .select({ productId: billingPlans.productId })
            .from(billingPlans)
            .where(and(
              eq(billingPlans.id, input.id),
              eq(billingPlans.tenantId, ctx.user.tenantId)
            ));

          if (currentPlan) {
            await db
              .update(billingPlans)
              .set({ isDefault: false })
              .where(and(
                eq(billingPlans.productId, currentPlan.productId),
                eq(billingPlans.tenantId, ctx.user.tenantId)
              ));
          }
        }

        const [billingPlan] = await db
          .update(billingPlans)
          .set({
            ...input.data,
            updatedAt: new Date(),
          })
          .where(and(
            eq(billingPlans.id, input.id),
            eq(billingPlans.tenantId, ctx.user.tenantId)
          ))
          .returning();

        if (!billingPlan) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Billing plan not found',
          });
        }

        return billingPlan;
      }),

    delete: adminProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        const [deleted] = await db
          .delete(billingPlans)
          .where(and(
            eq(billingPlans.id, input.id),
            eq(billingPlans.tenantId, ctx.user.tenantId)
          ))
          .returning();

        if (!deleted) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Billing plan not found',
          });
        }

        return { success: true };
      }),
  }),

  // Usage reporting for usage-based billing
  reportUsage: protectedProcedure
    .input(usageReportSchema)
    .mutation(async ({ input, ctx }) => {
      const { subscribedComponentId, usageAmount, mode } = input;

      // Verify the subscribed component exists and belongs to the tenant
      const [subscribedComponent] = await db
        .select()
        .from(subscribedComponents)
        .where(and(
          eq(subscribedComponents.id, subscribedComponentId),
          eq(subscribedComponents.tenantId, ctx.user.tenantId)
        ));

      if (!subscribedComponent) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Subscribed component not found',
        });
      }

      // Update usage based on mode
      const currentUsage = parseFloat(subscribedComponent.currentUsage || '0');
      const newUsage = mode === 'increment' 
        ? currentUsage + usageAmount 
        : usageAmount;

      await db
        .update(subscribedComponents)
        .set({
          currentUsage: newUsage.toString(),
          updatedAt: new Date(),
        })
        .where(eq(subscribedComponents.id, subscribedComponentId));

      return { 
        success: true, 
        previousUsage: currentUsage, 
        newUsage 
      };
    }),
}); 