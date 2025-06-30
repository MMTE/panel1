import { EventService } from '../events/EventService';
import { logger } from '../logging/Logger';
import { AuditService } from '../audit/AuditService';
import { createClient } from 'redis';
import { emailService } from '../email/EmailService';

export class CatalogEventHandlers {
  private static instance: CatalogEventHandlers;
  private eventService: EventService;
  private auditService: AuditService;
  private redisClient: ReturnType<typeof createClient>;
  private readonly CACHE_TTL = 3600; // 1 hour in seconds

  private constructor() {
    this.eventService = new EventService();
    this.auditService = AuditService.getInstance();
    this.initializeRedis();
  }

  private async initializeRedis() {
    try {
      this.redisClient = createClient({
        socket: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
        },
        password: process.env.REDIS_PASSWORD,
      });

      await this.redisClient.connect();
      logger.info('✅ Redis client connected for catalog caching');
    } catch (error) {
      logger.warn('⚠️ Failed to initialize Redis client for catalog caching', { error });
    }
  }

  private async invalidateCache(key: string) {
    try {
      if (this.redisClient?.isOpen) {
        await this.redisClient.del(`catalog:${key}`);
        logger.info(`🗑️ Cache invalidated for key: ${key}`);
      }
    } catch (error) {
      logger.warn('⚠️ Failed to invalidate cache', { error, key });
    }
  }

  private async sendAdminNotification(subject: string, message: string, metadata?: Record<string, any>) {
    try {
      await emailService.sendEmail({
        to: process.env.ADMIN_EMAIL || 'admin@panel1.dev',
        subject: `[Panel1 Catalog] ${subject}`,
        html: `
          <h2>${subject}</h2>
          <p>${message}</p>
          ${metadata ? `<pre>${JSON.stringify(metadata, null, 2)}</pre>` : ''}
          <hr>
          <p><small>This is an automated notification from Panel1 Catalog System</small></p>
        `,
        text: `${subject}\n\n${message}\n\n${metadata ? JSON.stringify(metadata, null, 2) : ''}\n\nThis is an automated notification from Panel1 Catalog System`,
        metadata: {
          type: 'catalog_notification',
          ...metadata
        }
      });
    } catch (error) {
      logger.error('Failed to send admin notification', { error, subject, message });
    }
  }

  public static getInstance(): CatalogEventHandlers {
    if (!CatalogEventHandlers.instance) {
      CatalogEventHandlers.instance = new CatalogEventHandlers();
    }
    return CatalogEventHandlers.instance;
  }

  /**
   * Initialize event handlers for catalog events
   */
  public async initialize(): Promise<void> {
    logger.info('Initializing catalog event handlers...');

    // TODO: Integrate with EventProcessor instead of direct event listening
    // The EventService is a queue-based system, not an event emitter
    // Event handling should be done through the EventProcessor
    
    // For now, just initialize without registering listeners
    // This will be properly implemented when integrating with EventProcessor

    logger.info('Catalog event handlers initialized successfully (event registration temporarily disabled)');
  }

  /**
   * Handle component definition created event
   */
  private async handleComponentCreated(event: any): Promise<void> {
    try {
      const { componentId, componentKey, name } = event.data;

      logger.info('Component definition created', {
        componentId,
        componentKey,
        correlationId: event.metadata?.correlationId
      });

      await this.auditService.logActivity({
        tenantId: event.metadata?.tenantId || 'system',
        userId: event.metadata?.userId || 'system',
        action: 'component.created',
        resourceType: 'component_definition',
        resourceId: componentId,
        details: {
          componentKey,
          eventId: event.id
        }
      });

      // Invalidate relevant caches
      await this.invalidateCache('components:list');
      await this.invalidateCache(`component:${componentId}`);

      // Notify administrators
      await this.sendAdminNotification(
        'New Component Created',
        `A new component "${name}" (${componentKey}) has been created.`,
        {
          componentId,
          componentKey,
          name,
          createdBy: event.metadata?.userId || 'system'
        }
      );
    } catch (error) {
      logger.error('Failed to handle component created event', {
        error,
        eventData: event.data
      });
    }
  }

  /**
   * Handle component definition updated event
   */
  private async handleComponentUpdated(event: any): Promise<void> {
    try {
      const { componentId, componentKey, name, changes } = event.data;

      logger.info('Component definition updated', {
        componentId,
        componentKey,
        correlationId: event.metadata?.correlationId
      });

      await this.auditService.logActivity({
        tenantId: event.metadata?.tenantId || 'system',
        userId: event.metadata?.userId || 'system',
        action: 'component.updated',
        resourceType: 'component_definition',
        resourceId: componentId,
        details: {
          componentKey,
          eventId: event.id,
          changes
        }
      });

      // Invalidate relevant caches
      await this.invalidateCache('components:list');
      await this.invalidateCache(`component:${componentId}`);

      // Check if update affects existing products
      if (changes?.pricing || changes?.configuration || changes?.requirements) {
        await this.sendAdminNotification(
          'Component Updated - Review Required',
          `Component "${name}" (${componentKey}) has been updated with changes that may affect existing products.`,
          {
            componentId,
            componentKey,
            name,
            changes,
            updatedBy: event.metadata?.userId || 'system'
          }
        );
      }
    } catch (error) {
      logger.error('Failed to handle component updated event', {
        error,
        eventData: event.data
      });
    }
  }

  /**
   * Handle component definition deleted event
   */
  private async handleComponentDeleted(event: any): Promise<void> {
    try {
      const { componentId, componentKey, name, usedInProducts } = event.data;

      logger.info('Component definition deleted', {
        componentId,
        componentKey,
        correlationId: event.metadata?.correlationId
      });

      await this.auditService.logActivity({
        tenantId: event.metadata?.tenantId || 'system',
        userId: event.metadata?.userId || 'system',
        action: 'component.deleted',
        resourceType: 'component_definition',
        resourceId: componentId,
        details: {
          componentKey,
          eventId: event.id,
          usedInProducts
        }
      });

      // Invalidate relevant caches
      await this.invalidateCache('components:list');
      await this.invalidateCache(`component:${componentId}`);

      // Send warning if component was used in products
      if (usedInProducts?.length > 0) {
        await this.sendAdminNotification(
          'Component Deleted - Action Required',
          `Component "${name}" (${componentKey}) has been deleted but was used in ${usedInProducts.length} products. Immediate review required.`,
          {
            componentId,
            componentKey,
            name,
            usedInProducts,
            deletedBy: event.metadata?.userId || 'system'
          }
        );
      }
    } catch (error) {
      logger.error('Failed to handle component deleted event', {
        error,
        eventData: event.data
      });
    }
  }

  /**
   * Handle product created event
   */
  private async handleProductCreated(event: any): Promise<void> {
    try {
      const { productId, name, category } = event.data;

      logger.info('Product created', {
        productId,
        name,
        correlationId: event.metadata?.correlationId
      });

      await this.auditService.logActivity({
        tenantId: event.metadata?.tenantId || 'system',
        userId: event.metadata?.userId || 'system',
        action: 'product.created',
        resourceType: 'product',
        resourceId: productId,
        details: {
          name,
          category,
          eventId: event.id
        }
      });

      // Invalidate relevant caches
      await this.invalidateCache('products:list');
      await this.invalidateCache(`products:category:${category}`);
      await this.invalidateCache(`product:${productId}`);

      // Notify administrators about new product
      await this.sendAdminNotification(
        'New Product Created',
        `A new product "${name}" has been created in category "${category}".`,
        {
          productId,
          name,
          category,
          createdBy: event.metadata?.userId || 'system'
        }
      );
    } catch (error) {
      logger.error('Failed to handle product created event', {
        error,
        eventData: event.data
      });
    }
  }

  /**
   * Handle product updated event
   */
  private async handleProductUpdated(event: any): Promise<void> {
    try {
      const { productId, name, category, changes } = event.data;

      logger.info('Product updated', {
        productId,
        name,
        correlationId: event.metadata?.correlationId
      });

      await this.auditService.logActivity({
        tenantId: event.metadata?.tenantId || 'system',
        userId: event.metadata?.userId || 'system',
        action: 'product.updated',
        resourceType: 'product',
        resourceId: productId,
        details: {
          name,
          category,
          eventId: event.id,
          changes
        }
      });

      // Invalidate relevant caches
      await this.invalidateCache('products:list');
      await this.invalidateCache(`products:category:${category}`);
      await this.invalidateCache(`product:${productId}`);

      // Notify administrators about significant changes
      if (changes?.pricing || changes?.components || changes?.billingPlans) {
        await this.sendAdminNotification(
          'Product Updated - Review Required',
          `Product "${name}" has been updated with significant changes that may affect existing subscriptions.`,
          {
            productId,
            name,
            category,
            changes,
            updatedBy: event.metadata?.userId || 'system'
          }
        );
      }
    } catch (error) {
      logger.error('Failed to handle product updated event', {
        error,
        eventData: event.data
      });
    }
  }

  /**
   * Handle product deleted event
   */
  private async handleProductDeleted(event: any): Promise<void> {
    try {
      const { productId, name, category, activeSubscriptions } = event.data;

      logger.info('Product deleted', {
        productId,
        name,
        correlationId: event.metadata?.correlationId
      });

      await this.auditService.logActivity({
        tenantId: event.metadata?.tenantId || 'system',
        userId: event.metadata?.userId || 'system',
        action: 'product.deleted',
        resourceType: 'product',
        resourceId: productId,
        details: {
          name,
          category,
          eventId: event.id,
          activeSubscriptions
        }
      });

      // Invalidate relevant caches
      await this.invalidateCache('products:list');
      await this.invalidateCache(`products:category:${category}`);
      await this.invalidateCache(`product:${productId}`);

      // Send warning if product had active subscriptions
      if (activeSubscriptions > 0) {
        await this.sendAdminNotification(
          'Product Deleted - Action Required',
          `Product "${name}" has been deleted but had ${activeSubscriptions} active subscriptions. Immediate review required.`,
          {
            productId,
            name,
            category,
            activeSubscriptions,
            deletedBy: event.metadata?.userId || 'system'
          }
        );
      }
    } catch (error) {
      logger.error('Failed to handle product deleted event', {
        error,
        eventData: event.data
      });
    }
  }

  /**
   * Handle provider registered event
   */
  private async handleProviderRegistered(event: any): Promise<void> {
    try {
      const { providerId, providerKey, name } = event.data;

      logger.info('Provider registered', {
        providerId,
        providerKey,
        correlationId: event.metadata?.correlationId
      });

      await this.auditService.logActivity({
        tenantId: event.metadata?.tenantId || 'system',
        userId: event.metadata?.userId || 'system',
        action: 'provider.registered',
        resourceType: 'component_provider',
        resourceId: providerId,
        details: {
          providerKey,
          eventId: event.id
        }
      });

      // Invalidate relevant caches
      await this.invalidateCache('providers:list');
      await this.invalidateCache(`provider:${providerId}`);

      // Notify administrators about new provider
      await this.sendAdminNotification(
        'New Provider Registered',
        `A new component provider "${name}" (${providerKey}) has been registered.`,
        {
          providerId,
          providerKey,
          name,
          registeredBy: event.metadata?.userId || 'system'
        }
      );
    } catch (error) {
      logger.error('Failed to handle provider registered event', {
        error,
        eventData: event.data
      });
    }
  }

  /**
   * Handle provider health check failed event
   */
  private async handleProviderHealthCheckFailed(event: any): Promise<void> {
    try {
      const { providerId, providerKey, name, error } = event.data;

      logger.error('Provider health check failed', {
        providerId,
        providerKey,
        error,
        correlationId: event.metadata?.correlationId
      });

      await this.auditService.logActivity({
        tenantId: event.metadata?.tenantId || 'system',
        userId: event.metadata?.userId || 'system',
        action: 'provider.health_check_failed',
        resourceType: 'component_provider',
        resourceId: providerId,
        details: {
          providerKey,
          error,
          eventId: event.id
        }
      });

      // Invalidate provider health status cache
      await this.invalidateCache(`provider:health:${providerId}`);

      // Send urgent notification to administrators
      await this.sendAdminNotification(
        '🚨 Provider Health Check Failed',
        `Component provider "${name}" (${providerKey}) has failed its health check. Immediate attention required.`,
        {
          providerId,
          providerKey,
          name,
          error,
          timestamp: new Date().toISOString()
        }
      );
    } catch (error) {
      logger.error('Failed to handle provider health check failed event', {
        error,
        eventData: event.data
      });
    }
  }
} 