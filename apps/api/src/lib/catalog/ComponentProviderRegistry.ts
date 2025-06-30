import { ProvisioningAdapter } from '../provisioning/types';
import { logger } from '../logging/Logger';
import { PluginManager } from '../plugins/PluginManager';

export interface IComponentProvisioningModule extends ProvisioningAdapter {
  componentKey: string;
  name: string;
  version: string;
  description?: string;
  
  // Component-specific methods
  validateComponentConfig?(config: Record<string, any>): Promise<boolean>;
  getComponentMetadata?(): {
    supportedPricingModels: string[];
    requiredConfigFields: string[];
    optionalConfigFields: string[];
    usageTrackingSupported: boolean;
  };
}

export class ComponentProviderRegistry {
  private static instance: ComponentProviderRegistry;
  private providers: Map<string, IComponentProvisioningModule> = new Map();
  private initialized = false;

  private constructor() {}

  static getInstance(): ComponentProviderRegistry {
    if (!ComponentProviderRegistry.instance) {
      ComponentProviderRegistry.instance = new ComponentProviderRegistry();
    }
    return ComponentProviderRegistry.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info('🔄 Initializing Component Provider Registry...');

    try {
      // Register built-in component providers
      await this.registerBuiltInProviders();

      // TODO: Load plugin-based providers
      // await this.loadPluginProviders();

      this.initialized = true;
      logger.info('✅ Component Provider Registry initialized successfully', {
        providersCount: this.providers.size,
        providerKeys: Array.from(this.providers.keys()),
      });
    } catch (error) {
      logger.error('❌ Failed to initialize Component Provider Registry', { error });
      throw error;
    }
  }

  /**
   * Register a component provider
   */
  register(componentKey: string, providerModule: IComponentProvisioningModule): void {
    if (this.providers.has(componentKey)) {
      logger.warn('🔄 Overriding existing component provider', {
        componentKey,
        previousProvider: this.providers.get(componentKey)?.name,
        newProvider: providerModule.name,
      });
    }

    this.providers.set(componentKey, providerModule);
    logger.info('🔌 Registered component provider', {
      componentKey,
      providerName: providerModule.name,
      version: providerModule.version,
    });
  }

  /**
   * Get a provider for a specific component key
   */
  getProvider(componentKey: string): IComponentProvisioningModule | undefined {
    const provider = this.providers.get(componentKey);
    
    if (!provider) {
      logger.warn('❓ Component provider not found', { componentKey });
    }

    return provider;
  }

  /**
   * Check if a provider is registered for a component key
   */
  hasProvider(componentKey: string): boolean {
    return this.providers.has(componentKey);
  }

  /**
   * Get all registered component keys
   */
  getRegisteredComponents(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get metadata for all registered providers
   */
  getProvidersMetadata(): Array<{
    componentKey: string;
    name: string;
    version: string;
    description?: string;
    metadata?: any;
  }> {
    return Array.from(this.providers.entries()).map(([key, provider]) => ({
      componentKey: key,
      name: provider.name,
      version: provider.version,
      description: provider.description,
      metadata: provider.getComponentMetadata?.(),
    }));
  }

  /**
   * Unregister a component provider
   */
  unregister(componentKey: string): boolean {
    const existed = this.providers.has(componentKey);
    this.providers.delete(componentKey);
    
    if (existed) {
      logger.info('🗑️ Unregistered component provider', { componentKey });
    }
    
    return existed;
  }

  /**
   * Validate that all required providers are available for a product
   */
  async validateProductProviders(productComponents: Array<{
    componentKey: string;
    config?: Record<string, any>;
  }>): Promise<{
    valid: boolean;
    missingProviders: string[];
    configErrors: Array<{ componentKey: string; error: string }>;
  }> {
    const missingProviders: string[] = [];
    const configErrors: Array<{ componentKey: string; error: string }> = [];

    for (const component of productComponents) {
      const provider = this.getProvider(component.componentKey);
      
      if (!provider) {
        missingProviders.push(component.componentKey);
        continue;
      }

      // Validate component configuration if provider supports it
      if (provider.validateComponentConfig && component.config) {
        try {
          const isValid = await provider.validateComponentConfig(component.config);
          if (!isValid) {
            configErrors.push({
              componentKey: component.componentKey,
              error: 'Invalid component configuration',
            });
          }
        } catch (error) {
          configErrors.push({
            componentKey: component.componentKey,
            error: error instanceof Error ? error.message : 'Configuration validation failed',
          });
        }
      }
    }

    return {
      valid: missingProviders.length === 0 && configErrors.length === 0,
      missingProviders,
      configErrors,
    };
  }

  /**
   * Register built-in component providers
   */
  private async registerBuiltInProviders(): Promise<void> {
    // Get plugin instances
    const pluginManager = PluginManager.getInstance();
    const plugins = pluginManager.getPlugins();
    const domainPlugin = plugins.get('domain-plugin');
    const sslPlugin = plugins.get('ssl-plugin');

    // Example: Domain Provider
    if (domainPlugin) {
      this.register('domain_registration', {
        componentKey: 'domain_registration',
        name: 'Domain Registration Provider',
        version: '1.0.0',
        description: 'Provides domain registration services',
        provision: domainPlugin.provision.bind(domainPlugin),
        suspend: domainPlugin.suspend.bind(domainPlugin),
        unsuspend: domainPlugin.unsuspend.bind(domainPlugin),
        terminate: domainPlugin.terminate.bind(domainPlugin),
        healthCheck: domainPlugin.healthCheck.bind(domainPlugin),
        testConnection: async () => true,
        validateParameters: async (params) => !!(params.domainName),
        getComponentMetadata: () => ({
          supportedPricingModels: ['FIXED', 'PER_UNIT'],
          requiredConfigFields: ['domainName', 'registrationPeriod'],
          optionalConfigFields: ['nameservers', 'privacyProtection'],
          usageTrackingSupported: false,
        }),
        validateComponentConfig: async (config) => !!(config.domainName && config.registrationPeriod),
      });
    }

    // Example: SSL Certificate Provider
    if (sslPlugin) {
      this.register('ssl_certificate', {
        componentKey: 'ssl_certificate',
        name: 'SSL Certificate Provider',
        version: '1.0.0',
        description: 'Provides SSL certificates',
        provision: sslPlugin.provision.bind(sslPlugin),
        suspend: sslPlugin.suspend.bind(sslPlugin),
        unsuspend: sslPlugin.unsuspend.bind(sslPlugin),
        terminate: sslPlugin.terminate.bind(sslPlugin),
        healthCheck: sslPlugin.healthCheck.bind(sslPlugin),
        testConnection: async () => true,
        validateParameters: async (params) => !!(params.domain),
        getComponentMetadata: () => ({
          supportedPricingModels: ['FIXED', 'PER_UNIT'],
          requiredConfigFields: ['domain', 'certificateType'],
          optionalConfigFields: ['validityPeriod'],
          usageTrackingSupported: false,
        }),
        validateComponentConfig: async (config) => !!(config.domain && config.certificateType),
      });
    }

    logger.info('✅ Built-in component providers registered successfully');
  }

  /**
   * Health check for all registered providers
   */
  async performHealthCheck(): Promise<{
    healthy: boolean;
    results: Array<{
      componentKey: string;
      healthy: boolean;
      status: string;
      message?: string;
      responseTime?: number;
    }>;
  }> {
    const results = [];
    let overallHealthy = true;

    for (const [componentKey, provider] of this.providers.entries()) {
      try {
        const healthResult = await provider.healthCheck();
        results.push({
          componentKey,
          healthy: healthResult.healthy,
          status: healthResult.status,
          message: healthResult.message,
          responseTime: healthResult.responseTime,
        });

        if (!healthResult.healthy) {
          overallHealthy = false;
        }
      } catch (error) {
        results.push({
          componentKey,
          healthy: false,
          status: 'error',
          message: error instanceof Error ? error.message : 'Health check failed',
        });
        overallHealthy = false;
      }
    }

    return {
      healthy: overallHealthy,
      results,
    };
  }
}

// Export singleton instance
export const componentProviderRegistry = ComponentProviderRegistry.getInstance(); 