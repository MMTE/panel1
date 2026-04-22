import { fetchJson, getApiBaseUrl } from './http';

const base = () => `${getApiBaseUrl()}/api/payments`;

export interface GatewayRow {
  id: string;
  gatewayName: string;
  displayName: string;
  status: string | null;
  isActive: boolean | null;
  isDefault: boolean | null;
  supportedCurrencies: string[] | null;
  supportedPaymentMethods: string[] | null;
  features: string[] | null;
  webhookUrl: string | null;
  apiEndpoint: string | null;
  lastHealthCheck: string | null;
  healthCheckStatus: string | null;
  errorMessage: string | null;
  metadata: unknown;
  tenantId: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PaymentRow {
  id: string;
  tenantId: string;
  clientId: string | null;
  invoiceId: string | null;
  subscriptionId: string | null;
  amount: string | null;
  currency: string;
  status: string;
  gateway: string;
  gatewayId: string | null;
  gatewayPaymentId: string | null;
  description: string | null;
  refundedAmount: string | null;
  refundStatus: string | null;
  refundedAt: string | null;
  failureReason: string | null;
  failureCode: string | null;
  lastError: string | null;
  retryCount: number | null;
  nextRetryAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PaginatedPayments {
  payments: PaymentRow[];
  total: number;
  hasMore: boolean;
}

export interface ChargeResult {
  id: string;
  clientSecret: string | null;
  status: string;
  amount: number;
  currency: string;
  gateway: string;
  requiresAction?: boolean;
  nextAction?: { type: string; redirectUrl?: string };
}

export interface CaptureResult {
  id: string;
  status: string;
  amount: number;
  currency: string;
}

export interface RefundResult {
  id: string;
  status: string;
  amount: number;
  currency: string;
  reason?: string;
}

export interface HealthCheckResult {
  healthy: boolean;
  status: string;
  message?: string;
  responseTime?: number;
}

export const paymentsApi = {
  async listGateways(): Promise<GatewayRow[]> {
    return fetchJson<GatewayRow[]>(`${base()}/gateways`);
  },

  async getGateway(id: string): Promise<GatewayRow> {
    return fetchJson<GatewayRow>(`${base()}/gateways/${encodeURIComponent(id)}`);
  },

  async createGateway(body: {
    gatewayName: string;
    displayName: string;
    config: Record<string, unknown>;
    isDefault?: boolean;
    isActive?: boolean;
    supportedCurrencies?: string[];
    supportedPaymentMethods?: string[];
    features?: string[];
    webhookUrl?: string;
    webhookSecret?: string;
    apiEndpoint?: string;
  }): Promise<GatewayRow> {
    return fetchJson<GatewayRow>(`${base()}/gateways`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async updateGateway(
    id: string,
    body: {
      displayName?: string;
      config?: Record<string, unknown>;
      isDefault?: boolean;
      isActive?: boolean;
      status?: string;
      supportedCurrencies?: string[];
      supportedPaymentMethods?: string[];
      features?: string[];
      webhookUrl?: string;
      webhookSecret?: string;
      apiEndpoint?: string;
    },
  ): Promise<GatewayRow> {
    return fetchJson<GatewayRow>(`${base()}/gateways/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  async deleteGateway(id: string): Promise<{ success: boolean }> {
    return fetchJson<{ success: boolean }>(`${base()}/gateways/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async testGateway(id: string): Promise<HealthCheckResult> {
    return fetchJson<HealthCheckResult>(`${base()}/gateways/${encodeURIComponent(id)}/test`, {
      method: 'POST',
    });
  },

  async createCharge(body: {
    amount: number;
    currency: string;
    description?: string;
    clientId?: string;
    invoiceId?: string;
    subscriptionId?: string;
    gatewayName?: string;
    customerId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<ChargeResult> {
    return fetchJson<ChargeResult>(`${base()}/charges`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async capturePayment(id: string, amount?: number): Promise<CaptureResult> {
    return fetchJson<CaptureResult>(`${base()}/charges/${encodeURIComponent(id)}/capture`, {
      method: 'POST',
      body: JSON.stringify(amount ? { amount } : {}),
    });
  },

  async refundPayment(id: string, amount?: number, reason?: string): Promise<RefundResult> {
    return fetchJson<RefundResult>(`${base()}/charges/${encodeURIComponent(id)}/refund`, {
      method: 'POST',
      body: JSON.stringify({ amount, reason }),
    });
  },

  async listTransactions(params?: {
    status?: string;
    gateway?: string;
    clientId?: string;
    invoiceId?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedPayments> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.gateway) qs.set('gateway', params.gateway);
    if (params?.clientId) qs.set('clientId', params.clientId);
    if (params?.invoiceId) qs.set('invoiceId', params.invoiceId);
    if (params?.search) qs.set('search', params.search);
    qs.set('limit', String(params?.limit ?? 20));
    qs.set('offset', String(params?.offset ?? 0));
    return fetchJson<PaginatedPayments>(`${base()}/transactions?${qs.toString()}`);
  },

  async getTransaction(id: string): Promise<PaymentRow> {
    return fetchJson<PaymentRow>(`${base()}/transactions/${encodeURIComponent(id)}`);
  },

  async retryTransaction(id: string): Promise<ChargeResult> {
    return fetchJson<ChargeResult>(`${base()}/transactions/${encodeURIComponent(id)}/retry`, {
      method: 'POST',
    });
  },
};
