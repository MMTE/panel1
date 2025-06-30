import { db } from '../../db';
import { logger } from '../logging/Logger';
import { EventService } from '../events/EventService';
import { ComponentDefinitionService, IComponentDefinition } from './ComponentDefinitionService';
import { and, eq } from 'drizzle-orm';
import { products, productComponents, billingPlans } from '../../db/schema/catalog';
import { NewProduct, NewProductComponent, NewBillingPlan, Product } from '../../db/schema';

export interface IProduct {
  id: number;
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
  components?: IProductComponent[];
  billingPlans?: IBillingPlan[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IProductComponent {
  id?: number;
  productId?: number;
  componentId: number;
  pricingModel: string;
  pricingDetails?: Record<string, any>;
  configuration?: Record<string, any>;
  sortOrder: number;
}

export interface IBillingPlan {
  id?: number;
  productId?: number;
  name: string;
  basePrice: string;
  interval: string;
  setupFee?: string;
  isActive: boolean;
  sortOrder: number;
}

export interface ICreateProductParams {
  name: string;
  description?: string;
  shortDescription?: string;
  category?: string;
  tags?: string[];
  isActive?: boolean;
  isPublic?: boolean;
  sortOrder?: number;
  trialPeriodDays?: number;
  setupRequired?: boolean;
  components?: Omit<IProductComponent, 'id' | 'productId'>[];
  billingPlans?: Omit<IBillingPlan, 'id' | 'productId'>[];
}

export interface IUpdateProductParams {
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
  components?: Omit<IProductComponent, 'id' | 'productId'>[];
  billingPlans?: Omit<IBillingPlan, 'id' | 'productId'>[];
}

export class ProductService {
  private static instance: ProductService;
  private eventService: EventService;
  private componentService: ComponentDefinitionService;

  private constructor() {
    this.eventService = new EventService();
    this.componentService = ComponentDefinitionService.getInstance();
  }

  static getInstance(): ProductService {
    if (!ProductService.instance) {
      ProductService.instance = new ProductService();
    }
    return ProductService.instance;
  }

  /**
   * Create a new product
   */
  async createProduct(params: ICreateProductParams): Promise<IProduct> {
    try {
      // Validate components if provided
      if (params.components && params.components.length > 0) {
        await this.validateProductComponents(params.components);
      }

      const [product] = await db.insert(products).values({
        name: params.name,
        description: params.description,
        shortDescription: params.shortDescription,
        category: params.category,
        tags: params.tags || [],
        isActive: params.isActive ?? true,
        isPublic: params.isPublic ?? false,
        sortOrder: params.sortOrder ?? 0,
        trialPeriodDays: params.trialPeriodDays,
        setupRequired: params.setupRequired ?? false,
      }).returning();

      // Create product components if provided
      if (params.components && params.components.length > 0) {
        const componentInserts = params.components.map(comp => ({
          productId: product.id,
          componentId: comp.componentId,
          pricingModel: comp.pricingModel,
          pricingDetails: comp.pricingDetails,
          configuration: comp.configuration,
          sortOrder: comp.sortOrder
        }));
        await db.insert(productComponents).values(componentInserts);
      }

      // Create billing plans if provided
      if (params.billingPlans && params.billingPlans.length > 0) {
        const planInserts = params.billingPlans.map(plan => ({
          productId: product.id,
          name: plan.name,
          basePrice: plan.basePrice,
          interval: plan.interval,
          setupFee: plan.setupFee,
          isActive: plan.isActive,
          sortOrder: plan.sortOrder
        }));
        await db.insert(billingPlans).values(planInserts);
      }

      const productData = await this.getProduct(product.id);
      if (!productData) {
        throw new Error('Failed to retrieve created product');
      }

      this.eventService.emit('PRODUCT_CREATED', {
        productId: productData.id,
        name: productData.name,
        category: productData.category
      });

      return productData;
    } catch (error) {
      logger.error('Failed to create product', { error, params });
      throw error;
    }
  }

  /**
   * Update an existing product
   */
  async updateProduct(id: number, params: IUpdateProductParams): Promise<IProduct> {
    const existingProduct = await this.getProduct(id);
    if (!existingProduct) {
      throw new Error(`Product not found: ${id}`);
    }

    try {
      // Validate components if provided
      if (params.components && params.components.length > 0) {
        await this.validateProductComponents(params.components);
      }

      // Update product details
      await db.update(products)
        .set({
          name: params.name ?? existingProduct.name,
          description: params.description ?? existingProduct.description,
          shortDescription: params.shortDescription ?? existingProduct.shortDescription,
          category: params.category ?? existingProduct.category,
          tags: params.tags ?? existingProduct.tags,
          isActive: params.isActive ?? existingProduct.isActive,
          isPublic: params.isPublic ?? existingProduct.isPublic,
          sortOrder: params.sortOrder ?? existingProduct.sortOrder,
          trialPeriodDays: params.trialPeriodDays ?? existingProduct.trialPeriodDays,
          setupRequired: params.setupRequired ?? existingProduct.setupRequired,
          updatedAt: new Date()
        })
        .where(eq(products.id, id));

      // Update components if provided
      if (params.components !== undefined) {
        // Delete existing components
        await db.delete(productComponents).where(eq(productComponents.productId, id));
        
        // Insert new components
        if (params.components.length > 0) {
          const componentInserts = params.components.map(comp => ({
            productId: id,
            componentId: comp.componentId,
            pricingModel: comp.pricingModel,
            pricingDetails: comp.pricingDetails,
            configuration: comp.configuration,
            sortOrder: comp.sortOrder
          }));
          await db.insert(productComponents).values(componentInserts);
        }
      }

      // Update billing plans if provided
      if (params.billingPlans !== undefined) {
        // Delete existing plans
        await db.delete(billingPlans).where(eq(billingPlans.productId, id));
        
        // Insert new plans
        if (params.billingPlans.length > 0) {
          const planInserts = params.billingPlans.map(plan => ({
            productId: id,
            name: plan.name,
            basePrice: plan.basePrice,
            interval: plan.interval,
            setupFee: plan.setupFee,
            isActive: plan.isActive,
            sortOrder: plan.sortOrder
          }));
          await db.insert(billingPlans).values(planInserts);
        }
      }

      const productData = await this.getProduct(id);
      if (!productData) {
        throw new Error('Failed to retrieve updated product');
      }

      this.eventService.emit('PRODUCT_UPDATED', {
        productId: productData.id,
        name: productData.name,
        category: productData.category
      });

      return productData;
    } catch (error) {
      logger.error('Failed to update product', { error, id, params });
      throw error;
    }
  }

  /**
   * Get a product by ID with components and billing plans
   */
  async getProduct(id: number): Promise<IProduct | null> {
    try {
      const product = await db.query.products.findFirst({
        where: eq(products.id, id),
        with: {
          components: true,
          billingPlans: true
        }
      });

      if (!product) {
        return null;
      }

      return {
        ...product,
        tags: product.tags as string[] || [],
        createdAt: new Date(product.createdAt || new Date()),
        updatedAt: new Date(product.updatedAt || new Date())
      };
    } catch (error) {
      logger.error('Failed to get product', { error, id });
      throw error;
    }
  }

  /**
   * List all products with optional filters
   */
  async listProducts(filters?: {
    category?: string;
    isActive?: boolean;
    isPublic?: boolean;
  }): Promise<IProduct[]> {
    try {
      const productsList = await db.query.products.findMany({
        with: {
          components: true,
          billingPlans: true
        }
      });

      let filteredProducts = productsList;

      if (filters) {
        if (filters.category) {
          filteredProducts = filteredProducts.filter(p => p.category === filters.category);
        }
        if (filters.isActive !== undefined) {
          filteredProducts = filteredProducts.filter(p => p.isActive === filters.isActive);
        }
        if (filters.isPublic !== undefined) {
          filteredProducts = filteredProducts.filter(p => p.isPublic === filters.isPublic);
        }
      }

      return filteredProducts.map(product => ({
        ...product,
        tags: product.tags as string[] || [],
        createdAt: new Date(product.createdAt || new Date()),
        updatedAt: new Date(product.updatedAt || new Date())
      }));
    } catch (error) {
      logger.error('Failed to list products', { error, filters });
      throw error;
    }
  }

  /**
   * Delete a product
   */
  async deleteProduct(id: number): Promise<void> {
    try {
      const product = await this.getProduct(id);
      if (!product) {
        throw new Error(`Product not found: ${id}`);
      }

      // Delete the product (components and billing plans will be cascade deleted)
      await db.delete(products).where(eq(products.id, id));

      this.eventService.emit('PRODUCT_DELETED', {
        productId: id,
        name: product.name,
        category: product.category
      });
    } catch (error) {
      logger.error('Failed to delete product', { error, id });
      throw error;
    }
  }

  /**
   * Validate product components
   */
  private async validateProductComponents(components: Omit<IProductComponent, 'id' | 'productId'>[]): Promise<void> {
    for (const component of components) {
      // Check if component exists
      const componentDef = await this.componentService.getComponentDefinition(component.componentId.toString());
      if (!componentDef) {
        throw new Error(`Component definition not found: ${component.componentId}`);
      }

      // Validate that the component is active
      if (!componentDef.isActive) {
        throw new Error(`Cannot use inactive component: ${componentDef.name}`);
      }

      // Validate pricing model
      const validPricingModels = ['FIXED', 'PER_UNIT', 'TIERED', 'VOLUME', 'USAGE_BASED'];
      if (!validPricingModels.includes(component.pricingModel)) {
        throw new Error(`Invalid pricing model: ${component.pricingModel}`);
      }
    }
  }

  /**
   * Get products by category
   */
  async getProductsByCategory(category: string): Promise<IProduct[]> {
    return this.listProducts({ category, isActive: true, isPublic: true });
  }

  /**
   * Search products by name or description
   */
  async searchProducts(query: string): Promise<IProduct[]> {
    const allProducts = await this.listProducts({ isActive: true, isPublic: true });
    
    const searchTerm = query.toLowerCase();
    return allProducts.filter(product => 
      product.name.toLowerCase().includes(searchTerm) ||
      product.description?.toLowerCase().includes(searchTerm) ||
      product.shortDescription?.toLowerCase().includes(searchTerm) ||
      product.tags.some(tag => tag.toLowerCase().includes(searchTerm))
    );
  }
} 