import { db } from '../../../db';
type Database = typeof db;
import { PaymentGateway, PaymentContext, HealthCheckResult } from '../interfaces/PaymentGateway';
import { paymentGatewayConfigs, PaymentGatewayConfig, payments } from '../../../db/schema';
import { eq, and, sql, count, sum } from 'drizzle-orm';
import { encryptionService } from '../security/EncryptionService';

/**
 * Payment Gateway Manager
 * Central orchestrator for all payment gateways
 */
export class PaymentGatewayManager {
  private gateways = new Map<string, PaymentGateway>();
  private tenantConfigs = new Map<string, PaymentGatewayConfig[]>();
  private initialized = false;

  constructor(private db: Database) {}

  /**
   * Initialize the gateway manager and load all gateways
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('🔄 Initializing Payment Gateway Manager...');

    // Load tenant configurations from database
    await this.loadTenantConfigurations();

    this.initialized = true;
    console.log('✅ Payment Gateway Manager initialized');
  }

  /**
   * Register a payment gateway
   */
  async registerGateway(gateway: PaymentGateway): Promise<void> {
    console.log(`📝 Registering gateway: ${gateway.name}`);
    
    // Store the gateway instance
    this.gateways.set(gateway.name, gateway);
    
    console.log(`✅ Gateway registered: ${gateway.displayName}`);
  }

  /**
   * Get all registered gateways
   */
  getAllGateways(): PaymentGateway[] {
    return Array.from(this.gateways.values());
  }

  /**
   * Get a specific gateway by name
   */
  getGateway(name: string): PaymentGateway | undefined {
    return this.gateways.get(name);
  }

  /**
   * Get available gateways for a tenant
   */
  async getAvailableGateways(tenantId: string): Promise<PaymentGateway[]> {
    const tenantGatewayConfigs = await this.getTenantGatewayConfigs(tenantId);
    
    return tenantGatewayConfigs
      .filter(config => config.isActive && config.status === 'ACTIVE')
      .sort((a, b) => (b.priority || 1) - (a.priority || 1)) // Higher priority first
      .map(config => this.gateways.get(config.gatewayName))
      .filter((gateway): gateway is PaymentGateway => gateway !== undefined);
  }

  /**
   * Get the best gateway for a payment context
   */
  async getBestGateway(context: PaymentContext): Promise<PaymentGateway> {
    const availableGateways = await this.getAvailableGateways(context.tenantId);
    
    if (availableGateways.length === 0) {
      throw new Error(`No payment gateways configured for tenant ${context.tenantId}`);
    }

    // Find gateways that support the currency
    const currencySupportedGateways = availableGateways.filter(gateway =>
      gateway.supportedCurrencies.includes(context.currency.toUpperCase())
    );

    if (currencySupportedGateways.length === 0) {
      throw new Error(`No payment gateways support currency ${context.currency}`);
    }

    // Find gateways that support the country (if specified)
    let countryFilteredGateways = currencySupportedGateways;
    if (context.billingCountry) {
      const countrySupported = currencySupportedGateways.filter(gateway =>
        gateway.supportedCountries.includes(context.billingCountry!)
      );
      
      if (countrySupported.length > 0) {
        countryFilteredGateways = countrySupported;
      }
    }

    // For now, return the first suitable gateway
    // TODO: Implement smart selection based on success rates, fees, etc.
    return countryFilteredGateways[0];
  }

  /**
   * Get gateway configuration for a tenant
   */
  async getGatewayConfig(tenantId: string, gatewayName: string): Promise<PaymentGatewayConfig | undefined> {
    const configs = await this.getTenantGatewayConfigs(tenantId);
    return configs.find(config => config.gatewayName === gatewayName);
  }

  /**
   * Configure a gateway for a tenant
   */
  async configureGateway(
    tenantId: string,
    gatewayName: string,
    config: {
      displayName: string;
      isActive: boolean;
      priority: number;
      config: Record<string, any>;
      supportedCurrencies: string[];
      supportedCountries: string[];
    }
  ): Promise<PaymentGatewayConfig> {
    const gateway = this.gateways.get(gatewayName);
    if (!gateway) {
      throw new Error(`Payment gateway '${gatewayName}' not found`);
    }

    // Check if configuration already exists
    const existingConfig = await this.db
      .select()
      .from(paymentGatewayConfigs)
      .where(
        and(
          eq(paymentGatewayConfigs.tenantId, tenantId),
          eq(paymentGatewayConfigs.gatewayName, gatewayName)
        )
      )
      .limit(1);

    // Encrypt the configuration before storing
    const encryptedConfig = encryptionService.encrypt(JSON.stringify(config.config));

    if (existingConfig.length > 0) {
      // Update existing configuration
      const [updatedConfig] = await this.db
        .update(paymentGatewayConfigs)
        .set({
          displayName: config.displayName,
          isActive: config.isActive,
          priority: config.priority,
          config: encryptedConfig,
          supportedCurrencies: config.supportedCurrencies,
          supportedCountries: config.supportedCountries,
          capabilities: gateway.capabilities,
          updatedAt: new Date(),
        })
        .where(eq(paymentGatewayConfigs.id, existingConfig[0].id))
        .returning();

      // Refresh cached configurations
      await this.loadTenantConfigurations();

      return updatedConfig;
    } else {
      // Create new configuration
      const [newConfig] = await this.db
        .insert(paymentGatewayConfigs)
        .values({
          tenantId,
          gatewayName,
          displayName: config.displayName,
          isActive: config.isActive,
          priority: config.priority,
          config: encryptedConfig,
          supportedCurrencies: config.supportedCurrencies,
          supportedCountries: config.supportedCountries,
          capabilities: gateway.capabilities,
          status: 'PENDING_SETUP',
        })
        .returning();
      
      // Refresh cached configurations
      await this.loadTenantConfigurations();
      
      return newConfig;
    }
  }

  /**
   * Test gateway configuration
   */
  async testGatewayConfig(tenantId: string, gatewayName: string): Promise<HealthCheckResult> {
    const gateway = this.getGateway(gatewayName);
    if (!gateway) {
      throw new Error(`Gateway ${gatewayName} is not registered`);
    }

    const config = await this.getGatewayConfig(tenantId, gatewayName);
    if (!config) {
      throw new Error(`Gateway ${gatewayName} is not configured for tenant ${tenantId}`);
    }

    try {
      // Initialize gateway with config
      await gateway.initialize(config.config as any);
      
      // Run health check
      const healthResult = await gateway.healthCheck();
      
      // Update health check status in database
      await this.updateGatewayHealthStatus(tenantId, gatewayName, healthResult);
      
      return healthResult;
    } catch (error) {
      const healthResult: HealthCheckResult = {
        healthy: false,
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      
      await this.updateGatewayHealthStatus(tenantId, gatewayName, healthResult);
      return healthResult;
    }
  }

  /**
   * Load tenant configurations from database
   */
  private async loadTenantConfigurations(): Promise<void> {
    const configs = await this.db.query.paymentGatewayConfigs.findMany();
    
    // Group by tenant ID
    const tenantConfigMap = new Map<string, PaymentGatewayConfig[]>();
    
    for (const config of configs) {
      const tenantConfigs = tenantConfigMap.get(config.tenantId) || [];
      tenantConfigs.push(config);
      tenantConfigMap.set(config.tenantId, tenantConfigs);
    }
    
    this.tenantConfigs = tenantConfigMap;
    console.log(`📋 Loaded configurations for ${tenantConfigMap.size} tenants`);
  }

  /**
   * Get tenant gateway configurations
   */
  private async getTenantGatewayConfigs(tenantId: string): Promise<PaymentGatewayConfig[]> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    return this.tenantConfigs.get(tenantId) || [];
  }

  /**
   * Update gateway health status
   */
  private async updateGatewayHealthStatus(
    tenantId: string,
    gatewayName: string,
    healthResult: HealthCheckResult
  ): Promise<void> {
    await this.db
      .update(paymentGatewayConfigs)
      .set({
        lastHealthCheck: new Date(),
        healthCheckStatus: healthResult.status,
        status: healthResult.healthy ? 'ACTIVE' : 'ERROR',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(paymentGatewayConfigs.tenantId, tenantId),
          eq(paymentGatewayConfigs.gatewayName, gatewayName)
        )
      );
  }

  /**
   * Get gateway statistics for a tenant
   */
  async getGatewayStats(tenantId: string): Promise<GatewayStats[]> {
    const configs = await this.getTenantGatewayConfigs(tenantId);
    
    const stats = await Promise.all(configs.map(async (config) => {
      // Get payment statistics for this gateway
      const paymentStats = await this.db
        .select({
          totalPayments: count(payments.id),
          successfulPayments: count(sql`CASE WHEN ${payments.status} = 'completed' THEN 1 END`),
          failedPayments: count(sql`CASE WHEN ${payments.status} = 'failed' THEN 1 END`),
          totalAmount: sum(sql`CASE WHEN ${payments.status} = 'completed' THEN ${payments.amount} ELSE 0 END`),
        })
        .from(payments)
        .where(
          and(
            eq(payments.tenantId, tenantId),
            eq(payments.gatewayName, config.gatewayName)
          )
        );

      const stats = paymentStats[0];
      const totalPayments = Number(stats.totalPayments) || 0;
      const successfulPayments = Number(stats.successfulPayments) || 0;
      const totalAmount = Number(stats.totalAmount) || 0;
      const successRate = totalPayments > 0 ? (successfulPayments / totalPayments) * 100 : 0;

      return {
      gatewayName: config.gatewayName,
      displayName: config.displayName,
      isActive: config.isActive || false,
      status: config.status || 'INACTIVE',
      lastHealthCheck: config.lastHealthCheck,
      healthCheckStatus: config.healthCheckStatus,
        totalPayments,
        successfulPayments,
        failedPayments: Number(stats.failedPayments) || 0,
        totalAmount,
        successRate: Math.round(successRate * 100) / 100, // Round to 2 decimal places
      };
    }));

    return stats;
  }
}

/**
 * Gateway Statistics
 */
export interface GatewayStats {
  gatewayName: string;
  displayName: string;
  isActive: boolean;
  status: string;
  lastHealthCheck: Date | null;
  healthCheckStatus: string | null;
  totalPayments: number;
  successfulPayments: number;
  failedPayments: number;
  totalAmount: number;
  successRate: number;
} 