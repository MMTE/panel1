import type { ZodSchema } from 'zod';

export interface IPaymentGateway {
  name: string;
  supportedCurrencies: string[];
  supportsRefunds: boolean;
  supportsRecurring: boolean;

  createPayment(input: PaymentInput): Promise<PaymentResult>;
  capturePayment(paymentId: string): Promise<CaptureResult>;
  refund(paymentId: string, amount?: number): Promise<RefundResult>;
  handleWebhook(payload: unknown, signature: string): Promise<WebhookResult>;

  configSchema: ZodSchema;
}

export interface PaymentInput {
  amount: number;
  currency: string;
  description?: string;
  customerId?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentResult {
  id: string;
  status: 'pending' | 'completed' | 'failed';
  externalId?: string;
  redirectUrl?: string;
}

export interface CaptureResult {
  id: string;
  status: 'captured' | 'failed';
  capturedAmount: number;
}

export interface RefundResult {
  id: string;
  status: 'refunded' | 'partial' | 'failed';
  refundedAmount: number;
}

export interface WebhookResult {
  handled: boolean;
  eventType: string;
  externalId?: string;
}

export interface IProvisioner {
  name: string;
  type: string;

  provision(input: ProvisionInput): Promise<ProvisionResult>;
  suspend(serviceId: string): Promise<void>;
  unsuspend(serviceId: string): Promise<void>;
  terminate(serviceId: string): Promise<void>;
  changePackage(serviceId: string, newPackage: PackageConfig): Promise<void>;
  getUsage(serviceId: string): Promise<UsageData>;
  healthCheck(): Promise<HealthStatus>;

  configSchema: ZodSchema;
}

export interface ProvisionInput {
  serviceId: string;
  packageConfig: PackageConfig;
  clientId: string;
  domain?: string;
  metadata?: Record<string, unknown>;
}

export interface ProvisionResult {
  externalId: string;
  status: 'provisioned' | 'pending' | 'failed';
  credentials?: Record<string, string>;
}

export interface PackageConfig {
  name: string;
  resources: Record<string, number | string>;
}

export interface UsageData {
  diskUsage: number;
  bandwidthUsage: number;
  cpuUsage?: number;
  memoryUsage?: number;
  [key: string]: unknown;
}

export interface HealthStatus {
  healthy: boolean;
  message?: string;
  lastChecked: Date;
}

export interface IRegistrar {
  name: string;
  supportedTlds: string[];

  checkAvailability(domain: string): Promise<DomainAvailability>;
  register(input: RegisterInput): Promise<RegistrationResult>;
  renew(domain: string, years: number): Promise<RenewalResult>;
  transfer(input: TransferInput): Promise<TransferResult>;
  getNameservers(domain: string): Promise<string[]>;
  setNameservers(domain: string, ns: string[]): Promise<void>;

  configSchema: ZodSchema;
}

export interface DomainAvailability {
  domain: string;
  available: boolean;
  price?: number;
  currency?: string;
}

export interface RegisterInput {
  domain: string;
  years: number;
  nameservers?: string[];
  contactInfo: DomainContact;
}

export interface DomainContact {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  organization?: string;
}

export interface RegistrationResult {
  domain: string;
  status: 'registered' | 'pending' | 'failed';
  expiresAt?: Date;
}

export interface RenewalResult {
  domain: string;
  status: 'renewed' | 'failed';
  expiresAt?: Date;
}

export interface TransferInput {
  domain: string;
  authCode: string;
  contactInfo: DomainContact;
}

export interface TransferResult {
  domain: string;
  status: 'transferred' | 'pending' | 'failed';
  transferId?: string;
}
