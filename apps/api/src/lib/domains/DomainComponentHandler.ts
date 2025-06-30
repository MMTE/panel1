import { ComponentHandler } from '../components/ComponentLifecycleService';
import { DomainManager } from './DomainManager';
import { Logger } from '../logging/Logger';
import { db } from '../../db';
import { subscribedComponents, domains } from '../../db/schema';
import { eq } from 'drizzle-orm';

/**
 * Domain Component Handler for managing domain registration and DNS services
 */
export class DomainComponentHandler implements ComponentHandler {
  private logger = Logger.getInstance();
  private domainManager = DomainManager.getInstance();

  /**
   * Provision a domain service
   */
  async provision(data: { subscribedComponentId: string; config: any; }): Promise<{ success: boolean; remoteId?: string; data?: any; }> {
    try {
      this.logger.info(`🌐 Provisioning domain service for component: ${data.subscribedComponentId}`);

      // Get the subscribed component details
      const [subscribedComponent] = await db
        .select()
        .from(subscribedComponents)
        .where(eq(subscribedComponents.id, data.subscribedComponentId))
        .limit(1);

      if (!subscribedComponent) {
        throw new Error(`Subscribed component not found: ${data.subscribedComponentId}`);
      }

      // Extract domain configuration
      const config = { ...data.config };
      const domainName = config.domainName;
      const registrarId = config.registrarId || 'default';
      const nameservers = config.nameservers || [];
      const autoRenew = config.autoRenew !== false;
      const years = config.years || 1;

      if (!domainName) {
        throw new Error('Domain name is required');
      }

      // Register the domain through the domain manager
      const registrationResult = await this.domainManager.registerDomain({
        domain: domainName,
        registrarId,
        years,
        nameservers,
        autoRenew,
        tenantId: subscribedComponent.tenantId,
        subscriptionId: subscribedComponent.subscriptionId
      });

      if (!registrationResult.success) {
        throw new Error(`Domain registration failed: ${registrationResult.error}`);
      }

      this.logger.info(`✅ Domain provisioning successful: ${domainName}`, { registrationResult });

      return {
        success: true,
        remoteId: registrationResult.domainId || domainName,
        data: {
          domainName,
          registrarId,
          nameservers,
          autoRenew,
          years,
          registrationResult
        }
      };

    } catch (error) {
      this.logger.error(`❌ Domain provisioning failed for component ${data.subscribedComponentId}:`, error);
      return {
        success: false,
        data: {
          error: error instanceof Error ? error.message : 'Unknown error occurred'
        }
      };
    }
  }

  /**
   * Suspend a domain service
   */
  async suspend(data: { subscribedComponentId: string; }): Promise<{ success: boolean; }> {
    try {
      this.logger.info(`⏸️ Domain suspension called for component: ${data.subscribedComponentId}`);
      
      // Get the subscribed component details
      const [subscribedComponent] = await db
        .select()
        .from(subscribedComponents)
        .where(eq(subscribedComponents.id, data.subscribedComponentId))
        .limit(1);

      if (!subscribedComponent) {
        this.logger.warn(`Subscribed component not found: ${data.subscribedComponentId}`);
        return { success: true };
      }

      // Find the domain record
      const [domain] = await db
        .select()
        .from(domains)
        .where(eq(domains.subscriptionId, subscribedComponent.subscriptionId))
        .limit(1);

      if (domain) {
        // For domain suspension, we might want to:
        // 1. Lock the domain at the registrar
        // 2. Point DNS to a suspended page
        const suspensionResult = await this.domainManager.suspendDomain(domain.name);
        
        if (!suspensionResult.success) {
          this.logger.warn(`Domain suspension partially failed: ${suspensionResult.error}`);
        }
      }

      this.logger.info(`Domain suspended for subscription: ${subscribedComponent.subscriptionId}`);
      return { success: true };
      
    } catch (error) {
      this.logger.error(`❌ Domain suspension failed for component ${data.subscribedComponentId}:`, error);
      return { success: false };
    }
  }

  /**
   * Unsuspend a domain service
   */
  async unsuspend(data: { subscribedComponentId: string; }): Promise<{ success: boolean; }> {
    try {
      this.logger.info(`▶️ Domain unsuspension called for component: ${data.subscribedComponentId}`);
      
      // Get the subscribed component details
      const [subscribedComponent] = await db
        .select()
        .from(subscribedComponents)
        .where(eq(subscribedComponents.id, data.subscribedComponentId))
        .limit(1);

      if (!subscribedComponent) {
        this.logger.warn(`Subscribed component not found: ${data.subscribedComponentId}`);
        return { success: true };
      }

      // Find the domain record
      const [domain] = await db
        .select()
        .from(domains)
        .where(eq(domains.subscriptionId, subscribedComponent.subscriptionId))
        .limit(1);

      if (domain) {
        // For domain unsuspension:
        // 1. Unlock the domain at the registrar
        // 2. Restore DNS settings
        const unsuspensionResult = await this.domainManager.unsuspendDomain(domain.name);
        
        if (!unsuspensionResult.success) {
          this.logger.warn(`Domain unsuspension partially failed: ${unsuspensionResult.error}`);
        }
      }

      this.logger.info(`Domain unsuspended for subscription: ${subscribedComponent.subscriptionId}`);
      return { success: true };
      
    } catch (error) {
      this.logger.error(`❌ Domain unsuspension failed for component ${data.subscribedComponentId}:`, error);
      return { success: false };
    }
  }

  /**
   * Terminate a domain service
   */
  async terminate(data: { subscribedComponentId: string; }): Promise<{ success: boolean; }> {
    try {
      this.logger.info(`🗑️ Domain termination called for component: ${data.subscribedComponentId}`);
      
      // Get the subscribed component details
      const [subscribedComponent] = await db
        .select()
        .from(subscribedComponents)
        .where(eq(subscribedComponents.id, data.subscribedComponentId))
        .limit(1);

      if (!subscribedComponent) {
        this.logger.warn(`Subscribed component not found: ${data.subscribedComponentId}`);
        return { success: true };
      }

      // Find the domain record
      const [domain] = await db
        .select()
        .from(domains)
        .where(eq(domains.subscriptionId, subscribedComponent.subscriptionId))
        .limit(1);

      if (domain) {
        // For domain termination:
        // 1. Cancel auto-renewal
        // 2. Mark domain as terminated
        // 3. Clean up DNS records
        const terminationResult = await this.domainManager.terminateDomain(domain.name);
        
        if (!terminationResult.success) {
          this.logger.warn(`Domain termination partially failed: ${terminationResult.error}`);
        }

        // Update the domain record
        await db
          .update(domains)
          .set({ 
            status: 'terminated',
            updatedAt: new Date()
          })
          .where(eq(domains.id, domain.id));
      }

      this.logger.info(`✅ Domain terminated for subscription: ${subscribedComponent.subscriptionId}`);
      return { success: true };
      
    } catch (error) {
      this.logger.error(`❌ Domain termination failed for component ${data.subscribedComponentId}:`, error);
      return { success: false };
    }
  }
}
