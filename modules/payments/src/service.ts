import type { ModuleContext } from '@panel1/types';
import type { IPaymentGateway, PaymentInput, PaymentResult, CaptureResult as ExtCaptureResult, RefundResult as ExtRefundResult, WebhookResult as ExtWebhookResult } from '@panel1/types/extensions';
import { eq, and, desc, count, sql, lt, gte } from 'drizzle-orm';
import { z } from 'zod';
import Stripe from 'stripe';
import {
  payments,
  paymentAttempts,
  paymentGatewayConfigs,
} from './schema.js';
import type { Payment, PaymentGatewayConfig } from './schema.js';
import type {
  IPaymentService,
  CreateChargeInput,
  PaymentFilters,
  PaginationInput,
  PaginatedPayments,
  PaymentDTO,
  GatewayDTO,
  CreateGatewayInput,
  UpdateGatewayInput,
  ChargeResult,
  CaptureResult,
  RefundResultDTO,
  HealthCheckResultDTO,
} from './types.js';

const stripeConfigSchema = z.object({
  secretKey: z.string().min(1),
  webhookSecret: z.string().optional(),
  publishableKey: z.string().optional(),
});

class StripeGatewayImpl implements IPaymentGateway {
  name = 'stripe';
  supportedCurrencies = [
    'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK',
    'PLN', 'CZK', 'HUF', 'BGN', 'HRK', 'RON', 'SGD', 'HKD', 'INR', 'MYR',
    'PHP', 'THB', 'MXN', 'BRL', 'ARS', 'CLP', 'COP', 'PEN', 'UYU',
  ];
  supportsRefunds = true;
  supportsRecurring = true;
  configSchema = stripeConfigSchema;

  private stripe: any = null;

  async createPayment(input: PaymentInput): Promise<PaymentResult> {
    const intent = await this.stripe.paymentIntents.create({
      amount: Math.round(input.amount * 100),
      currency: input.currency.toLowerCase(),
      metadata: {
        ...(input.metadata as Record<string, string> ?? {}),
        ...(input.customerId ? { customerId: input.customerId } : {}),
      },
      automatic_payment_methods: { enabled: true },
      capture_method: 'automatic',
    });

    return {
      id: intent.id,
      status: this.mapStatus(intent.status),
      externalId: intent.client_secret,
    };
  }

  async capturePayment(paymentId: string): Promise<ExtCaptureResult> {
    const intent = await this.stripe.paymentIntents.capture(paymentId);
    return {
      id: intent.id,
      status: 'captured',
      capturedAmount: intent.amount / 100,
    };
  }

  async refund(paymentId: string, amount?: number): Promise<ExtRefundResult> {
    const intent = await this.stripe.paymentIntents.retrieve(paymentId, { expand: ['charges'] });
    const chargeId = (intent as any).charges?.data?.[0]?.id;
    if (!chargeId) throw new Error('No charge found for payment intent');

    const refund = await this.stripe.refunds.create({
      charge: chargeId,
      amount: amount ? Math.round(amount * 100) : undefined,
    });

    return {
      id: refund.id,
      status: refund.status === 'succeeded' ? 'refunded' : refund.status === 'pending' ? 'refunded' : 'failed',
      refundedAmount: refund.amount / 100,
    };
  }

  async handleWebhook(payload: unknown, signature: string): Promise<ExtWebhookResult> {
    const event = payload as any;
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      return { handled: true, eventType: event.type, externalId: pi.id };
    }
    if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object;
      return { handled: true, eventType: event.type, externalId: pi.id };
    }
    return { handled: false, eventType: event.type };
  }

  initialize(config: Record<string, any>): void {
    const parsed = stripeConfigSchema.parse(config);
    if (!parsed.secretKey) throw new Error('Stripe secret key is required');
    this.stripe = new Stripe(parsed.secretKey, {
      apiVersion: '2025-05-28.basil',
      appInfo: { name: 'Panel1', version: '0.1.0' },
    });
  }

  private mapStatus(status: string): 'pending' | 'completed' | 'failed' {
    if (status === 'succeeded') return 'completed';
    if (status === 'requires_payment_method' || status === 'requires_confirmation' || status === 'processing' || status === 'requires_action') return 'pending';
    return 'failed';
  }
}

export class PaymentService implements IPaymentService {
  private db: any;
  private ctx: ModuleContext;
  private gatewayRegistry = new Map<string, IPaymentGateway>();

  constructor(ctx: ModuleContext) {
    this.ctx = ctx;
    this.db = ctx.db;
  }

  registerGatewayPlugin(gateway: IPaymentGateway): void {
    this.gatewayRegistry.set(gateway.name, gateway);
    this.ctx.logger.info(`Registered payment gateway plugin: ${gateway.name}`);
  }

  private async decryptGatewayConfig(config: PaymentGatewayConfig): Promise<Record<string, any>> {
    const enc = this.ctx.encryption;
    if (!enc) return config.config as Record<string, any>;
    const raw = config.config as any;
    if (typeof raw === 'string' && enc.isEncrypted(raw)) {
      try {
        const decrypted = enc.decrypt(raw);
        return JSON.parse(decrypted);
      } catch {
        return { error: 'Decryption failed' };
      }
    }
    return raw as Record<string, any>;
  }

  private getGatewayInstance(name: string): IPaymentGateway {
    const gw = this.gatewayRegistry.get(name);
    if (!gw) throw new Error(`Gateway '${name}' is not registered`);
    return gw;
  }

  private async initGatewayForTenant(gatewayName: string, tenantId: string): Promise<IPaymentGateway> {
    const gw = this.getGatewayInstance(gatewayName);
    const configs = await this.db
      .select()
      .from(paymentGatewayConfigs)
      .where(and(
        eq(paymentGatewayConfigs.gatewayName, gatewayName),
        eq(paymentGatewayConfigs.tenantId, tenantId),
        eq(paymentGatewayConfigs.isActive, true),
      ))
      .limit(1);
    if (configs.length === 0) {
      throw new Error(`Gateway ${gatewayName} is not configured for tenant`);
    }
    const decrypted = await this.decryptGatewayConfig(configs[0]);
    gw.initialize(decrypted);
    return gw;
  }

  async createCharge(data: CreateChargeInput, tenantId: string): Promise<ChargeResult> {
    let gatewayName = data.gatewayName;
    if (!gatewayName) {
      const defaultGw = await this.db
        .select()
        .from(paymentGatewayConfigs)
        .where(and(
          eq(paymentGatewayConfigs.tenantId, tenantId),
          eq(paymentGatewayConfigs.isDefault, true),
          eq(paymentGatewayConfigs.isActive, true),
          eq(paymentGatewayConfigs.status, 'ACTIVE'),
        ))
        .limit(1);
      if (defaultGw.length === 0) {
        const anyGw = await this.db
          .select()
          .from(paymentGatewayConfigs)
          .where(and(
            eq(paymentGatewayConfigs.tenantId, tenantId),
            eq(paymentGatewayConfigs.isActive, true),
            eq(paymentGatewayConfigs.status, 'ACTIVE'),
          ))
          .limit(1);
        if (anyGw.length === 0) throw new Error('No payment gateways configured for tenant');
        gatewayName = anyGw[0].gatewayName;
      } else {
        gatewayName = defaultGw[0].gatewayName;
      }
    }

    const gw = await this.initGatewayForTenant(gatewayName, tenantId);

    const [payment] = await this.db
      .insert(payments)
      .values({
        tenantId,
        clientId: data.clientId,
        invoiceId: data.invoiceId,
        subscriptionId: data.subscriptionId,
        amount: String(data.amount),
        currency: data.currency.toUpperCase(),
        status: 'PENDING',
        gateway: gatewayName,
        metadata: data.metadata ?? {},
        description: data.description,
      })
      .returning();

    const startTime = Date.now();
    let result: PaymentResult;
    try {
      if (this.ctx.retry) {
        const { RetryManager } = await import('@panel1/core');
        result = await this.ctx.retry.executeWithRetry(
          () => gw.createPayment({
            amount: data.amount,
            currency: data.currency,
            description: data.description,
            customerId: data.customerId,
            metadata: { ...data.metadata, paymentId: payment.id, tenantId },
          }),
          RetryManager.PAYMENT_CONFIG,
          `payment-create-${payment.id}`,
        );
      } else {
        result = await gw.createPayment({
          amount: data.amount,
          currency: data.currency,
          description: data.description,
          customerId: data.customerId,
          metadata: { ...data.metadata, paymentId: payment.id, tenantId },
        });
      }
    } catch (error) {
      const processingMs = Date.now() - startTime;
      await this.db.insert(paymentAttempts).values({
        paymentId: payment.id,
        gatewayName,
        attemptNumber: 1,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        processingTimeMs: processingMs,
      });
      await this.db
        .update(payments)
        .set({
          status: 'FAILED',
          failureReason: error instanceof Error ? error.message : 'Unknown error',
          lastError: error instanceof Error ? error.message : 'Unknown error',
          updatedAt: new Date(),
        })
        .where(eq(payments.id, payment.id));

      await this.ctx.emit('payment.failed', {
        paymentId: payment.id,
        amount: data.amount,
        currency: data.currency,
        tenantId,
        gatewayName,
        reason: error instanceof Error ? error.message : 'Unknown error',
        invoiceId: data.invoiceId,
      });

      throw error;
    }

    const processingMs = Date.now() - startTime;
    await this.db.insert(paymentAttempts).values({
      paymentId: payment.id,
      gatewayName,
      attemptNumber: 1,
      status: 'success',
      processingTimeMs: processingMs,
    });

    const newStatus: string = result.status === 'completed' ? 'COMPLETED' : result.status === 'failed' ? 'FAILED' : 'PENDING';
    await this.db
      .update(payments)
      .set({
        status: newStatus,
        gatewayPaymentId: result.externalId ?? result.id,
        gatewayResponse: result as any,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id));

    await this.ctx.emit('payment.initiated', {
      paymentId: payment.id,
      amount: data.amount,
      currency: data.currency,
      tenantId,
      gatewayName,
    });

    if (result.status === 'completed') {
      await this.ctx.emit('payment.succeeded', {
        paymentId: payment.id,
        amount: data.amount,
        currency: data.currency,
        tenantId,
        gatewayName,
        invoiceId: data.invoiceId,
      });
    }

    return {
      id: payment.id,
      clientSecret: result.externalId,
      status: newStatus,
      amount: data.amount,
      currency: data.currency,
      gateway: gatewayName,
    };
  }

  async capturePayment(paymentId: string, tenantId: string, amount?: number): Promise<CaptureResult> {
    const [payment] = await this.db
      .select()
      .from(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.tenantId, tenantId)))
      .limit(1);
    if (!payment) throw new Error('Payment not found');
    if (payment.status !== 'AUTHORIZED') throw new Error('Payment is not in AUTHORIZED state');

    const gw = await this.initGatewayForTenant(payment.gateway, tenantId);
    const result = await gw.capturePayment(payment.gatewayPaymentId || payment.id);

    const newStatus = result.status === 'captured' ? 'CAPTURED' : 'FAILED';
    await this.db
      .update(payments)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(payments.id, paymentId));

    return {
      id: paymentId,
      status: newStatus,
      amount: result.capturedAmount,
      currency: payment.currency,
    };
  }

  async refundPayment(paymentId: string, tenantId: string, amount?: number, reason?: string): Promise<RefundResultDTO> {
    const [payment] = await this.db
      .select()
      .from(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.tenantId, tenantId)))
      .limit(1);
    if (!payment) throw new Error('Payment not found');
    if (payment.status !== 'COMPLETED' && payment.status !== 'CAPTURED') {
      throw new Error('Can only refund completed or captured payments');
    }

    const gw = await this.initGatewayForTenant(payment.gateway, tenantId);
    const result = await gw.refund(payment.gatewayPaymentId || payment.id, amount);

    const refundAmount = result.refundedAmount ?? (amount ?? parseFloat(payment.amount));
    await this.db
      .update(payments)
      .set({
        refundedAmount: String(refundAmount),
        refundStatus: result.status === 'refunded' || result.status === 'partial' ? 'SUCCEEDED' : 'FAILED',
        refundedAt: new Date(),
        status: amount && amount < parseFloat(payment.amount) ? 'PARTIALLY_REFUNDED' : 'REFUNDED',
        updatedAt: new Date(),
      })
      .where(eq(payments.id, paymentId));

    await this.ctx.emit('payment.refunded', {
      paymentId,
      amount: refundAmount,
      tenantId,
      reason: reason || 'Manual refund',
    });

    return {
      id: result.id,
      status: result.status,
      amount: refundAmount,
      currency: payment.currency,
      reason,
    };
  }

  async getPayment(id: string, tenantId: string): Promise<PaymentDTO | null> {
    const [payment] = await this.db
      .select()
      .from(payments)
      .where(and(eq(payments.id, id), eq(payments.tenantId, tenantId)))
      .limit(1);
    return payment ? (payment as PaymentDTO) : null;
  }

  async listPayments(filters: PaymentFilters, pagination: PaginationInput, tenantId: string): Promise<PaginatedPayments> {
    const conditions: any[] = [eq(payments.tenantId, tenantId)];
    if (filters.status) conditions.push(eq(payments.status, filters.status));
    if (filters.gateway) conditions.push(eq(payments.gateway, filters.gateway));
    if (filters.clientId) conditions.push(eq(payments.clientId, filters.clientId));
    if (filters.invoiceId) conditions.push(eq(payments.invoiceId, filters.invoiceId));
    if (filters.subscriptionId) conditions.push(eq(payments.subscriptionId, filters.subscriptionId));
    if (filters.createdAfter) conditions.push(gte(payments.createdAt, filters.createdAfter));
    if (filters.createdBefore) conditions.push(lt(payments.createdAt, filters.createdBefore));
    if (filters.search) {
      conditions.push(
        sql`${payments.description} ILIKE ${`%${filters.search}%`} OR ${payments.id} ILIKE ${`%${filters.search}%`}`,
      );
    }

    const limit = pagination.limit ?? 20;
    const offset = pagination.offset ?? 0;

    const rows = await this.db
      .select()
      .from(payments)
      .where(and(...conditions))
      .orderBy(desc(payments.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ total }] = await this.db
      .select({ total: count() })
      .from(payments)
      .where(and(...conditions));

    return { payments: rows as PaymentDTO[], total, hasMore: offset + limit < total };
  }

  async getGateway(id: string, tenantId: string): Promise<GatewayDTO | null> {
    const [gw] = await this.db
      .select()
      .from(paymentGatewayConfigs)
      .where(and(eq(paymentGatewayConfigs.id, id), eq(paymentGatewayConfigs.tenantId, tenantId)))
      .limit(1);
    if (!gw) return null;
    return this.sanitizeGateway(gw);
  }

  async listGateways(tenantId: string): Promise<GatewayDTO[]> {
    const rows = await this.db
      .select()
      .from(paymentGatewayConfigs)
      .where(eq(paymentGatewayConfigs.tenantId, tenantId));
    return rows.map((r: any) => this.sanitizeGateway(r));
  }

  async createGateway(data: CreateGatewayInput, tenantId: string): Promise<GatewayDTO> {
    const gw = this.getGatewayInstance(data.gatewayName);

    if (data.isDefault) {
      await this.db
        .update(paymentGatewayConfigs)
        .set({ isDefault: false })
        .where(eq(paymentGatewayConfigs.tenantId, tenantId));
    }

    let encryptedConfig: any;
    const enc = this.ctx.encryption;
    if (enc) {
      encryptedConfig = enc.encrypt(JSON.stringify(data.config));
    } else {
      encryptedConfig = JSON.stringify(data.config);
    }

    const [created] = await this.db
      .insert(paymentGatewayConfigs)
      .values({
        gatewayName: data.gatewayName,
        displayName: data.displayName,
        config: encryptedConfig,
        isDefault: data.isDefault ?? false,
        isActive: data.isActive ?? false,
        supportedCurrencies: data.supportedCurrencies,
        supportedPaymentMethods: data.supportedPaymentMethods,
        features: data.features,
        webhookUrl: data.webhookUrl,
        webhookSecret: data.webhookSecret,
        apiEndpoint: data.apiEndpoint,
        status: 'PENDING_SETUP',
        tenantId,
      })
      .returning();

    return this.sanitizeGateway(created);
  }

  async updateGateway(id: string, data: UpdateGatewayInput, tenantId: string): Promise<GatewayDTO> {
    const [existing] = await this.db
      .select()
      .from(paymentGatewayConfigs)
      .where(and(eq(paymentGatewayConfigs.id, id), eq(paymentGatewayConfigs.tenantId, tenantId)))
      .limit(1);
    if (!existing) throw new Error('Gateway not found');

    if (data.isDefault) {
      await this.db
        .update(paymentGatewayConfigs)
        .set({ isDefault: false })
        .where(and(eq(paymentGatewayConfigs.tenantId, tenantId), eq(paymentGatewayConfigs.id, id)));
    }

    const updatePayload: any = { ...data, updatedAt: new Date() };

    if (data.config) {
      const enc = this.ctx.encryption;
      if (enc) {
        updatePayload.config = enc.encrypt(JSON.stringify(data.config));
      } else {
        updatePayload.config = JSON.stringify(data.config);
      }
    }

    const [updated] = await this.db
      .update(paymentGatewayConfigs)
      .set(updatePayload)
      .where(and(eq(paymentGatewayConfigs.id, id), eq(paymentGatewayConfigs.tenantId, tenantId)))
      .returning();

    return this.sanitizeGateway(updated);
  }

  async deleteGateway(id: string, tenantId: string): Promise<void> {
    const [existing] = await this.db
      .select()
      .from(paymentGatewayConfigs)
      .where(and(eq(paymentGatewayConfigs.id, id), eq(paymentGatewayConfigs.tenantId, tenantId)))
      .limit(1);
    if (!existing) throw new Error('Gateway not found');

    await this.db
      .delete(paymentGatewayConfigs)
      .where(and(eq(paymentGatewayConfigs.id, id), eq(paymentGatewayConfigs.tenantId, tenantId)));
  }

  async testGateway(id: string, tenantId: string): Promise<HealthCheckResultDTO> {
    const [gwConfig] = await this.db
      .select()
      .from(paymentGatewayConfigs)
      .where(and(eq(paymentGatewayConfigs.id, id), eq(paymentGatewayConfigs.tenantId, tenantId)))
      .limit(1);
    if (!gwConfig) throw new Error('Gateway not found');

    const gw = this.getGatewayInstance(gwConfig.gatewayName);
    const decrypted = await this.decryptGatewayConfig(gwConfig);
    gw.initialize(decrypted);

    const startTime = Date.now();
    try {
      const testResult = await gw.createPayment({ amount: 0, currency: 'USD' });
      const responseTime = Date.now() - startTime;

      await this.db
        .update(paymentGatewayConfigs)
        .set({
          lastHealthCheck: new Date(),
          healthCheckStatus: 'healthy',
          status: 'ACTIVE',
          updatedAt: new Date(),
        })
        .where(eq(paymentGatewayConfigs.id, id));

      return { healthy: true, status: 'healthy', message: 'Gateway connection successful', responseTime };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const msg = error instanceof Error ? error.message : 'Unknown error';

      await this.db
        .update(paymentGatewayConfigs)
        .set({
          lastHealthCheck: new Date(),
          healthCheckStatus: 'unhealthy',
          status: 'ERROR',
          errorMessage: msg,
          updatedAt: new Date(),
        })
        .where(eq(paymentGatewayConfigs.id, id));

      return { healthy: false, status: 'unhealthy', message: msg, responseTime };
    }
  }

  async handleWebhook(gatewayName: string, payload: unknown, signature: string): Promise<{ processed: boolean; message?: string }> {
    const gw = this.gatewayRegistry.get(gatewayName);
    if (!gw) return { processed: false, message: `Gateway ${gatewayName} not found` };

    try {
      const result = await gw.handleWebhook(payload, signature);
      if (!result.handled || !result.externalId) {
        return { processed: false, message: `Webhook event not handled: ${result.eventType}` };
      }

      const [payment] = await this.db
        .select()
        .from(payments)
        .where(eq(payments.gatewayPaymentId, result.externalId))
        .limit(1);

      if (!payment) {
        return { processed: true, message: `No payment found for external ID: ${result.externalId}` };
      }

      if (result.eventType === 'payment_intent.succeeded') {
        await this.db
          .update(payments)
          .set({ status: 'COMPLETED', updatedAt: new Date() })
          .where(eq(payments.id, payment.id));

        await this.ctx.emit('payment.succeeded', {
          paymentId: payment.id,
          amount: parseFloat(payment.amount as string),
          currency: payment.currency,
          tenantId: payment.tenantId,
          gatewayName,
          invoiceId: payment.invoiceId ?? undefined,
        });
      } else if (result.eventType === 'payment_intent.payment_failed') {
        await this.db
          .update(payments)
          .set({ status: 'FAILED', updatedAt: new Date() })
          .where(eq(payments.id, payment.id));

        await this.ctx.emit('payment.failed', {
          paymentId: payment.id,
          amount: parseFloat(payment.amount as string),
          currency: payment.currency,
          tenantId: payment.tenantId,
          gatewayName,
          reason: 'Webhook: payment_intent.payment_failed',
          invoiceId: payment.invoiceId ?? undefined,
        });
      }

      return { processed: true, message: 'Webhook processed' };
    } catch (error) {
      return { processed: false, message: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  async retryFailedPayment(paymentId: string, tenantId: string): Promise<ChargeResult> {
    const [payment] = await this.db
      .select()
      .from(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.tenantId, tenantId)))
      .limit(1);
    if (!payment) throw new Error('Payment not found');
    if (payment.status !== 'FAILED') throw new Error('Can only retry failed payments');

    const newRetryCount = (payment.retryCount ?? 0) + 1;
    await this.db
      .update(payments)
      .set({
        retryCount: newRetryCount,
        status: 'PENDING',
        updatedAt: new Date(),
      })
      .where(eq(payments.id, paymentId));

    try {
      const gw = await this.initGatewayForTenant(payment.gateway, tenantId);
      const result = await gw.createPayment({
        amount: parseFloat(payment.amount as string),
        currency: payment.currency,
        description: payment.description ?? undefined,
        metadata: { ...payment.metadata, originalPaymentId: payment.id, retryCount: newRetryCount },
      });

      const newStatus: string = result.status === 'completed' ? 'COMPLETED' : 'PENDING';
      await this.db
        .update(payments)
        .set({
          status: newStatus,
          gatewayPaymentId: result.externalId ?? result.id,
          gatewayResponse: result as any,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, paymentId));

      await this.db.insert(paymentAttempts).values({
        paymentId: payment.id,
        gatewayName: payment.gateway,
        attemptNumber: newRetryCount,
        status: newStatus === 'COMPLETED' ? 'success' : 'failed',
      });

      return {
        id: paymentId,
        clientSecret: result.externalId,
        status: newStatus,
        amount: parseFloat(payment.amount as string),
        currency: payment.currency,
        gateway: payment.gateway,
      };
    } catch (error) {
      await this.db
        .update(payments)
        .set({
          status: 'FAILED',
          failureReason: error instanceof Error ? error.message : 'Unknown error',
          lastError: error instanceof Error ? error.message : 'Unknown error',
          updatedAt: new Date(),
        })
        .where(eq(payments.id, paymentId));

      await this.db.insert(paymentAttempts).values({
        paymentId: payment.id,
        gatewayName: payment.gateway,
        attemptNumber: newRetryCount,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  async retryStaleFailedPayments(): Promise<void> {
    const cutoff = new Date();
    cutoff.setMinutes(cutoff.getMinutes() - 30);

    const stale = await this.db
      .select()
      .from(payments)
      .where(and(
        eq(payments.status, 'FAILED'),
        lt(payments.nextRetryAt ?? payments.updatedAt, cutoff),
        sql`${payments.retryCount} < 3`,
      ))
      .limit(50);

    for (const p of stale) {
      try {
        await this.retryFailedPayment(p.id, p.tenantId);
      } catch (err) {
        this.ctx.logger.error(`Failed to retry payment ${p.id}:`, err);
      }
    }
  }

  async handleInvoiceSent(payload: any): Promise<void> {
    if (!payload?.invoiceId || !payload?.tenantId || !payload?.amount) return;

    const clientId = payload.clientId;
    try {
      await this.createCharge(
        {
          amount: payload.amount,
          currency: payload.currency || 'USD',
          invoiceId: payload.invoiceId,
          clientId,
          subscriptionId: payload.subscriptionId,
          metadata: { type: 'invoice_payment', invoiceId: payload.invoiceId },
        },
        payload.tenantId,
      );
    } catch (error) {
      this.ctx.logger.error(`Failed to auto-charge invoice ${payload.invoiceId}:`, error);
    }
  }

  private sanitizeGateway(gw: any): GatewayDTO {
    const result = { ...gw } as GatewayDTO;
    if (typeof gw.config === 'string' && this.ctx.encryption?.isEncrypted(gw.config)) {
      (result as any).config = '[encrypted]';
    } else if (gw.config && typeof gw.config === 'object') {
      (result as any).config = '[encrypted]';
    } else {
      (result as any).config = null;
    }
    if (gw.webhookSecret) {
      (result as any).webhookSecret = '[encrypted]';
    }
    return result;
  }
}

export { StripeGatewayImpl as StripeGateway };
