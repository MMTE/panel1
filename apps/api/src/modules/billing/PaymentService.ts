import { db } from '../../db';
type Database = typeof db;
import { PaymentGatewayManager } from '../../lib/payments/core/PaymentGatewayManager';
import { PaymentContext } from '../../lib/payments/interfaces/PaymentGateway';
import { 
  payments, 
  paymentAttempts, 
  invoices, 
  NewPayment, 
  NewPaymentAttempt 
} from '../../db/schema';
import { eq, and } from 'drizzle-orm';

export interface CreatePaymentParams {
  invoiceId: string;
  tenantId: string;
  paymentMethodType: 'card' | 'paypal' | 'manual';
  paymentMethodData?: Record<string, any>;
  billingAddress?: {
    country: string;
    state?: string;
    city?: string;
    line1?: string;
    line2?: string;
    postalCode?: string;
  };
  returnUrl?: string;
  cancelUrl?: string;
}

export interface PaymentResult {
  payment: any; // Payment record from database
  clientSecret?: string;
  gateway: string;
  requiresAction: boolean;
  nextActionUrl?: string;
  status: string;
}

/**
 * Payment Service
 * Handles payment processing and integrates with billing system
 */
export class PaymentService {
  constructor(
    private db: Database,
    private gatewayManager: PaymentGatewayManager
  ) {}

  /**
   * Process a payment for an invoice
   */
  async processPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    console.log(`🔄 Processing payment for invoice ${params.invoiceId}`);

    // Get invoice details
    const invoice = await this.getInvoice(params.invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.status === 'PAID') {
      throw new Error('Invoice is already paid');
    }

    // Create payment context for gateway selection
    const paymentContext: PaymentContext = {
      tenantId: params.tenantId,
      amount: parseFloat(invoice.total),
      currency: invoice.currency || 'USD',
      billingCountry: params.billingAddress?.country,
      paymentMethodType: params.paymentMethodType,
      isRecurring: false, // TODO: Determine from subscription
    };

    // Get the best gateway for this payment
    const gateway = await this.gatewayManager.getBestGateway(paymentContext);
    console.log(`💳 Selected gateway: ${gateway.displayName}`);

    // Initialize gateway with tenant configuration
    const gatewayConfig = await this.gatewayManager.getGatewayConfig(
      params.tenantId, 
      gateway.name
    );
    
    if (!gatewayConfig) {
      throw new Error(`Gateway ${gateway.name} not configured for tenant`);
    }

    await gateway.initialize(gatewayConfig.config as any);

    // Record payment attempt
    const attemptNumber = await this.getNextAttemptNumber(params.invoiceId, gateway.name);

    try {
      // Create payment intent with gateway
      const paymentIntent = await gateway.createPaymentIntent({
        amount: parseFloat(invoice.total),
        currency: invoice.currency || 'USD',
        tenantId: params.tenantId,
        invoiceId: params.invoiceId,
        customerId: invoice.clientId || undefined,
        returnUrl: params.returnUrl,
        cancelUrl: params.cancelUrl,
        metadata: {
          invoiceNumber: invoice.invoiceNumber,
          tenantId: params.tenantId,
        },
      });

      // Create payment record in database
      const [payment] = await this.db
        .insert(payments)
        .values({
          invoiceId: params.invoiceId,
          amount: invoice.total,
          currency: invoice.currency || 'USD',
          status: 'PENDING',
          gateway: gateway.name,
          gatewayId: paymentIntent.id,
          gatewayResponse: paymentIntent.gatewayData,
          tenantId: params.tenantId,
        })
        .returning();

      // Record successful attempt
      await this.recordPaymentAttempt({
        paymentId: payment.id,
        gatewayName: gateway.name,
        attemptNumber,
        status: 'pending',
        gatewayResponse: paymentIntent.gatewayData,
      });

      console.log(`✅ Payment created: ${payment.id}`);

      return {
        payment,
        clientSecret: paymentIntent.clientSecret,
        gateway: gateway.name,
        requiresAction: paymentIntent.requiresAction || false,
        nextActionUrl: paymentIntent.nextAction?.redirectUrl,
        status: paymentIntent.status,
      };

    } catch (error) {
      console.error(`❌ Payment processing failed:`, error);

      // Record failed attempt
      await this.recordPaymentAttempt({
        paymentId: 'temp-id', // We don't have a payment ID yet
        gatewayName: gateway.name,
        attemptNumber,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        gatewayResponse: { error: error instanceof Error ? error.message : 'Unknown error' },
      });

      throw error;
    }
  }

  /**
   * Confirm a payment (for client-side confirmation)
   */
  async confirmPayment(paymentId: string, paymentIntentId: string): Promise<PaymentResult> {
    console.log(`🔄 Confirming payment ${paymentId}`);

    // Get payment record
    const payment = await this.getPayment(paymentId);
    if (!payment) {
      throw new Error('Payment not found');
    }

    // Get gateway
    const gateway = this.gatewayManager.getGateway(payment.gateway);
    if (!gateway) {
      throw new Error(`Gateway ${payment.gateway} not available`);
    }

    // Initialize gateway
    const gatewayConfig = await this.gatewayManager.getGatewayConfig(
      payment.tenantId || '', 
      payment.gateway
    );
    await gateway.initialize(gatewayConfig?.config as any);

    try {
      // Confirm payment with gateway
      const result = await gateway.confirmPayment({
        paymentIntentId,
      });

      // Update payment status
      await this.updatePaymentStatus(paymentId, result.status, result.gatewayData);

      console.log(`✅ Payment confirmed: ${paymentId} - ${result.status}`);

      return {
        payment: { ...payment, status: result.status },
        gateway: payment.gateway,
        requiresAction: result.status === 'requires_action',
        status: result.status,
      };

    } catch (error) {
      console.error(`❌ Payment confirmation failed:`, error);
      
      // Update payment with error
      await this.updatePaymentStatus(paymentId, 'failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });

      throw error;
    }
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(paymentId: string): Promise<any> {
    const payment = await this.getPayment(paymentId);
    if (!payment) {
      throw new Error('Payment not found');
    }

    return {
      id: payment.id,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      gateway: payment.gateway,
      gatewayId: payment.gatewayId,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }

  /**
   * Handle webhook from payment gateway
   */
  async handleWebhook(gatewayName: string, payload: any): Promise<void> {
    console.log(`🔗 Handling webhook from ${gatewayName}`);

    const gateway = this.gatewayManager.getGateway(gatewayName);
    if (!gateway) {
      throw new Error(`Gateway ${gatewayName} not found`);
    }

    const result = await gateway.handleWebhook(payload);
    
    if (result.processed && result.paymentId) {
      await this.updatePaymentFromWebhook(result);
    }
  }

  /**
   * Get invoice by ID
   */
  private async getInvoice(invoiceId: string) {
    return await this.db.query.invoices.findFirst({
      where: eq(invoices.id, invoiceId),
    });
  }

  /**
   * Get payment by ID
   */
  private async getPayment(paymentId: string) {
    return await this.db.query.payments.findFirst({
      where: eq(payments.id, paymentId),
    });
  }

  /**
   * Update payment status
   */
  private async updatePaymentStatus(
    paymentId: string, 
    status: string, 
    gatewayData?: any
  ): Promise<void> {
    await this.db
      .update(payments)
      .set({
        status: status.toUpperCase() as any,
        gatewayResponse: gatewayData,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, paymentId));

    // If payment succeeded, mark invoice as paid
    if (status === 'succeeded') {
      const payment = await this.getPayment(paymentId);
      if (payment) {
        await this.markInvoiceAsPaid(payment.invoiceId || '');
      }
    }
  }

  /**
   * Mark invoice as paid
   */
  private async markInvoiceAsPaid(invoiceId: string): Promise<void> {
    await this.db
      .update(invoices)
      .set({
        status: 'PAID',
        paidAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));

    console.log(`📄 Invoice ${invoiceId} marked as paid`);
  }

  /**
   * Record payment attempt
   */
  private async recordPaymentAttempt(attempt: {
    paymentId: string;
    gatewayName: string;
    attemptNumber: number;
    status: string;
    errorMessage?: string;
    gatewayResponse?: any;
  }): Promise<void> {
    if (attempt.paymentId === 'temp-id') {
      // Skip recording attempt if we don't have a real payment ID
      return;
    }

    await this.db.insert(paymentAttempts).values({
      paymentId: attempt.paymentId,
      gatewayName: attempt.gatewayName,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      errorMessage: attempt.errorMessage,
      gatewayResponse: attempt.gatewayResponse,
    });
  }

  /**
   * Get next attempt number for a payment
   */
  private async getNextAttemptNumber(invoiceId: string, gatewayName: string): Promise<number> {
    const lastAttempt = await this.db.query.paymentAttempts.findFirst({
      where: and(
        eq(paymentAttempts.gatewayName, gatewayName)
      ),
      orderBy: (paymentAttempts, { desc }) => [desc(paymentAttempts.attemptNumber)],
    });

    return (lastAttempt?.attemptNumber || 0) + 1;
  }

  /**
   * Update payment from webhook result
   */
  private async updatePaymentFromWebhook(result: any): Promise<void> {
    if (!result.paymentId) return;

    const payment = await this.db.query.payments.findFirst({
      where: eq(payments.gatewayId, result.paymentId),
    });

    if (payment) {
      await this.updatePaymentStatus(payment.id, result.status, result.data);
    }
  }
} 