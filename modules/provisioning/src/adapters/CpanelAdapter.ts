import type {
  IProvisioner,
  ServiceParameters,
  ProvisioningResult,
  HealthCheckResult,
  ProvisioningConfig,
} from '../types.js';
import { WhmClient } from './whm-client.js';

/**
 * cPanel/WHM adapter backed by real WHM API1 calls (WhmClient).
 *
 * Every operation hits the WHM API and failures surface as
 * `success: false` with the cPanel statusmsg — never a fake success
 * (panel1 issue #62).
 */
export class CpanelAdapter implements IProvisioner {
  private config: ProvisioningConfig;
  private client: WhmClient;

  constructor(config: ProvisioningConfig) {
    this.config = config;
    this.client = new WhmClient(config);
  }

  async provision(params: ServiceParameters): Promise<ProvisioningResult> {
    try {
      const username = params.username || this.generateUsername(params.domain || params.serviceName);
      const password = params.password || this.generatePassword();
      const domain = params.domain || params.serviceName;

      const result = await this.client.createacct({
        username,
        password,
        domain,
        contactemail: params.email,
        plan: params.packageName,
        quota: params.diskQuota,
        bandwidth: params.bandwidthQuota,
        maxsql: params.databases,
        maxsub: params.subdomains,
        maxpop: params.emailAccounts,
      });

      const ip = (result as any)?.ip || (result as any)?.options?.ip;

      return {
        success: true,
        message: 'cPanel account created',
        data: {
          remoteId: username,
          username,
          password,
          controlPanelUrl: this.controlPanelUrl(),
          ...(ip ? { ipAddress: ip } : {}),
        },
      };
    } catch (error) {
      return this.failure('provision', error);
    }
  }

  async suspend(params: ServiceParameters): Promise<ProvisioningResult> {
    try {
      const user = this.resolveUser(params);
      await this.client.suspendacct(user);
      return { success: true, message: 'cPanel account suspended' };
    } catch (error) {
      return this.failure('suspend', error);
    }
  }

  async unsuspend(params: ServiceParameters): Promise<ProvisioningResult> {
    try {
      const user = this.resolveUser(params);
      await this.client.unsuspendacct(user);
      return { success: true, message: 'cPanel account unsuspended' };
    } catch (error) {
      return this.failure('unsuspend', error);
    }
  }

  async terminate(params: ServiceParameters): Promise<ProvisioningResult> {
    try {
      const user = this.resolveUser(params);
      await this.client.removeacct(user);
      return { success: true, message: 'cPanel account terminated' };
    } catch (error) {
      return this.failure('terminate', error);
    }
  }

  async modify(params: ServiceParameters): Promise<ProvisioningResult> {
    return { success: false, error: { message: 'modify is not supported by the WHM adapter yet' } };
  }

  async reinstall(params: ServiceParameters): Promise<ProvisioningResult> {
    return { success: false, error: { message: 'reinstall is not supported by the WHM adapter yet' } };
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return this.client.healthCheck();
  }

  async testConnection(): Promise<boolean> {
    const health = await this.healthCheck();
    return health.healthy;
  }

  async validateParameters(params: ServiceParameters): Promise<boolean> {
    return !!params.serviceName;
  }

  private resolveUser(params: ServiceParameters): string {
    return params.username || this.generateUsername(params.domain || params.serviceName);
  }

  /** cPanel user-facing URL — built from the config, port appended exactly once. */
  private controlPanelUrl(): string {
    const scheme = this.config.useSSL ? 'https' : 'http';
    return `${scheme}://${this.config.hostname}:2083`;
  }

  private failure(operation: string, error: unknown): ProvisioningResult {
    return {
      success: false,
      error: {
        message:
          error instanceof Error
            ? error.message
            : `WHM ${operation} failed with an unknown error`,
      },
    };
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
