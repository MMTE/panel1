import { Worker, Job } from 'bullmq';
import { Logger } from '../logging/Logger';
import { db } from '../../db';
import { subscriptions, subscribedComponents, components, productComponents } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { PluginManager } from '../plugins/PluginManager';

/**
 * Interface that all component handlers must implement
 */
export interface ComponentHandler {
  provision(data: { subscribedComponentId: string; config: any; }): Promise<{ success: boolean; remoteId?: string; data?: any; }>;
  suspend(data: { subscribedComponentId: string; }): Promise<{ success: boolean; }>;
  unsuspend(data: { subscribedComponentId: string; }): Promise<{ success: boolean; }>;
  terminate(data: { subscribedComponentId: string; }): Promise<{ success: boolean; }>;
  // Add other lifecycle methods like modify() as needed in the future.
}

/**
 * Centralized component lifecycle service that processes events and delegates to handlers
 */
export class ComponentLifecycleService {
  private static instance: ComponentLifecycleService;
  private readonly handlers: Map<string, ComponentHandler> = new Map();
  private worker: Worker | null = null;
  private logger = Logger.getInstance();
  private readonly queueName = 'events';
  private pluginManager = PluginManager.getInstance();

  private constructor() {}

  static getInstance(): ComponentLifecycleService {
    if (!ComponentLifecycleService.instance) {
      ComponentLifecycleService.instance = new ComponentLifecycleService();
    }
    return ComponentLifecycleService.instance;
  }

  /**
   * Register a component handler for a specific provisioning provider
   */
  registerHandler(key: string, handler: ComponentHandler): void {
    this.handlers.set(key, handler);
    this.logger.info(`🔌 Registered component handler for provider: ${key}`);
  }

  /**
   * Get a registered component handler by provider key
   */
  getHandler(key: string): ComponentHandler | undefined {
    return this.handlers.get(key);
  }

  /**
   * Start the component lifecycle service
   */
  async start(): Promise<void> {
    // Initialize plugin-based handlers
    await this.initializePluginHandlers();
    await this.initializeWorker();
    this.logger.info('🚀 ComponentLifecycleService started successfully');
  }

  /**
   * Stop the component lifecycle service
   */
  async stop(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      this.logger.info('⏹️ ComponentLifecycleService stopped');
    }
  }

  /**
   * Initialize plugin-based component handlers
   */
  private async initializePluginHandlers(): Promise<void> {
    try {
      // Get all active plugins that implement ComponentHandler
      const plugins = await this.pluginManager.getActivePlugins();
      
      for (const plugin of plugins) {
        if (this.isComponentHandler(plugin)) {
          this.registerHandler(plugin.metadata.id, plugin);
          this.logger.info(`✅ Registered plugin as component handler: ${plugin.metadata.id}`);
        }
      }
    } catch (error) {
      this.logger.error('❌ Error initializing plugin handlers:', error);
    }
  }

  /**
   * Type guard to check if a plugin implements ComponentHandler
   */
  private isComponentHandler(plugin: any): plugin is ComponentHandler {
    return (
      typeof plugin.provision === 'function' &&
      typeof plugin.suspend === 'function' &&
      typeof plugin.unsuspend === 'function' &&
      typeof plugin.terminate === 'function'
    );
  }

  /**
   * Initialize the BullMQ worker to process events
   */
  private async initializeWorker(): Promise<void> {
    this.worker = new Worker(
      this.queueName,
      async (job: Job) => {
        try {
          this.logger.info(`📥 Processing event: ${job.name}`, { jobId: job.id, data: job.data });
          
          // Route the event to the appropriate handler based on job.name
          switch (job.name) {
            case 'subscription.activated':
              await this.handleSubscriptionActivated(job);
              break;
            case 'subscription.terminated':
              await this.handleSubscriptionTerminated(job);
              break;
            case 'subscription.suspended':
              await this.handleSubscriptionSuspended(job);
              break;
            case 'subscription.unsuspended':
              await this.handleSubscriptionUnsuspended(job);
              break;
            default:
              this.logger.info(`ℹ️ No handler for event: ${job.name}`);
          }
          
        } catch (error) {
          this.logger.error(`❌ Error processing event ${job.name}:`, error);
          throw error; // Re-throw to trigger BullMQ retry logic
        }
      },
      {
        connection: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD,
        },
        concurrency: 5, // Process up to 5 jobs concurrently
      }
    );

    this.worker.on('completed', (job) => {
      this.logger.info(`✅ Event processed successfully: ${job.name}`, { jobId: job.id });
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(`❌ Event processing failed: ${job?.name}`, { jobId: job?.id, error: err.message });
    });

    this.worker.on('error', (err) => {
      this.logger.error('❌ ComponentLifecycleService worker error:', err);
    });
  }

  /**
   * Handle subscription.activated event
   */
  private async handleSubscriptionActivated(job: Job): Promise<void> {
    const { subscriptionId } = job.data.payload;
    
    if (!subscriptionId) {
      throw new Error('Missing subscriptionId in subscription.activated event');
    }

    this.logger.info(`🔄 Processing subscription activation: ${subscriptionId}`);

    // Fetch subscription with its subscribed components and component definitions
    const subscription = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.id, subscriptionId),
      with: {
        // Note: We need to use the actual relation structure from the schema
      }
    });

    if (!subscription) {
      throw new Error(`Subscription not found: ${subscriptionId}`);
    }

    // Fetch subscribed components for this subscription
    const subscribedComponentsList = await db.query.subscribedComponents.findMany({
      where: eq(subscribedComponents.subscriptionId, subscriptionId),
      with: {
        component: true,
        productComponent: true,
      }
    });

    // Process each subscribed component
    for (const subscribedComponent of subscribedComponentsList) {
      try {
        const componentDefinition = subscribedComponent.component;
        
        // Check if provisioning is required for this component
        const provisioningRequired = componentDefinition.metadata?.provisioningRequired !== false;
        if (!provisioningRequired) {
          this.logger.info(`⏭️ Skipping provisioning for component ${componentDefinition.name} (not required)`);
          continue;
        }

        // Get the provisioning provider key
        const provisioningProvider = componentDefinition.metadata?.provisioningProvider || componentDefinition.componentKey;
        
        if (!provisioningProvider) {
          this.logger.warn(`⚠️ No provisioning provider specified for component: ${componentDefinition.name}`);
          continue;
        }

        // Get the handler for this provider
        const handler = this.handlers.get(provisioningProvider);
        if (!handler) {
          this.logger.warn(`⚠️ No handler registered for provider: ${provisioningProvider}`);
          continue;
        }

        this.logger.info(`🔧 Provisioning component: ${componentDefinition.name} using provider: ${provisioningProvider}`);

        // Call the handler's provision method
        const result = await handler.provision({
          subscribedComponentId: subscribedComponent.id,
          config: subscribedComponent.configuration || {}
        });

        // Update the subscribed component based on the result
        const updateData: any = {
          updatedAt: new Date(),
        };

        if (result.success) {
          updateData.metadata = {
            ...subscribedComponent.metadata,
            provisioningStatus: 'active',
            remoteId: result.remoteId,
            provisioningData: result.data,
            lastProvisionedAt: new Date(),
          };
          
          this.logger.info(`✅ Successfully provisioned component: ${componentDefinition.name}`, {
            subscribedComponentId: subscribedComponent.id,
            remoteId: result.remoteId
          });
        } else {
          updateData.metadata = {
            ...subscribedComponent.metadata,
            provisioningStatus: 'failed',
            lastProvisioningError: 'Provisioning failed',
            lastProvisioningAttempt: new Date(),
          };
          
          this.logger.error(`❌ Failed to provision component: ${componentDefinition.name}`, {
            subscribedComponentId: subscribedComponent.id
          });
        }

        // Update the database
        await db
          .update(subscribedComponents)
          .set(updateData)
          .where(eq(subscribedComponents.id, subscribedComponent.id));

      } catch (error) {
        this.logger.error(`❌ Error provisioning component ${subscribedComponent.component.name}:`, error);
        
        // Update component with error status
        await db
          .update(subscribedComponents)
          .set({
            metadata: {
              ...subscribedComponent.metadata,
              provisioningStatus: 'failed',
              lastProvisioningError: error instanceof Error ? error.message : 'Unknown error',
              lastProvisioningAttempt: new Date(),
            },
            updatedAt: new Date(),
          })
          .where(eq(subscribedComponents.id, subscribedComponent.id));
      }
    }

    this.logger.info(`✅ Completed subscription activation processing: ${subscriptionId}`);
  }

  /**
   * Handle subscription.terminated event
   */
  private async handleSubscriptionTerminated(job: Job): Promise<void> {
    const { subscriptionId } = job.data.payload;
    
    if (!subscriptionId) {
      throw new Error('Missing subscriptionId in subscription.terminated event');
    }

    this.logger.info(`🔄 Processing subscription termination: ${subscriptionId}`);

    // Fetch subscribed components for this subscription
    const subscribedComponentsList = await db.query.subscribedComponents.findMany({
      where: eq(subscribedComponents.subscriptionId, subscriptionId),
      with: {
        component: true,
        productComponent: true,
      }
    });

    // Process each subscribed component for termination
    for (const subscribedComponent of subscribedComponentsList) {
      try {
        const componentDefinition = subscribedComponent.component;
        const provisioningProvider = componentDefinition.metadata?.provisioningProvider || componentDefinition.componentKey;
        
        if (!provisioningProvider) {
          continue;
        }

        const handler = this.handlers.get(provisioningProvider);
        if (!handler) {
          this.logger.warn(`⚠️ No handler registered for provider: ${provisioningProvider}`);
          continue;
        }

        this.logger.info(`🗑️ Terminating component: ${componentDefinition.name} using provider: ${provisioningProvider}`);

        // Call the handler's terminate method
        const result = await handler.terminate({
          subscribedComponentId: subscribedComponent.id
        });

        // Update the subscribed component
        const updateData: any = {
          isActive: false,
          metadata: {
            ...subscribedComponent.metadata,
            provisioningStatus: result.success ? 'terminated' : 'termination_failed',
            terminatedAt: new Date(),
          },
          updatedAt: new Date(),
        };

        await db
          .update(subscribedComponents)
          .set(updateData)
          .where(eq(subscribedComponents.id, subscribedComponent.id));

        if (result.success) {
          this.logger.info(`✅ Successfully terminated component: ${componentDefinition.name}`);
        } else {
          this.logger.error(`❌ Failed to terminate component: ${componentDefinition.name}`);
        }

      } catch (error) {
        this.logger.error(`❌ Error terminating component ${subscribedComponent.component.name}:`, error);
      }
    }

    this.logger.info(`✅ Completed subscription termination processing: ${subscriptionId}`);
  }

  /**
   * Handle subscription.suspended event
   */
  private async handleSubscriptionSuspended(job: Job): Promise<void> {
    const { subscriptionId } = job.data.payload;
    
    if (!subscriptionId) {
      throw new Error('Missing subscriptionId in subscription.suspended event');
    }

    this.logger.info(`🔄 Processing subscription suspension: ${subscriptionId}`);

    // Similar logic to termination but calling suspend instead
    const subscribedComponentsList = await db.query.subscribedComponents.findMany({
      where: eq(subscribedComponents.subscriptionId, subscriptionId),
      with: {
        component: true,
        productComponent: true,
      }
    });

    for (const subscribedComponent of subscribedComponentsList) {
      try {
        const componentDefinition = subscribedComponent.component;
        const provisioningProvider = componentDefinition.metadata?.provisioningProvider || componentDefinition.componentKey;
        
        if (!provisioningProvider) {
          continue;
        }

        const handler = this.handlers.get(provisioningProvider);
        if (!handler) {
          continue;
        }

        const result = await handler.suspend({
          subscribedComponentId: subscribedComponent.id
        });

        await db
          .update(subscribedComponents)
          .set({
            metadata: {
              ...subscribedComponent.metadata,
              provisioningStatus: result.success ? 'suspended' : 'suspension_failed',
              suspendedAt: new Date(),
            },
            updatedAt: new Date(),
          })
          .where(eq(subscribedComponents.id, subscribedComponent.id));

      } catch (error) {
        this.logger.error(`❌ Error suspending component ${subscribedComponent.component.name}:`, error);
      }
    }

    this.logger.info(`✅ Completed subscription suspension processing: ${subscriptionId}`);
  }

  /**
   * Handle subscription.unsuspended event
   */
  private async handleSubscriptionUnsuspended(job: Job): Promise<void> {
    const { subscriptionId } = job.data.payload;
    
    if (!subscriptionId) {
      throw new Error('Missing subscriptionId in subscription.unsuspended event');
    }

    this.logger.info(`🔄 Processing subscription unsuspension: ${subscriptionId}`);

    const subscribedComponentsList = await db.query.subscribedComponents.findMany({
      where: eq(subscribedComponents.subscriptionId, subscriptionId),
      with: {
        component: true,
        productComponent: true,
      }
    });

    for (const subscribedComponent of subscribedComponentsList) {
      try {
        const componentDefinition = subscribedComponent.component;
        const provisioningProvider = componentDefinition.metadata?.provisioningProvider || componentDefinition.componentKey;
        
        if (!provisioningProvider) {
          continue;
        }

        const handler = this.handlers.get(provisioningProvider);
        if (!handler) {
          continue;
        }

        const result = await handler.unsuspend({
          subscribedComponentId: subscribedComponent.id
        });

        await db
          .update(subscribedComponents)
          .set({
            metadata: {
              ...subscribedComponent.metadata,
              provisioningStatus: result.success ? 'active' : 'unsuspension_failed',
              unsuspendedAt: new Date(),
            },
            updatedAt: new Date(),
          })
          .where(eq(subscribedComponents.id, subscribedComponent.id));

      } catch (error) {
        this.logger.error(`❌ Error unsuspending component ${subscribedComponent.component.name}:`, error);
      }
    }

    this.logger.info(`✅ Completed subscription unsuspension processing: ${subscriptionId}`);
  }
} 