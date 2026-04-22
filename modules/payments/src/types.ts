export type PaymentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED'
  | 'CANCELLED'
  | 'AUTHORIZED'
  | 'CAPTURED'
  | 'VOIDED';

export type RefundStatus =
  | 'PENDING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'PENDING_MANUAL';

export type GatewayStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'PENDING_SETUP'
  | 'ERROR'
  | 'TESTING'
  | 'MAINTENANCE';

export interface CreateChargeInput {
  amount: number;
  currency: string;
  description?: string;
  clientId?: string;
  invoiceId?: string;
  subscriptionId?: string;
  gatewayName?: string;
  customerId?: string;
  metadata?: Record<string, any>;
}

export interface PaymentFilters {
  status?: PaymentStatus;
  gateway?: string;
  clientId?: string;
  invoiceId?: string;
  subscriptionId?: string;
  search?: string;
  createdAfter?: Date;
  createdBefore?: Date;
}

export interface PaginationInput {
  limit?: number;
  offset?: number;
}

export interface PaginatedPayments {
  payments: PaymentDTO[];
  total: number;
  hasMore: boolean;
}

export interface PaymentDTO {
  id: string;
  tenantId: string;
  clientId: string | null;
  invoiceId: string | null;
  subscriptionId: string | null;
  amount: string | null;
  currency: string;
  status: PaymentStatus;
  gateway: string;
  gatewayId: string | null;
  gatewayPaymentId: string | null;
  gatewayResponse: Record<string, any> | null;
  metadata: Record<string, any> | null;
  description: string | null;
  refundedAmount: string | null;
  refundStatus: RefundStatus | null;
  refundedAt: Date | null;
  failureReason: string | null;
  failureCode: string | null;
  lastError: string | null;
  retryCount: number | null;
  nextRetryAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface GatewayDTO {
  id: string;
  gatewayName: string;
  displayName: string;
  status: GatewayStatus | null;
  isActive: boolean | null;
  isDefault: boolean | null;
  supportedCurrencies: string[] | null;
  supportedPaymentMethods: string[] | null;
  features: string[] | null;
  webhookUrl: string | null;
  apiEndpoint: string | null;
  lastHealthCheck: Date | null;
  healthCheckStatus: string | null;
  errorMessage: string | null;
  metadata: Record<string, any> | null;
  tenantId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface CreateGatewayInput {
  gatewayName: string;
  displayName: string;
  config: Record<string, any>;
  isDefault?: boolean;
  isActive?: boolean;
  supportedCurrencies?: string[];
  supportedPaymentMethods?: string[];
  features?: string[];
  webhookUrl?: string;
  webhookSecret?: string;
  apiEndpoint?: string;
}

export interface UpdateGatewayInput {
  displayName?: string;
  config?: Record<string, any>;
  isDefault?: boolean;
  isActive?: boolean;
  status?: GatewayStatus;
  supportedCurrencies?: string[];
  supportedPaymentMethods?: string[];
  features?: string[];
  webhookUrl?: string;
  webhookSecret?: string;
  apiEndpoint?: string;
}

export interface ChargeResult {
  id: string;
  clientSecret?: string;
  status: string;
  amount: number;
  currency: string;
  gateway: string;
  requiresAction?: boolean;
  nextAction?: {
    type: string;
    redirectUrl?: string;
  };
}

export interface CaptureResult {
  id: string;
  status: string;
  amount: number;
  currency: string;
}

export interface RefundResultDTO {
  id: string;
  status: string;
  amount: number;
  currency: string;
  reason?: string;
}

export interface HealthCheckResultDTO {
  healthy: boolean;
  status: string;
  message?: string;
  responseTime?: number;
}

export interface GatewayStatsDTO {
  gatewayName: string;
  displayName: string;
  isActive: boolean;
  status: string;
  totalPayments: number;
  successfulPayments: number;
  failedPayments: number;
  totalAmount: number;
  successRate: number;
}

export interface IPaymentService {
  createCharge(data: CreateChargeInput, tenantId: string): Promise<ChargeResult>;
  capturePayment(paymentId: string, tenantId: string, amount?: number): Promise<CaptureResult>;
  refundPayment(paymentId: string, tenantId: string, amount?: number, reason?: string): Promise<RefundResultDTO>;
  getPayment(id: string, tenantId: string): Promise<PaymentDTO | null>;
  listPayments(filters: PaymentFilters, pagination: PaginationInput, tenantId: string): Promise<PaginatedPayments>;
  getGateway(id: string, tenantId: string): Promise<GatewayDTO | null>;
  listGateways(tenantId: string): Promise<GatewayDTO[]>;
  createGateway(data: CreateGatewayInput, tenantId: string): Promise<GatewayDTO>;
  updateGateway(id: string, data: UpdateGatewayInput, tenantId: string): Promise<GatewayDTO>;
  deleteGateway(id: string, tenantId: string): Promise<void>;
  testGateway(id: string, tenantId: string): Promise<HealthCheckResultDTO>;
  handleWebhook(gatewayName: string, payload: unknown, signature: string): Promise<{ processed: boolean; message?: string }>;
  retryFailedPayment(paymentId: string, tenantId: string): Promise<ChargeResult>;
  retryStaleFailedPayments(): Promise<void>;
}

declare module '@panel1/types' {
  interface EventMap {
    'payment.initiated': { paymentId: string; amount: number; currency: string; tenantId: string; gatewayName: string };
    'payment.succeeded': { paymentId: string; amount: number; currency: string; tenantId: string; gatewayName: string; invoiceId?: string };
    'payment.failed': { paymentId: string; amount: number; currency: string; tenantId: string; gatewayName: string; reason: string; invoiceId?: string };
    'payment.refunded': { paymentId: string; amount: number; tenantId: string; reason: string };
  }
}
