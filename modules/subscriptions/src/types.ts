export type SubscriptionStatus =
  | 'ACTIVE' | 'INACTIVE' | 'CANCELLED' | 'PAST_DUE'
  | 'UNPAID' | 'TRIALING' | 'PAUSED' | 'PENDING_CANCELLATION';

export interface CreateSubscriptionInput {
  clientId: string;
  planId: string;
  productId?: string;
  paymentMethodId?: string;
  trialDays?: number;
  metadata?: Record<string, any>;
}

export interface UpdateSubscriptionInput {
  planId?: string;
  paymentMethodId?: string;
  cancelAtPeriodEnd?: boolean;
  cancellationReason?: string;
  metadata?: Record<string, any>;
}

export interface CancelSubscriptionInput {
  cancelAtPeriodEnd?: boolean;
  reason?: string;
  refundUnusedTime?: boolean;
}

export interface SubscriptionDTO {
  id: string;
  clientId: string | null;
  planId: string | null;
  planName: string | null;
  currency: string | null;
  status: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  nextBillingDate: Date | null;
  billingCycleAnchor: Date | null;
  cancelAtPeriodEnd: boolean | null;
  canceledAt: Date | null;
  cancellationReason: string | null;
  trialStart: Date | null;
  trialEnd: Date | null;
  pastDueDate: Date | null;
  suspendedAt: Date | null;
  failedPaymentAttempts: number | null;
  lastPaymentAttempt: Date | null;
  quantity: number | null;
  unitPrice: string | null;
  paymentMethodId: string | null;
  defaultPaymentMethod: Record<string, any> | null;
  metadata: Record<string, any> | null;
  tenantId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ProrationResult {
  creditAmount: number;
  chargeAmount: number;
  netAmount: number;
  proratedDays: number;
}

export interface SubscriptionCancellationResult {
  success: boolean;
  canceledAt: Date;
  refundAmount?: number;
  refundId?: string;
}

export interface SubscriptionFilters {
  status?: SubscriptionStatus;
  clientId?: string;
  planId?: string;
  search?: string;
}

export interface PaginatedSubscriptions {
  subscriptions: SubscriptionDTO[];
  total: number;
  hasMore: boolean;
}

export interface SubscriptionStats {
  totalSubscriptions: number;
  activeSubscriptions: number;
  trialingSubscriptions: number;
  pastDueSubscriptions: number;
  cancelledSubscriptions: number;
  monthlyRecurringRevenue: number;
}

export interface ISubscriptionService {
  createSubscription(input: CreateSubscriptionInput, tenantId: string, userId?: string): Promise<SubscriptionDTO>;
  getSubscription(id: string, tenantId: string): Promise<SubscriptionDTO | null>;
  listSubscriptions(filters: SubscriptionFilters, tenantId: string, limit?: number, offset?: number): Promise<PaginatedSubscriptions>;
  updateSubscription(id: string, data: UpdateSubscriptionInput, tenantId: string): Promise<SubscriptionDTO>;
  cancelSubscription(id: string, input: CancelSubscriptionInput, tenantId: string, userId?: string): Promise<SubscriptionCancellationResult>;
  processRenewal(subscriptionId: string, tenantId: string): Promise<{ success: boolean; invoiceId?: string; error?: string }>;
  handlePaymentSucceeded(payload: { subscriptionId: string; tenantId: string }): Promise<void>;
  handlePaymentFailed(payload: { subscriptionId: string; tenantId: string; attemptNumber: number }): Promise<void>;
  handleInvoiceOverdue(payload: { subscriptionId: string; tenantId: string }): Promise<void>;
  calculateProration(subscriptionId: string, newPlanId: string, tenantId: string): Promise<ProrationResult>;
  changePlan(subscriptionId: string, newPlanId: string, tenantId: string, userId?: string): Promise<SubscriptionDTO>;
  getStats(tenantId: string): Promise<SubscriptionStats>;
  getStateChanges(subscriptionId: string, tenantId: string): Promise<any[]>;
}

declare module '@panel1/types' {
  interface EventMap {
    'subscription.created': { subscriptionId: string; tenantId: string };
    'subscription.activated': { subscriptionId: string; tenantId: string };
    'subscription.renewed': { subscriptionId: string; tenantId: string; invoiceId?: string };
    'subscription.suspended': { subscriptionId: string; tenantId: string; reason?: string };
    'subscription.cancelled': { subscriptionId: string; tenantId: string; reason?: string };
    'subscription.past_due': { subscriptionId: string; tenantId: string; failedAttempts: number };
    'subscription.terminated': { subscriptionId: string; tenantId: string };
    'subscription.plan_changed': { subscriptionId: string; tenantId: string; oldPlanId: string; newPlanId: string };
  }
}
