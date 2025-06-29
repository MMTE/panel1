import Stripe from 'stripe';
import {
  PaymentGateway,
  PaymentCapabilities,
  GatewayConfig,
  PaymentIntentParams,
  PaymentIntent,
  PaymentResult,
  ConfirmPaymentParams,
  RefundParams,
  RefundResult,
  WebhookResult,
  HealthCheckResult,
  PaymentStatus,
} from '../interfaces/PaymentGateway';

interface StripeConfig extends GatewayConfig {
  secretKey: string;
  webhookSecret?: string;
  publishableKey?: string;
}

/**
 * Stripe Payment Gateway Implementation
 */
export class StripeGateway implements PaymentGateway {
  public readonly name = 'stripe';
  public readonly displayName = 'Stripe';
  public readonly supportedCurrencies = [
    'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK',
    'PLN', 'CZK', 'HUF', 'BGN', 'HRK', 'RON', 'SGD', 'HKD', 'INR', 'MYR',
    'PHP', 'THB', 'MXN', 'BRL', 'ARS', 'CLP', 'COP', 'PEN', 'UYU'
  ];
  public readonly supportedCountries = [
    'US', 'CA', 'GB', 'AU', 'AT', 'BE', 'BR', 'BG', 'HR', 'CY', 'CZ', 'DK',
    'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT',
    'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'CH', 'NO', 'IN', 'SG',
    'HK', 'JP', 'MY', 'MX', 'TH', 'PH', 'NZ'
  ];
  public readonly capabilities: PaymentCapabilities = {
    supportsRecurring: true,
    supportsRefunds: true,
    supportsPartialRefunds: true,
    supportsHolds: true,
    supportsInstantPayouts: true,
    supportsMultiPartyPayments: true,
    supports3DSecure: true,
    supportsWallets: ['apple_pay', 'google_pay', 'link'],
    supportedPaymentMethods: [
      'card',
      'bank_transfer',
      'klarna',
      'afterpay_clearpay',
      'sofort',
      'ideal',
      'giropay',
      'eps',
      'p24',
      'bancontact',
      'alipay',
      'wechat_pay'
    ],
  };

  private stripe: Stripe | null = null;
  private config: StripeConfig | null = null;

  /**
   * Initialize Stripe with configuration
   */
  async initialize(config: StripeConfig): Promise<void> {
    if (!config.secretKey) {
      throw new Error('Stripe secret key is required');
    }

    this.config = config;
    this.stripe = new Stripe(config.secretKey, {
      apiVersion: '2025-05-28.basil',
      appInfo: {
        name: 'Panel1',
        version: '0.1.0',
        url: 'https://panel1.dev',
      },
    });

    // Verify the API key by making a test request
    await this.healthCheck();
  }

  /**
   * Health check to verify Stripe connection
   */
  async healthCheck(): Promise<HealthCheckResult> {
    if (!this.stripe) {
      return {
        healthy: false,
        status: 'unhealthy',
        message: 'Stripe not initialized',
      };
    }

    const startTime = Date.now();

    try {
      // Test API connection by retrieving account info
      await this.stripe.accounts.retrieve();
      
      const responseTime = Date.now() - startTime;

      return {
        healthy: true,
        status: 'healthy',
        message: 'Stripe API connection successful',
        responseTime,
        checks: {
          apiConnection: true,
          webhookEndpoint: true,
          configuration: true,
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        healthy: false,
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        responseTime,
        checks: {
          apiConnection: false,
          webhookEndpoint: false,
          configuration: false,
        },
      };
    }
  }

  /**
   * Create a payment intent
   */
  async createPaymentIntent(params: PaymentIntentParams): Promise<PaymentIntent> {
    if (!this.stripe) {
      throw new Error('Stripe gateway not initialized');
    }

    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(params.amount * 100), // Convert to cents
        currency: params.currency.toLowerCase(),
        metadata: {
          tenantId: params.tenantId,
          invoiceId: params.invoiceId,
          customerId: params.customerId || '',
          ...params.metadata,
        },
        automatic_payment_methods: {
          enabled: true,
        },
        capture_method: params.captureMethod || 'automatic',
        setup_future_usage: params.customerId ? 'off_session' : undefined,
      });

      return {
        id: paymentIntent.id,
        clientSecret: paymentIntent.client_secret!,
        amount: params.amount,
        currency: params.currency,
        status: this.mapStripeStatus(paymentIntent.status),
        gatewayData: paymentIntent,
        requiresAction: paymentIntent.status === 'requires_action',
        nextAction: paymentIntent.next_action ? {
          type: paymentIntent.next_action.type,
          redirectUrl: paymentIntent.next_action.redirect_to_url?.url || undefined,
        } : undefined,
      };
    } catch (error) {
      console.error('Stripe createPaymentIntent error:', error);
      throw new Error(`Failed to create Stripe payment intent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Confirm a payment
   */
  async confirmPayment(params: ConfirmPaymentParams): Promise<PaymentResult> {
    if (!this.stripe) {
      throw new Error('Stripe gateway not initialized');
    }

    try {
      const paymentIntent = await this.stripe.paymentIntents.confirm(
        params.paymentIntentId,
        {
          payment_method: params.paymentMethodId,
          return_url: params.returnUrl,
        }
      );

      return {
        id: paymentIntent.id,
        status: this.mapStripeStatus(paymentIntent.status),
        amount: paymentIntent.amount / 100, // Convert from cents
        currency: paymentIntent.currency.toUpperCase(),
        chargeId: paymentIntent.latest_charge as string || undefined,
        receiptUrl: undefined, // Will be available in webhook
        gatewayData: paymentIntent,
      };
    } catch (error) {
      console.error('Stripe confirmPayment error:', error);
      
      const stripeError = error as any; // Use any for compatibility
      return {
        id: params.paymentIntentId,
        status: 'failed',
        amount: 0,
        currency: 'USD',
        errorCode: stripeError.code,
        errorMessage: stripeError.message,
        gatewayData: error,
      };
    }
  }

  /**
   * Refund a payment
   */
  async refundPayment(params: RefundParams): Promise<RefundResult> {
    if (!this.stripe) {
      throw new Error('Stripe gateway not initialized');
    }

    try {
      // Find the charge associated with the payment intent
      const paymentIntent = await this.stripe.paymentIntents.retrieve(params.paymentId, {
        expand: ['charges']
      });
      const chargeId = (paymentIntent as any).charges?.data[0]?.id;
      
      if (!chargeId) {
        throw new Error('No charge found for payment intent');
      }

      const refund = await this.stripe.refunds.create({
        charge: chargeId,
        amount: params.amount ? Math.round(params.amount * 100) : undefined,
        reason: params.reason as Stripe.RefundCreateParams.Reason,
        metadata: params.metadata,
      });

      return {
        id: refund.id,
        status: this.mapRefundStatus(refund.status || 'pending'),
        amount: refund.amount / 100,
        currency: refund.currency.toUpperCase(),
        reason: refund.reason || undefined,
        gatewayData: refund,
      };
    } catch (error) {
      console.error('Stripe refundPayment error:', error);
      throw new Error(`Failed to process Stripe refund: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.config?.webhookSecret) {
      console.warn('Stripe webhook secret not configured');
      return false;
    }

    try {
      this.stripe?.webhooks.constructEvent(payload, signature, this.config.webhookSecret);
      return true;
    } catch (error) {
      console.error('Stripe webhook signature verification failed:', error);
      return false;
    }
  }

  /**
   * Handle Stripe webhook
   */
  async handleWebhook(payload: any): Promise<WebhookResult> {
    try {
      const event = payload as Stripe.Event;
      
      switch (event.type) {
        case 'payment_intent.succeeded':
          return await this.handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        
        case 'payment_intent.payment_failed':
          return await this.handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
        
        case 'payment_intent.requires_action':
          return await this.handlePaymentIntentRequiresAction(event.data.object as Stripe.PaymentIntent);
        
        case 'charge.dispute.created':
          return await this.handleChargeDisputeCreated(event.data.object as Stripe.Dispute);
        
        case 'invoice.payment_succeeded':
          return await this.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        
        case 'customer.subscription.updated':
          return await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        
        default:
          return {
            processed: false,
            message: `Unhandled Stripe event type: ${event.type}`,
          };
      }
    } catch (error) {
      console.error('Stripe webhook handling error:', error);
      return {
        processed: false,
        message: `Error handling Stripe webhook: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Handle successful payment intent
   */
  private async handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<WebhookResult> {
    return {
      processed: true,
      message: 'Payment succeeded',
      paymentId: paymentIntent.id,
      status: 'succeeded',
      data: {
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency.toUpperCase(),
        chargeId: paymentIntent.latest_charge as string,
        receiptUrl: undefined, // Available via expanded charges
        metadata: paymentIntent.metadata,
      },
    };
  }

  /**
   * Handle failed payment intent
   */
  private async handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent): Promise<WebhookResult> {
    const lastError = paymentIntent.last_payment_error;
    
    return {
      processed: true,
      message: 'Payment failed',
      paymentId: paymentIntent.id,
      status: 'failed',
      data: {
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency.toUpperCase(),
        errorCode: lastError?.code,
        errorMessage: lastError?.message,
        metadata: paymentIntent.metadata,
      },
    };
  }

  /**
   * Handle payment intent requiring action
   */
  private async handlePaymentIntentRequiresAction(paymentIntent: Stripe.PaymentIntent): Promise<WebhookResult> {
    return {
      processed: true,
      message: 'Payment requires action',
      paymentId: paymentIntent.id,
      status: 'requires_action',
      data: {
        nextAction: paymentIntent.next_action,
        metadata: paymentIntent.metadata,
      },
    };
  }

  /**
   * Handle charge dispute created
   */
  private async handleChargeDisputeCreated(dispute: Stripe.Dispute): Promise<WebhookResult> {
    return {
      processed: true,
      message: 'Charge dispute created',
      data: {
        disputeId: dispute.id,
        chargeId: dispute.charge,
        amount: dispute.amount / 100,
        currency: dispute.currency.toUpperCase(),
        reason: dispute.reason,
        status: dispute.status,
      },
    };
  }

  /**
   * Handle invoice payment succeeded
   */
  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<WebhookResult> {
    return {
      processed: true,
      message: 'Invoice payment succeeded',
      data: {
        invoiceId: invoice.id,
        subscriptionId: (invoice as any).subscription as string || undefined,
        customerId: invoice.customer as string,
        amountPaid: (invoice.amount_paid || 0) / 100,
        currency: (invoice.currency || 'usd').toUpperCase(),
      },
    };
  }

  /**
   * Handle subscription updated
   */
  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<WebhookResult> {
    return {
      processed: true,
      message: 'Subscription updated',
      data: {
        subscriptionId: subscription.id,
        customerId: subscription.customer,
        status: subscription.status,
        currentPeriodStart: new Date((subscription as any).current_period_start * 1000),
        currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
      },
    };
  }

  /**
   * Map Stripe payment intent status to our standard status
   */
  private mapStripeStatus(status: Stripe.PaymentIntent.Status): PaymentStatus {
    const statusMap: Record<Stripe.PaymentIntent.Status, PaymentStatus> = {
      'requires_payment_method': 'requires_payment_method',
      'requires_confirmation': 'requires_confirmation',
      'requires_action': 'requires_action',
      'processing': 'processing',
      'requires_capture': 'requires_capture',
      'succeeded': 'succeeded',
      'canceled': 'canceled',
    };

    return statusMap[status] || 'pending';
  }

  /**
   * Map Stripe refund status to our standard status
   */
  private mapRefundStatus(status: string): 'pending' | 'succeeded' | 'failed' | 'canceled' {
    switch (status) {
      case 'pending':
        return 'pending';
      case 'succeeded':
        return 'succeeded';
      case 'failed':
        return 'failed';
      case 'canceled':
        return 'canceled';
      default:
        return 'pending';
    }
  }
} 