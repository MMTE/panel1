import { 
  ProvisioningPlugin, 
  ProvisioningAdapter, 
  ProvisioningConfig 
} from '../types';
import { CpanelAdapter } from '../adapters/CpanelAdapter';
import { ComponentHandler } from '../../components/ComponentLifecycleService';
import { db } from '../../../db';
import { subscribedComponents } from '../../../db/schema';
import { eq } from 'drizzle-orm';
import { Logger } from '../../logging/Logger';

export class CpanelPlugin implements ProvisioningPlugin, ComponentHandler {
  name = 'cPanel/WHM Plugin';
  type = 'cpanel';
  version = '1.0.0';
  description = 'cPanel and WHM hosting control panel integration';
  private logger = Logger.getInstance();

  async initialize(config: ProvisioningConfig): Promise<void> {
    console.log('🔌 Initializing cPanel plugin...');
    // Plugin initialization logic
  }

  async destroy(): Promise<void> {
    console.log('🔌 Destroying cPanel plugin...');
    // Cleanup logic
  }

  createAdapter(config: ProvisioningConfig): ProvisioningAdapter {
    return new CpanelAdapter(config);
  }

  getMetadata() {
    return {
      name: this.name,
      type: this.type,
      version: this.version,
      description: this.description,
      supportedOperations: [
        'provision',
        'suspend', 
        'unsuspend',
        'terminate',
        'modify',
        'backup',
        'restore'
      ],
      requiredConfig: [
        'hostname',
        'apiKey'
      ],
      optionalConfig: [
        'port',
        'username',
        'useSSL',
        'verifySSL',
        'timeout',
        'retries'
      ]
    };
  }

  // ComponentHandler interface implementation

  /**
   * Provision a new cPanel account for a subscribed component
   */
  async provision(data: { subscribedComponentId: string; config: any; }): Promise<{ success: boolean; remoteId?: string; data?: any; }> {
    try {
      this.logger.info(`🔧 Provisioning cPanel account for component: ${data.subscribedComponentId}`);

      // Fetch the subscribed component to get configuration
      const subscribedComponent = await db.query.subscribedComponents.findFirst({
        where: eq(subscribedComponents.id, data.subscribedComponentId),
        with: {
          component: true,
          subscription: {
            with: {
              client: true
            }
          }
        }
      });

      if (!subscribedComponent) {
        throw new Error(`Subscribed component not found: ${data.subscribedComponentId}`);
      }

      // Create a default cPanel adapter configuration
      // In a real implementation, this would come from the tenant's provisioning provider settings
      const adapterConfig: ProvisioningConfig = {
        hostname: process.env.CPANEL_WHM_HOST || 'localhost',
        port: parseInt(process.env.CPANEL_WHM_PORT || '2087'),
        username: process.env.CPANEL_WHM_USERNAME || 'root',
        apiKey: process.env.CPANEL_WHM_API_KEY || 'test-key',
        useSSL: true,
        verifySSL: false,
        timeout: 30000,
        retries: 3
      };

      const adapter = this.createAdapter(adapterConfig);

      // Prepare provisioning parameters
      const provisioningParams = {
        domain: subscribedComponent.subscription?.client?.email?.split('@')[1] || 'example.com',
        username: `user_${Date.now()}`,
        password: this.generateRandomPassword(),
        email: subscribedComponent.subscription?.client?.email || 'test@example.com',
        package: data.config.package || 'default',
        ...data.config
      };

      // Call the adapter's provision method
      const result = await adapter.provision(provisioningParams);

      if (result.success) {
        this.logger.info(`✅ Successfully provisioned cPanel account`, {
          subscribedComponentId: data.subscribedComponentId,
          remoteId: result.remoteId,
          username: provisioningParams.username
        });

        return {
          success: true,
          remoteId: result.remoteId,
          data: {
            username: provisioningParams.username,
            domain: provisioningParams.domain,
            package: provisioningParams.package,
            controlPanelUrl: `https://${adapterConfig.hostname}:2083`,
            ...result.data
          }
        };
      } else {
        this.logger.error(`❌ Failed to provision cPanel account`, {
          subscribedComponentId: data.subscribedComponentId,
          error: result.error
        });

        return {
          success: false,
          data: { error: result.error }
        };
      }

    } catch (error) {
      this.logger.error(`❌ Error provisioning cPanel account:`, error);
      return {
        success: false,
        data: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  /**
   * Suspend a cPanel account
   */
  async suspend(data: { subscribedComponentId: string; }): Promise<{ success: boolean; }> {
    try {
      this.logger.info(`⏸️ Suspending cPanel account for component: ${data.subscribedComponentId}`);

      // Fetch the subscribed component to get the remote ID
      const subscribedComponent = await db.query.subscribedComponents.findFirst({
        where: eq(subscribedComponents.id, data.subscribedComponentId)
      });

      if (!subscribedComponent) {
        throw new Error(`Subscribed component not found: ${data.subscribedComponentId}`);
      }

      const remoteId = subscribedComponent.metadata?.remoteId;
      if (!remoteId) {
        throw new Error('No remote ID found for component');
      }

      // Create adapter and suspend the account
      const adapterConfig: ProvisioningConfig = {
        hostname: process.env.CPANEL_WHM_HOST || 'localhost',
        port: parseInt(process.env.CPANEL_WHM_PORT || '2087'),
        username: process.env.CPANEL_WHM_USERNAME || 'root',
        apiKey: process.env.CPANEL_WHM_API_KEY || 'test-key',
        useSSL: true,
        verifySSL: false
      };

      const adapter = this.createAdapter(adapterConfig);
      const result = await adapter.suspend({ username: remoteId });

      this.logger.info(`✅ cPanel account suspension result:`, {
        subscribedComponentId: data.subscribedComponentId,
        success: result.success
      });

      return { success: result.success };

    } catch (error) {
      this.logger.error(`❌ Error suspending cPanel account:`, error);
      return { success: false };
    }
  }

  /**
   * Unsuspend a cPanel account
   */
  async unsuspend(data: { subscribedComponentId: string; }): Promise<{ success: boolean; }> {
    try {
      this.logger.info(`▶️ Unsuspending cPanel account for component: ${data.subscribedComponentId}`);

      const subscribedComponent = await db.query.subscribedComponents.findFirst({
        where: eq(subscribedComponents.id, data.subscribedComponentId)
      });

      if (!subscribedComponent) {
        throw new Error(`Subscribed component not found: ${data.subscribedComponentId}`);
      }

      const remoteId = subscribedComponent.metadata?.remoteId;
      if (!remoteId) {
        throw new Error('No remote ID found for component');
      }

      const adapterConfig: ProvisioningConfig = {
        hostname: process.env.CPANEL_WHM_HOST || 'localhost',
        port: parseInt(process.env.CPANEL_WHM_PORT || '2087'),
        username: process.env.CPANEL_WHM_USERNAME || 'root',
        apiKey: process.env.CPANEL_WHM_API_KEY || 'test-key',
        useSSL: true,
        verifySSL: false
      };

      const adapter = this.createAdapter(adapterConfig);
      const result = await adapter.unsuspend({ username: remoteId });

      this.logger.info(`✅ cPanel account unsuspension result:`, {
        subscribedComponentId: data.subscribedComponentId,
        success: result.success
      });

      return { success: result.success };

    } catch (error) {
      this.logger.error(`❌ Error unsuspending cPanel account:`, error);
      return { success: false };
    }
  }

  /**
   * Terminate a cPanel account
   */
  async terminate(data: { subscribedComponentId: string; }): Promise<{ success: boolean; }> {
    try {
      this.logger.info(`🗑️ Terminating cPanel account for component: ${data.subscribedComponentId}`);

      const subscribedComponent = await db.query.subscribedComponents.findFirst({
        where: eq(subscribedComponents.id, data.subscribedComponentId)
      });

      if (!subscribedComponent) {
        throw new Error(`Subscribed component not found: ${data.subscribedComponentId}`);
      }

      const remoteId = subscribedComponent.metadata?.remoteId;
      if (!remoteId) {
        throw new Error('No remote ID found for component');
      }

      const adapterConfig: ProvisioningConfig = {
        hostname: process.env.CPANEL_WHM_HOST || 'localhost',
        port: parseInt(process.env.CPANEL_WHM_PORT || '2087'),
        username: process.env.CPANEL_WHM_USERNAME || 'root',
        apiKey: process.env.CPANEL_WHM_API_KEY || 'test-key',
        useSSL: true,
        verifySSL: false
      };

      const adapter = this.createAdapter(adapterConfig);
      const result = await adapter.terminate({ username: remoteId });

      this.logger.info(`✅ cPanel account termination result:`, {
        subscribedComponentId: data.subscribedComponentId,
        success: result.success
      });

      return { success: result.success };

    } catch (error) {
      this.logger.error(`❌ Error terminating cPanel account:`, error);
      return { success: false };
    }
  }

  /**
   * Generate a random password for new accounts
   */
  private generateRandomPassword(length: number = 12): string {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
  }
} 