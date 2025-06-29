/**
 * Core Payment Gateway Interface
 * All payment gateways must implement this interface
 */
export interface PaymentGateway {
  readonly name: string;
  readonly displayName: string;
  readonly supportedCurrencies: string[];
  readonly supportedCountries: string[];
  readonly capabilities: PaymentCapabilities;
  
  // Lifecycle methods
  initialize(config: GatewayConfig): Promise<void>;
  healthCheck(): Promise<HealthCheckResult>;
  
  // Core payment operations
  createPaymentIntent(params: PaymentIntentParams): Promise<PaymentIntent>;
  confirmPayment(params: ConfirmPaymentParams): Promise<PaymentResult>;
  refundPayment(params: RefundParams): Promise<RefundResult>;
  capturePayment?(params: CaptureParams): Promise<CaptureResult>;
  
  // Webhook handling
  verifyWebhookSignature(payload: string, signature: string): boolean;
  handleWebhook(payload: any): Promise<WebhookResult>;
  
  // Customer management (optional)
  createCustomer?(params: CreateCustomerParams): Promise<Customer>;
  updatePaymentMethod?(params: UpdatePaymentMethodParams): Promise<PaymentMethod>;
  
  // Subscription support (optional)
  createSubscription?(params: CreateSubscriptionParams): Promise<Subscription>;
  updateSubscription?(params: UpdateSubscriptionParams): Promise<Subscription>;
  cancelSubscription?(params: CancelSubscriptionParams): Promise<CancelResult>;
}

/**
 * Payment Gateway Capabilities
 */
export interface PaymentCapabilities {
  supportsRecurring: boolean;
  supportsRefunds: boolean;
  supportsPartialRefunds: boolean;
  supportsHolds: boolean;
  supportsInstantPayouts: boolean;
  supportsMultiPartyPayments: boolean;
  supports3DSecure: boolean;
  supportsWallets: string[]; // ['apple_pay', 'google_pay', 'paypal']
  supportedPaymentMethods: string[]; // ['card', 'bank_transfer', 'crypto']
}

/**
 * Gateway Configuration
 */
export interface GatewayConfig {
  [key: string]: any;
}

/**
 * Payment Intent Parameters
 */
export interface PaymentIntentParams {
  amount: number;
  currency: string;
  tenantId: string;
  invoiceId: string;
  customerId?: string;
  returnUrl?: string;
  cancelUrl?: string;
  captureMethod?: 'automatic' | 'manual';
  metadata?: Record<string, string>;
}

/**
 * Payment Intent Result
 */
export interface PaymentIntent {
  id: string;
  clientSecret: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  gatewayData?: any;
  requiresAction?: boolean;
  nextAction?: {
    type: string;
    redirectUrl?: string;
  };
}

/**
 * Payment Status
 */
export type PaymentStatus = 
  | 'pending'
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_action'
  | 'processing'
  | 'requires_capture'
  | 'succeeded'
  | 'canceled'
  | 'failed';

/**
 * Confirm Payment Parameters
 */
export interface ConfirmPaymentParams {
  paymentIntentId: string;
  paymentMethodId?: string;
  returnUrl?: string;
}

/**
 * Payment Result
 */
export interface PaymentResult {
  id: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  chargeId?: string;
  receiptUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  gatewayData?: any;
}

/**
 * Refund Parameters
 */
export interface RefundParams {
  paymentId: string;
  amount?: number; // Partial refund if specified
  reason?: string;
  metadata?: Record<string, string>;
}

/**
 * Refund Result
 */
export interface RefundResult {
  id: string;
  status: 'pending' | 'succeeded' | 'failed' | 'canceled';
  amount: number;
  currency: string;
  reason?: string;
  gatewayData?: any;
}

/**
 * Capture Parameters (for manual capture)
 */
export interface CaptureParams {
  paymentIntentId: string;
  amount?: number; // Partial capture if specified
}

/**
 * Capture Result
 */
export interface CaptureResult {
  id: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  gatewayData?: any;
}

/**
 * Webhook Result
 */
export interface WebhookResult {
  processed: boolean;
  message?: string;
  paymentId?: string;
  status?: PaymentStatus;
  data?: any;
}

/**
 * Health Check Result
 */
export interface HealthCheckResult {
  healthy: boolean;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  responseTime?: number;
  checks?: {
    apiConnection: boolean;
    webhookEndpoint: boolean;
    configuration: boolean;
  };
}

/**
 * Customer Parameters
 */
export interface CreateCustomerParams {
  email: string;
  name?: string;
  phone?: string;
  address?: Address;
  metadata?: Record<string, string>;
}

/**
 * Customer
 */
export interface Customer {
  id: string;
  email: string;
  name?: string;
  phone?: string;
  address?: Address;
  gatewayData?: any;
}

/**
 * Payment Method Parameters
 */
export interface UpdatePaymentMethodParams {
  customerId: string;
  paymentMethodId: string;
  setAsDefault?: boolean;
}

/**
 * Payment Method
 */
export interface PaymentMethod {
  id: string;
  type: string;
  last4?: string;
  brand?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault?: boolean;
  gatewayData?: any;
}

/**
 * Subscription Parameters
 */
export interface CreateSubscriptionParams {
  customerId: string;
  planId: string;
  paymentMethodId: string;
  trialDays?: number;
  metadata?: Record<string, string>;
}

/**
 * Subscription
 */
export interface Subscription {
  id: string;
  customerId: string;
  planId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialEnd?: Date;
  canceledAt?: Date;
  gatewayData?: any;
}

/**
 * Subscription Status
 */
export type SubscriptionStatus = 
  | 'active'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'paused';

/**
 * Update Subscription Parameters
 */
export interface UpdateSubscriptionParams {
  subscriptionId: string;
  planId?: string;
  quantity?: number;
  metadata?: Record<string, string>;
}

/**
 * Cancel Subscription Parameters
 */
export interface CancelSubscriptionParams {
  subscriptionId: string;
  atPeriodEnd?: boolean;
  reason?: string;
}

/**
 * Cancel Result
 */
export interface CancelResult {
  id: string;
  status: SubscriptionStatus;
  canceledAt: Date;
  gatewayData?: any;
}

/**
 * Address
 */
export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode?: string;
  country: string;
}

/**
 * Payment Context for gateway selection
 */
export interface PaymentContext {
  tenantId: string;
  amount: number;
  currency: string;
  billingCountry?: string;
  customerId?: string;
  paymentMethodType?: string;
  isRecurring?: boolean;
} 