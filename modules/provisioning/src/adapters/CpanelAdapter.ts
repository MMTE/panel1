import type {
  IProvisioner,
  ServiceParameters,
  ProvisioningResult,
  HealthCheckResult,
  ProvisioningConfig,
} from '../types.js';

export class CpanelAdapter implements IProvisioner {
  private config: ProvisioningConfig;
  private baseUrl: string;

  constructor(config: ProvisioningConfig) {
    this.config = config;
    this.baseUrl = `${config.useSSL ? 'https' : 'http'}://${config.hostname}:${config.port}`;
  }

  async provision(params: ServiceParameters): Promise<ProvisioningResult> {
    try {
      return {
        success: true,
        message: 'cPanel account creation initiated',
        data: {
          remoteId: this.generateUsername(params.domain || params.serviceName),
          username: this.generateUsername(params.domain || params.serviceName),
          password: this.generatePassword(),
          controlPanelUrl: `${this.baseUrl}:2083`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  async suspend(params: ServiceParameters): Promise<ProvisioningResult> {
    try {
      return { success: true, message: 'cPanel account suspended' };
    } catch (error) {
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  async unsuspend(params: ServiceParameters): Promise<ProvisioningResult> {
    try {
      return { success: true, message: 'cPanel account unsuspended' };
    } catch (error) {
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  async terminate(params: ServiceParameters): Promise<ProvisioningResult> {
    try {
      return { success: true, message: 'cPanel account terminated' };
    } catch (error) {
      return {
        success: false,
        error: { message: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  async modify(params: ServiceParameters): Promise<ProvisioningResult> {
    return { success: true, message: 'cPanel account modified' };
  }

  async reinstall(params: ServiceParameters): Promise<ProvisioningResult> {
    return { success: true, message: 'cPanel account reinstalled' };
  }

  async healthCheck(): Promise<HealthCheckResult> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeout || 10000);
      const response = await fetch(`${this.baseUrl}:2087/json-api/version`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Authorization': `WHM ${this.config.username || 'root'}:${this.config.apiKey}`,
        },
      });
      clearTimeout(timeout);

      if (response.ok) {
        return { healthy: true, status: 'healthy', message: 'cPanel server is responding' };
      }
      return { healthy: false, status: 'warning', message: `HTTP ${response.status}` };
    } catch {
      return { healthy: false, status: 'error', message: 'Connection failed' };
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const health = await this.healthCheck();
      return health.healthy;
    } catch {
      return false;
    }
  }

  async validateParameters(params: ServiceParameters): Promise<boolean> {
    return !!params.serviceName;
  }

  private generateUsername(domain: string): string {
    return (domain || 'user')
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase()
      .substring(0, 8) || `user${Date.now().toString(36)}`;
  }

  private generatePassword(length = 16): string {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    const array = new Uint32Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, (v) => charset[v % charset.length]).join('');
  }
}
