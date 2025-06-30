import { db } from '../../db';
import { subscriptionComponents } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { EventService } from '../events/EventService';
import { ProvisioningManager } from '../provisioning/ProvisioningManager';
import { Logger } from '../logging/Logger';

export class ComponentManagementService {
  private static instance: ComponentManagementService;
  private eventService = EventService.getInstance();
  private provisioningManager = ProvisioningManager.getInstance();
  private logger = Logger.getInstance();

  private constructor() {}

  public static getInstance(): ComponentManagementService {
    if (!ComponentManagementService.instance) {
      ComponentManagementService.instance = new ComponentManagementService();
    }
    return ComponentManagementService.instance;
  }

  /**
   * Restart a component
   */
  public async restartComponent(componentId: string, tenantId: string): Promise<boolean> {
    try {
      // Get component details
      const [component] = await db
        .select()
        .from(subscriptionComponents)
        .where(and(
          eq(subscriptionComponents.id, componentId),
          eq(subscriptionComponents.tenantId, tenantId)
        ))
        .limit(1);

      if (!component) {
        throw new Error('Component not found');
      }

      // Emit restart event
      await this.eventService.emit('component.restart.requested', {
        componentId,
        tenantId,
        subscriptionId: component.subscriptionId,
        componentType: component.type,
      });

      // Update component status
      await db
        .update(subscriptionComponents)
        .set({
          provisioningStatus: 'RESTARTING',
          updatedAt: new Date(),
        })
        .where(and(
          eq(subscriptionComponents.id, componentId),
          eq(subscriptionComponents.tenantId, tenantId)
        ));

      // Queue restart task
      await this.provisioningManager.restartComponent(componentId, tenantId);

      return true;
    } catch (error) {
      this.logger.error('Failed to restart component', {
        error,
        componentId,
        tenantId,
      });
      throw error;
    }
  }

  /**
   * Update component configuration
   */
  public async updateConfiguration(
    componentId: string,
    tenantId: string,
    configuration: Record<string, any>
  ): Promise<boolean> {
    try {
      // Get component details
      const [component] = await db
        .select()
        .from(subscriptionComponents)
        .where(and(
          eq(subscriptionComponents.id, componentId),
          eq(subscriptionComponents.tenantId, tenantId)
        ))
        .limit(1);

      if (!component) {
        throw new Error('Component not found');
      }

      // Validate configuration against component type
      // TODO: Add validation logic based on component type

      // Emit configuration update event
      await this.eventService.emit('component.configuration.update.requested', {
        componentId,
        tenantId,
        subscriptionId: component.subscriptionId,
        componentType: component.type,
        configuration,
      });

      // Update component status and configuration
      await db
        .update(subscriptionComponents)
        .set({
          provisioningStatus: 'UPDATING',
          configuration,
          updatedAt: new Date(),
        })
        .where(and(
          eq(subscriptionComponents.id, componentId),
          eq(subscriptionComponents.tenantId, tenantId)
        ));

      // Queue configuration update task
      await this.provisioningManager.updateComponentConfiguration(
        componentId,
        tenantId,
        configuration
      );

      return true;
    } catch (error) {
      this.logger.error('Failed to update component configuration', {
        error,
        componentId,
        tenantId,
      });
      throw error;
    }
  }

  /**
   * Scale component resources
   */
  public async scaleComponent(
    componentId: string,
    tenantId: string,
    quantity: number
  ): Promise<boolean> {
    try {
      // Get component details
      const [component] = await db
        .select()
        .from(subscriptionComponents)
        .where(and(
          eq(subscriptionComponents.id, componentId),
          eq(subscriptionComponents.tenantId, tenantId)
        ))
        .limit(1);

      if (!component) {
        throw new Error('Component not found');
      }

      // Validate quantity
      if (quantity < 1) {
        throw new Error('Quantity must be greater than 0');
      }

      // Emit scale event
      await this.eventService.emit('component.scale.requested', {
        componentId,
        tenantId,
        subscriptionId: component.subscriptionId,
        componentType: component.type,
        fromQuantity: component.quantity,
        toQuantity: quantity,
      });

      // Update component status and quantity
      await db
        .update(subscriptionComponents)
        .set({
          provisioningStatus: 'SCALING',
          quantity,
          updatedAt: new Date(),
        })
        .where(and(
          eq(subscriptionComponents.id, componentId),
          eq(subscriptionComponents.tenantId, tenantId)
        ));

      // Queue scaling task
      await this.provisioningManager.scaleComponent(
        componentId,
        tenantId,
        quantity
      );

      return true;
    } catch (error) {
      this.logger.error('Failed to scale component', {
        error,
        componentId,
        tenantId,
      });
      throw error;
    }
  }

  /**
   * Get component status
   */
  public async getComponentStatus(componentId: string, tenantId: string): Promise<{
    status: string;
    lastUpdated: Date;
    metrics?: Record<string, any>;
  }> {
    try {
      const [component] = await db
        .select()
        .from(subscriptionComponents)
        .where(and(
          eq(subscriptionComponents.id, componentId),
          eq(subscriptionComponents.tenantId, tenantId)
        ))
        .limit(1);

      if (!component) {
        throw new Error('Component not found');
      }

      // Get real-time metrics from provisioning manager
      const metrics = await this.provisioningManager.getComponentMetrics(
        componentId,
        tenantId
      );

      return {
        status: component.provisioningStatus,
        lastUpdated: component.updatedAt,
        metrics,
      };
    } catch (error) {
      this.logger.error('Failed to get component status', {
        error,
        componentId,
        tenantId,
      });
      throw error;
    }
  }
} 