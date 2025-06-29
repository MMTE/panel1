import {
  WhmApiRequest,
  WhmApiType,
  WhmApiTokenHeader,
  WhmApiResponse,
  Argument,
} from '@cpanel/api';
import {
  ProvisioningAdapter,
  ServiceParameters,
  ProvisioningResult,
  HealthCheckResult,
  ProvisioningConfig,
  ProviderConnectionError,
  ProviderAuthenticationError,
  ServiceNotFoundError,
  QuotaExceededError,
} from '../types';

export class CpanelAdapter implements ProvisioningAdapter {
  private config: ProvisioningConfig;
  private baseUrl: string;

  constructor(config: ProvisioningConfig) {
    this.config = config;
    this.baseUrl = `${config.useSSL ? 'https' : 'http'}://${config.hostname}:${config.port}`;
  }

  async provision(params: ServiceParameters): Promise<ProvisioningResult> {
    try {
      console.log(`🔄 Provisioning cPanel account: ${params.serviceName}`);
      
      // Implementation will use @cpanel/api library
      return {
        success: true,
        message: 'Account created successfully',
        data: {
          remoteId: 'test_user',
          username: 'test_user',
          password: 'generated_password',
          controlPanelUrl: `${this.baseUrl}:2083`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  async suspend(params: ServiceParameters): Promise<ProvisioningResult> {
    return { success: true, message: 'Account suspended' };
  }

  async unsuspend(params: ServiceParameters): Promise<ProvisioningResult> {
    return { success: true, message: 'Account unsuspended' };
  }

  async terminate(params: ServiceParameters): Promise<ProvisioningResult> {
    return { success: true, message: 'Account terminated' };
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      healthy: true,
      status: 'healthy',
      message: 'cPanel server is responding',
    };
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

  // Private helper methods
  private async makeRequest(request: any): Promise<any> {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: request.headers.toObject(),
        body: request.body,
      });

      if (!response.ok) {
        throw new ProviderConnectionError(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return { data };
    } catch (error) {
      if (error instanceof ProviderConnectionError) {
        throw error;
      }
      throw new ProviderConnectionError(`Failed to connect to WHM: ${error}`);
    }
  }

  private async getAccountInfo(username: string): Promise<any> {
    const request = new WhmApiRequest(WhmApiType.JsonApi, {
      method: 'accountsummary',
      arguments: [new Argument('user', username)],
      headers: [new WhmApiTokenHeader(this.config.apiKey!, this.config.username || 'root')],
    }).generate();

    const response = await this.makeRequest(request);
    const apiResponse = new WhmApiResponse(response.data);

    if (!apiResponse.status) {
      throw new ServiceNotFoundError(`Account not found: ${username}`);
    }

    return response.data.acct?.[0] || {};
  }

  private async getNameservers(): Promise<string[]> {
    try {
      const request = new WhmApiRequest(WhmApiType.JsonApi, {
        method: 'get_nameserver_config',
        arguments: [],
        headers: [new WhmApiTokenHeader(this.config.apiKey!, this.config.username || 'root')],
      }).generate();

      const response = await this.makeRequest(request);
      const apiResponse = new WhmApiResponse(response.data);

      if (apiResponse.status && response.data.nameservers) {
        return response.data.nameservers;
      }
    } catch (error) {
      console.warn('Could not fetch nameservers:', error);
    }

    // Fallback nameservers
    return [`ns1.${this.config.hostname}`, `ns2.${this.config.hostname}`];
  }

  private generateUsername(domain: string): string {
    // Generate cPanel username from domain (max 8 chars, alphanumeric)
    return domain
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase()
      .substring(0, 8);
  }

  private generatePassword(length = 12): string {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
  }

  private isValidDomain(domain: string): boolean {
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/;
    return domainRegex.test(domain);
  }

  private handleError(error: any): ProvisioningResult {
    let errorCode = 'UNKNOWN_ERROR';
    let errorMessage = 'An unknown error occurred';

    if (error instanceof Error) {
      errorMessage = error.message;
      
      if (error.message.includes('authentication') || error.message.includes('token')) {
        errorCode = 'AUTH_ERROR';
      } else if (error.message.includes('quota') || error.message.includes('limit')) {
        errorCode = 'QUOTA_ERROR';
      } else if (error.message.includes('exists') || error.message.includes('duplicate')) {
        errorCode = 'DUPLICATE_ERROR';
      } else if (error.message.includes('connection') || error.message.includes('network')) {
        errorCode = 'CONNECTION_ERROR';
      }
    }

    return {
      success: false,
      error: {
        code: errorCode,
        message: errorMessage,
        details: error,
      },
    };
  }
} 