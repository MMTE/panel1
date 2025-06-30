import { db } from '../../db';
import { PaymentGatewayManager } from './core/PaymentGatewayManager';
import { StripeGateway } from './gateways/StripeGateway';
import { PaymentGateway, PaymentContext, RefundParams, RefundResult } from './interfaces/PaymentGateway';
import { EventService } from '../events/EventService';
import { Logger } from '../logging/Logger';
import { payments } from '../../db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Centralized Payment Service
 * Handles all payment operations across the application
 */
export class PaymentService {
  private static instance: PaymentService;
  private gatewayManager: PaymentGatewayManager;
  private initialized = false;
  private eventService = EventService.getInstance();
  private logger = Logger.getInstance();

  private constructor() {
    this.gatewayManager = new PaymentGatewayManager(db);
  }

  static getInstance(): PaymentService {
    if (!PaymentService.instance) {
      PaymentService.instance = new PaymentService();
    }
    return PaymentService.instance;
  }

  /**
   * Initialize the payment service and register all gateways
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('🔄 Initializing Payment Service...');

    try {
      // Initialize the gateway manager
      await this.gatewayManager.initialize();

      // Register available payment gateways
      await this.registerGateways();

      this.initialized = true;
      console.log('✅ Payment Service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Payment Service:', error);
      throw error;
    }
  }

  /**
   * Register all available payment gateways
   */
  private async registerGateways(): Promise<void> {
    // Register Stripe gateway
    const stripeGateway = new StripeGateway();
    await this.gatewayManager.registerGateway(stripeGateway);

    // TODO: Register other gateways (PayPal, Square, etc.)
    console.log('✅ Payment gateways registered');
  }

  /**
   * Process a refund for a payment
   */
  async processRefund(
    tenantId: string,
    paymentId: string,
    amount?: number,
    reason?: string
  ): Promise<RefundResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Get the payment details to determine gateway and context
      const payment = await db.query.payments.findFirst({
        where: (payments, { eq, and }) => and(
          eq(payments.id, paymentId),
          eq(payments.tenantId, tenantId)
        )
      });

      if (!payment) {
        throw new Error('Payment not found');
      }

      if (payment.status !== 'COMPLETED') {
        throw new Error('Can only refund completed payments');
      }

      // Get the gateway for this payment
      const gateway = await this.gatewayManager.getBestGateway({
        tenantId,
        amount: amount || parseFloat(payment.amount),
        currency: payment.currency || 'USD'
      });

      // Get gateway configuration
      const gatewayConfig = await this.gatewayManager.getGatewayConfig(tenantId, gateway.name);
      if (!gatewayConfig) {
        throw new Error(`Gateway ${gateway.name} not configured for tenant`);
      }

      // Initialize the gateway
      await gateway.initialize(gatewayConfig.config);

      // Process the refund
      const refundParams: RefundParams = {
        paymentId: payment.gatewayPaymentId || payment.gatewayId || payment.id,
        amount,
        reason,
        metadata: {
          tenantId,
          originalPaymentId: payment.id
        }
      };

      const refundResult = await gateway.refundPayment(refundParams);

      console.log(`✅ Refund processed: ${refundResult.id} for payment ${paymentId}`);
      return refundResult;

    } catch (error) {
      console.error('❌ Refund processing failed:', error);
      throw error;
    }
  }

  /**
   * Get the best gateway for a payment context
   */
  async getBestGateway(context: PaymentContext): Promise<PaymentGateway> {
    if (!this.initialized) {
      await this.initialize();
    }

    return await this.gatewayManager.getBestGateway(context);
  }

  /**
   * Get gateway manager instance
   */
  getGatewayManager(): PaymentGatewayManager {
    return this.gatewayManager;
  }

  /**
   * Setup a gateway for a tenant
   */
  async setupGateway(
    tenantId: string,
    gatewayName: string,
    config: {
      displayName: string;
      isActive: boolean;
      priority: number;
      config: Record<string, any>;
      supportedCurrencies: string[];
      supportedCountries: string[];
    }
  ) {
    if (!this.initialized) {
      await this.initialize();
    }

    return await this.gatewayManager.configureGateway(tenantId, gatewayName, config);
  }

  /**
   * Test gateway configuration
   */
  async testGateway(tenantId: string, gatewayName: string) {
    if (!this.initialized) {
      await this.initialize();
    }

    return await this.gatewayManager.testGatewayConfig(tenantId, gatewayName);
  }

  /**
   * Get available gateways for a tenant
   */
  async getAvailableGateways(tenantId: string) {
    if (!this.initialized) {
      await this.initialize();
    }

    return await this.gatewayManager.getAvailableGateways(tenantId);
  }

  /**
   * Update payment status and emit corresponding events
   */
  async updatePaymentStatus(
    tenantId: string,
    paymentId: string,
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      // Update payment status in database
      await db
        .update(payments)
        .set({
          status,
          updatedAt: new Date(),
          metadata: metadata || {},
        })
        .where(
          and(
            eq(payments.id, paymentId),
            eq(payments.tenantId, tenantId)
          )
        );

      // Get payment details for event emission
      const [payment] = await db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.id, paymentId),
            eq(payments.tenantId, tenantId)
          )
        )
        .limit(1);

      if (!payment) {
        throw new Error('Payment not found after update');
      }

      // Emit appropriate event based on status
      switch (status) {
        case 'COMPLETED':
          await this.eventService.emit('payment.succeeded', {
            paymentId: payment.id,
            invoiceId: payment.invoiceId,
            tenantId: payment.tenantId,
            amount: parseFloat(payment.amount),
            currency: payment.currency,
            gatewayPaymentId: payment.gatewayPaymentId || payment.gatewayId,
            metadata: payment.metadata,
          });
          this.logger.info(`Payment ${paymentId} marked as completed and event emitted`);
          break;

        case 'FAILED':
          await this.eventService.emit('payment.failed', {
            paymentId: payment.id,
            invoiceId: payment.invoiceId,
            tenantId: payment.tenantId,
            errorCode: metadata?.errorCode,
            errorMessage: metadata?.errorMessage,
            metadata: payment.metadata,
          });
          this.logger.info(`Payment ${paymentId} marked as failed and event emitted`);
          break;

        default:
          this.logger.info(`Payment ${paymentId} status updated to ${status}`);
          break;
      }
    } catch (error) {
      this.logger.error(`Failed to update payment status for payment ${paymentId}:`, error);
      throw error;
    }
  }

  /**
   * Handle webhook from payment gateway
   */
  async handleWebhook(
    gatewayName: string,
    payload: any,
    signature: string
  ): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const gateway = await this.gatewayManager.getGateway(gatewayName);
      if (!gateway) {
        throw new Error(`Gateway ${gatewayName} not found`);
      }

      // Verify webhook signature
      if (!gateway.verifyWebhookSignature(JSON.stringify(payload), signature)) {
        throw new Error('Invalid webhook signature');
      }

      // Process the webhook
      const result = await gateway.handleWebhook(payload);

      if (result.processed && result.paymentId && result.status) {
        // Update payment status based on webhook result
        await this.updatePaymentStatus(
          result.data?.metadata?.tenantId || '',
          result.paymentId,
          result.status === 'succeeded' ? 'COMPLETED' : 
          result.status === 'failed' ? 'FAILED' : 'PROCESSING',
          result.data
        );
      }

      this.logger.info(`Webhook processed successfully for gateway ${gatewayName}`);
    } catch (error) {
      this.logger.error(`Failed to process webhook for gateway ${gatewayName}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const paymentService = PaymentService.getInstance(); 