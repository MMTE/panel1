import { ComponentHandler } from '../components/ComponentLifecycleService';
import { SslCertificateManager } from './SslCertificateManager';
import { Logger } from '../logging/Logger';
import { db } from '../../db';
import { subscribedComponents, sslCertificates } from '../../db/schema';
import { eq } from 'drizzle-orm';

/**
 * SSL Component Handler for managing SSL certificates through the component system
 */
export class SslComponentHandler implements ComponentHandler {
  private logger = Logger.getInstance();
  private sslManager = SslCertificateManager.getInstance();

  /**
   * Provision an SSL certificate
   */
  async provision(data: { subscribedComponentId: string; config: any; }): Promise<{ success: boolean; remoteId?: string; data?: any; }> {
    try {
      this.logger.info(`🔒 Provisioning SSL certificate for component: ${data.subscribedComponentId}`);

      // Get the subscribed component details
      const [subscribedComponent] = await db
        .select()
        .from(subscribedComponents)
        .where(eq(subscribedComponents.id, data.subscribedComponentId))
        .limit(1);

      if (!subscribedComponent) {
        throw new Error(`Subscribed component not found: ${data.subscribedComponentId}`);
      }

      // Extract SSL configuration
      const config = { ...data.config };
      const domain = config.domain;
      const certificateType = config.certificateType || 'domain-validated';
      const validityPeriod = config.validityPeriod || 365;
      const autoRenew = config.autoRenew !== false;

      if (!domain) {
        throw new Error('Domain is required for SSL certificate');
      }

      // Issue the certificate through the SSL manager
      const issuanceResult = await this.sslManager.issueCertificate({
        domain,
        certificateType,
        validityPeriod,
        autoRenew,
        tenantId: subscribedComponent.tenantId,
        subscriptionId: subscribedComponent.subscriptionId
      });

      if (!issuanceResult.success) {
        throw new Error(`SSL certificate issuance failed: ${issuanceResult.error}`);
      }

      this.logger.info(`✅ SSL certificate provisioning successful: ${domain}`, { issuanceResult });

      return {
        success: true,
        remoteId: issuanceResult.certificateId || domain,
        data: {
          domain,
          certificateType,
          validityPeriod,
          autoRenew,
          issuanceResult
        }
      };

    } catch (error) {
      this.logger.error(`❌ SSL certificate provisioning failed for component ${data.subscribedComponentId}:`, error);
      return {
        success: false,
        data: {
          error: error instanceof Error ? error.message : 'Unknown error occurred'
        }
      };
    }
  }

  /**
   * Suspend an SSL certificate
   */
  async suspend(data: { subscribedComponentId: string; }): Promise<{ success: boolean; }> {
    try {
      this.logger.info(`⏸️ SSL certificate suspension called for component: ${data.subscribedComponentId}`);
      
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

      // Find the SSL certificate record
      const [certificate] = await db
        .select()
        .from(sslCertificates)
        .where(eq(sslCertificates.subscriptionId, subscribedComponent.subscriptionId))
        .limit(1);

      if (certificate) {
        // For SSL suspension, we might want to:
        // 1. Revoke the certificate
        // 2. Remove it from the server
        const suspensionResult = await this.sslManager.revokeCertificate(certificate.domain);
        
        if (!suspensionResult.success) {
          this.logger.warn(`SSL certificate suspension partially failed: ${suspensionResult.error}`);
        }
      }

      this.logger.info(`SSL certificate suspended for subscription: ${subscribedComponent.subscriptionId}`);
      return { success: true };
      
    } catch (error) {
      this.logger.error(`❌ SSL certificate suspension failed for component ${data.subscribedComponentId}:`, error);
      return { success: false };
    }
  }

  /**
   * Unsuspend an SSL certificate
   */
  async unsuspend(data: { subscribedComponentId: string; }): Promise<{ success: boolean; }> {
    try {
      this.logger.info(`▶️ SSL certificate unsuspension called for component: ${data.subscribedComponentId}`);
      
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

      // Find the SSL certificate record
      const [certificate] = await db
        .select()
        .from(sslCertificates)
        .where(eq(sslCertificates.subscriptionId, subscribedComponent.subscriptionId))
        .limit(1);

      if (certificate) {
        // For SSL unsuspension:
        // 1. Re-issue the certificate
        // 2. Install it on the server
        const reissuanceResult = await this.sslManager.reissueCertificate(certificate.domain);
        
        if (!reissuanceResult.success) {
          this.logger.warn(`SSL certificate unsuspension partially failed: ${reissuanceResult.error}`);
        }
      }

      this.logger.info(`SSL certificate unsuspended for subscription: ${subscribedComponent.subscriptionId}`);
      return { success: true };
      
    } catch (error) {
      this.logger.error(`❌ SSL certificate unsuspension failed for component ${data.subscribedComponentId}:`, error);
      return { success: false };
    }
  }

  /**
   * Terminate an SSL certificate
   */
  async terminate(data: { subscribedComponentId: string; }): Promise<{ success: boolean; }> {
    try {
      this.logger.info(`🗑️ SSL certificate termination called for component: ${data.subscribedComponentId}`);
      
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

      // Find the SSL certificate record
      const [certificate] = await db
        .select()
        .from(sslCertificates)
        .where(eq(sslCertificates.subscriptionId, subscribedComponent.subscriptionId))
        .limit(1);

      if (certificate) {
        // For SSL termination:
        // 1. Revoke the certificate
        // 2. Remove it from servers
        // 3. Clean up database records
        const terminationResult = await this.sslManager.revokeCertificate(certificate.domain);
        
        if (!terminationResult.success) {
          this.logger.warn(`SSL certificate termination partially failed: ${terminationResult.error}`);
        }

        // Update the certificate record
        await db
          .update(sslCertificates)
          .set({ 
            status: 'revoked',
            updatedAt: new Date()
          })
          .where(eq(sslCertificates.id, certificate.id));
      }

      this.logger.info(`✅ SSL certificate terminated for subscription: ${subscribedComponent.subscriptionId}`);
      return { success: true };
      
    } catch (error) {
      this.logger.error(`❌ SSL certificate termination failed for component ${data.subscribedComponentId}:`, error);
      return { success: false };
    }
  }
} 