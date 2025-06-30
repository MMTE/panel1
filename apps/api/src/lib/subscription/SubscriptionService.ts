import { db } from '../../db';
import { 
  subscriptions, 
  invoices, 
  payments, 
  plans, 
  clients,
  subscriptionStateChanges,
  NewSubscriptionStateChange,
  subscribedComponents,
  components,
  productComponents,
  products,
  tenants
} from '../../db/schema';
import { eq, and, lte, gte, isNull, desc } from 'drizzle-orm';
import { SubscriptionError, NotFoundError, ConflictError } from '../errors';
import { logger } from '../logging/Logger';
import { retryManager, RetryManager } from '../resilience/RetryManager';
import { EventService } from '../events/EventService';
import { TaxCalculationService } from '../invoice/TaxCalculationService';

export interface SubscriptionRenewalResult {
  success: boolean;
  invoiceId?: string;
  paymentId?: string;
  error?: string;
  nextBillingDate?: Date;
}

export interface SubscriptionCancellationResult {
  success: boolean;
  canceledAt: Date;
  refundAmount?: number;
  refundId?: string;
}

export interface ProrationResult {
  creditAmount: number;
  chargeAmount: number;
  netAmount: number;
  proratedDays: number;
}

export interface CreateSubscriptionParams {
  clientId: string;
  planId: string;
  productId?: string;
  paymentMethodId?: string;
  trialDays?: number;
  tenantId: string;
  metadata?: Record<string, any>;
}

export interface CreateSubscriptionResult {
  success: boolean;
  subscription?: any;
  error?: string;
}

export class SubscriptionService {
  private eventService = EventService.getInstance();

  /**
   * Create a new subscription
   */
  async createSubscription(params: CreateSubscriptionParams): Promise<CreateSubscriptionResult> {
    const correlationId = `create_subscription_${Date.now()}`;
    const operationLogger = logger.logOperation('createSubscription', {
      correlationId,
      ...params,
    });

    operationLogger.info('Starting subscription creation');

    try {
      // Get plan details
      const plan = await this.getPlan(params.planId);
      if (!plan) {
        throw new NotFoundError('Plan not found', { planId: params.planId });
      }

      // Calculate billing dates
      const now = new Date();
      const currentPeriodStart = now;
      const currentPeriodEnd = this.calculatePeriodEnd(now, plan.interval, plan.intervalCount || 1);
      const nextBillingDate = params.trialDays 
        ? new Date(now.getTime() + (params.trialDays * 24 * 60 * 60 * 1000))
        : currentPeriodEnd;

      // Create subscription
      const [subscription] = await db
        .insert(subscriptions)
        .values({
          clientId: params.clientId,
          planId: params.planId,
          status: params.trialDays ? 'TRIALING' : 'ACTIVE',
          currentPeriodStart,
          currentPeriodEnd,
          nextBillingDate,
          billingCycleAnchor: currentPeriodStart,
          trialStart: params.trialDays ? now : null,
          trialEnd: params.trialDays ? nextBillingDate : null,
          unitPrice: plan.price,
          paymentMethodId: params.paymentMethodId,
          metadata: params.metadata || {},
          tenantId: params.tenantId,
        })
        .returning();

      // If productId is provided, create subscribed components
      if (params.productId) {
        await this.createSubscribedComponentsForProduct(subscription.id, params.productId, params.tenantId);
      }

      // Log state change
      await this.logSubscriptionStateChange(
        subscription.id,
        'NONE',
        subscription.status,
        'subscription_created',
        { planId: params.planId, productId: params.productId },
        params.tenantId
      );

      // Emit subscription.activated event if the subscription is active
      if (subscription.status === 'ACTIVE') {
        await this.eventService.emit('subscription.activated', {
          subscriptionId: subscription.id
        }, {
          source: 'SubscriptionService',
          tenantId: params.tenantId
        });

        operationLogger.info('Emitted subscription.activated event', {
          subscriptionId: subscription.id
        });
      }

      operationLogger.success('Subscription created successfully', {
        subscriptionId: subscription.id,
        status: subscription.status
      });

      return {
        success: true,
        subscription
      };

    } catch (error) {
      const subscriptionError = new SubscriptionError(
        `Subscription creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CREATION_FAILED',
        {
          correlationId,
          ...params,
          originalError: error instanceof Error ? error.message : 'Unknown error',
        }
      );

      operationLogger.failure(subscriptionError);
      return {
        success: false,
        error: subscriptionError.message
      };
    }
  }

  /**
   * Create subscribed components for a product
   */
  private async createSubscribedComponentsForProduct(
    subscriptionId: string, 
    productId: string, 
    tenantId: string
  ): Promise<void> {
    // Get product components
    const productComponentsList = await db.query.productComponents.findMany({
      where: and(
        eq(productComponents.productId, productId),
        eq(productComponents.tenantId, tenantId)
      ),
      with: {
        component: true
      }
    });

    // Create subscribed components
    for (const productComponent of productComponentsList) {
      await db
        .insert(subscribedComponents)
        .values({
          subscriptionId,
          componentId: productComponent.componentId,
          productComponentId: productComponent.id,
          quantity: 1,
          configuration: productComponent.configuration || {},
          metadata: {
            provisioningStatus: 'pending'
          },
          tenantId
        });
    }
  }

  /**
   * Calculate period end date based on interval
   */
  private calculatePeriodEnd(start: Date, interval: string, intervalCount: number): Date {
    const end = new Date(start);
    
    switch (interval) {
      case 'MONTHLY':
        end.setMonth(end.getMonth() + intervalCount);
        break;
      case 'YEARLY':
        end.setFullYear(end.getFullYear() + intervalCount);
        break;
      case 'WEEKLY':
        end.setDate(end.getDate() + (7 * intervalCount));
        break;
      case 'DAILY':
        end.setDate(end.getDate() + intervalCount);
        break;
      default:
        // Default to monthly
        end.setMonth(end.getMonth() + intervalCount);
    }
    
    return end;
  }

  /**
   * Process subscription renewal
   */
  async processRenewal(subscriptionId: string, tenantId: string): Promise<SubscriptionRenewalResult> {
    const correlationId = `renewal_${subscriptionId}_${Date.now()}`;
    const operationLogger = logger.logOperation('processRenewal', {
      correlationId,
      subscriptionId,
      tenantId,
    });

    operationLogger.info('Starting subscription renewal');

    try {
      return await retryManager.executeWithRetry(
        async () => {
          // Get subscription details
          const subscription = await this.getSubscription(subscriptionId, tenantId);
          if (!subscription) {
            throw new NotFoundError('Subscription not found', {
              subscriptionId,
              tenantId,
            });
          }

          // Check if renewal is due
          if (!this.isRenewalDue(subscription)) {
            operationLogger.info('Renewal not due yet');
            return { success: false, error: 'Renewal not due' };
          }

          // Get plan details
          const plan = await this.getPlan(subscription.planId!);
          if (!plan) {
            throw new NotFoundError('Plan not found', {
              planId: subscription.planId,
              subscriptionId,
            });
          }

          // Create renewal invoice
          const invoice = await this.createRenewalInvoice(subscription, plan);

          // Emit subscription.renewal_started event
          await this.eventService.emit('subscription.renewal_started', {
            subscriptionId: subscription.id,
            tenantId: subscription.tenantId,
            invoiceId: invoice.id,
            planId: plan.id,
            amount: invoice.total,
            currency: invoice.currency,
          });
          
          // Attempt payment
          const paymentResult = await this.processRenewalPayment(subscription, invoice);

          if (paymentResult.success) {
            // Payment has been initiated successfully
            // Status updates and subscription changes will be handled by payment events
            operationLogger.info('Payment initiated successfully', {
              invoiceId: invoice.id,
              paymentId: paymentResult.payment?.id,
            });
            
            return {
              success: true,
              invoiceId: invoice.id,
              paymentId: paymentResult.payment?.id,
            };
          } else {
            // Handle failed payment initiation
            await this.handleFailedRenewalPayment(subscription, invoice, paymentResult.error || 'Payment failed');
            
            return {
              success: false,
              invoiceId: invoice.id,
              error: paymentResult.error
            };
          }
        },
        {
          ...RetryManager.DEFAULT_CONFIG,
          maxAttempts: 3,
          onRetry: (attempt, error) => {
            operationLogger.info('Retrying subscription renewal', {
              attempt,
              error: error.message,
            });
          },
        },
        'processRenewal'
      );

    } catch (error) {
      // Log state change
      await this.logSubscriptionStateChange(
        subscriptionId,
        'ACTIVE',
        'ACTIVE', // Status might not change on renewal failure
        'renewal_failed',
        { error: error instanceof Error ? error.message : 'Unknown error' },
        tenantId
      );

      // Emit subscription.renewal_failed event
      await this.eventService.emit('subscription.renewal_failed', {
        subscriptionId,
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      const subscriptionError = new SubscriptionError(
        `Subscription renewal failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'RENEWAL_FAILED',
        {
          correlationId,
          subscriptionId,
          tenantId,
          originalError: error instanceof Error ? error.message : 'Unknown error',
        }
      );

      operationLogger.failure(subscriptionError);
      throw subscriptionError;
    }
  }

  /**
   * Handle failed payment during renewal
   */
  async handleFailedPayment(subscriptionId: string, attemptNumber: number, tenantId: string): Promise<void> {
    console.log(`⚠️ Handling failed payment for subscription: ${subscriptionId}, attempt: ${attemptNumber}`);

    const subscription = await this.getSubscription(subscriptionId, tenantId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Update failed payment attempts
    await db
      .update(subscriptions)
      .set({
        failedPaymentAttempts: attemptNumber,
        lastPaymentAttempt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(subscriptions.id, subscriptionId),
        eq(subscriptions.tenantId, tenantId)
      ));

    // Determine next action based on attempt number
    if (attemptNumber >= 3) {
      // Move to PAST_DUE status
      await this.updateSubscriptionStatus(subscriptionId, 'PAST_DUE', tenantId);
      
      // Log state change
      await this.logSubscriptionStateChange(
        subscriptionId,
        subscription.status,
        'PAST_DUE',
        'max_payment_attempts_reached',
        { failedAttempts: attemptNumber },
        tenantId
      );
    }
  }

  /**
   * Cancel subscription with refund logic
   */
  async cancelSubscription(
    subscriptionId: string,
    tenantId: string,
    options: {
      cancelAtPeriodEnd?: boolean;
      reason?: string;
      refundUnusedTime?: boolean;
      userId?: string;
    } = {}
  ): Promise<SubscriptionCancellationResult> {
    console.log(`🚫 Canceling subscription: ${subscriptionId}`);

    try {
      const subscription = await this.getSubscription(subscriptionId, tenantId);
      if (!subscription) {
        throw new Error('Subscription not found');
      }

      if (subscription.status === 'CANCELLED') {
        throw new Error('Subscription already cancelled');
      }

      const canceledAt = new Date();
      let refundAmount = 0;
      let refundId: string | undefined;

      if (options.cancelAtPeriodEnd) {
        // Schedule cancellation at period end
        await db
          .update(subscriptions)
          .set({
            cancelAtPeriodEnd: true,
            cancellationReason: options.reason,
            updatedAt: new Date(),
          })
          .where(and(
            eq(subscriptions.id, subscriptionId),
            eq(subscriptions.tenantId, tenantId)
          ));

        // Log state change
        await this.logSubscriptionStateChange(
          subscriptionId,
          subscription.status,
          'PENDING_CANCELLATION',
          options.reason || 'user_request',
          { cancelAtPeriodEnd: true },
          tenantId,
          options.userId
        );

      } else {
        // Immediate cancellation
        if (options.refundUnusedTime) {
          refundAmount = await this.calculateUnusedTimeRefund(subscription);
          
          if (refundAmount > 0) {
            // Process refund
            const refundResult = await this.processSubscriptionRefund(
              subscription,
              refundAmount,
              'subscription_cancellation'
            );
            refundId = refundResult.refundId;
          }
        }

        // Update subscription status
        await db
          .update(subscriptions)
          .set({
            status: 'CANCELLED',
            canceledAt,
            cancellationReason: options.reason,
            updatedAt: new Date(),
          })
          .where(and(
            eq(subscriptions.id, subscriptionId),
            eq(subscriptions.tenantId, tenantId)
          ));

        // Log state change
        await this.logSubscriptionStateChange(
          subscriptionId,
          subscription.status,
          'CANCELLED',
          options.reason || 'user_request',
          { refundAmount, refundId },
          tenantId,
          options.userId
        );

        // Emit subscription.terminated event for immediate cancellation
        await this.eventService.emit('subscription.terminated', {
          subscriptionId: subscriptionId
        }, {
          source: 'SubscriptionService',
          tenantId: tenantId
        });

        console.log(`📤 Emitted subscription.terminated event for: ${subscriptionId}`);
      }

      console.log(`✅ Subscription cancellation processed: ${subscriptionId}`);

      return {
        success: true,
        canceledAt,
        refundAmount: refundAmount > 0 ? refundAmount : undefined,
        refundId
      };

    } catch (error) {
      console.error(`❌ Subscription cancellation failed: ${subscriptionId}`, error);
      throw error;
    }
  }

  /**
   * Calculate prorated amount for plan changes
   */
  async calculateProration(
    subscriptionId: string,
    newPlanId: string,
    tenantId: string
  ): Promise<ProrationResult> {
    const subscription = await this.getSubscription(subscriptionId, tenantId);
    const currentPlan = await this.getPlan(subscription!.planId!);
    const newPlan = await this.getPlan(newPlanId);

    if (!subscription || !currentPlan || !newPlan) {
      throw new Error('Subscription or plan not found');
    }

    const now = new Date();
    const periodStart = new Date(subscription.currentPeriodStart);
    const periodEnd = new Date(subscription.currentPeriodEnd);
    
    // Calculate remaining time in current period
    const totalDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
    const remainingDays = Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    // Calculate prorated amounts
    const currentPlanPrice = parseFloat(subscription.unitPrice || currentPlan.price);
    const newPlanPrice = parseFloat(newPlan.price);
    
    const currentPlanDailyRate = currentPlanPrice / totalDays;
    const newPlanDailyRate = newPlanPrice / totalDays;
    
    const creditAmount = currentPlanDailyRate * remainingDays;
    const chargeAmount = newPlanDailyRate * remainingDays;
    const netAmount = chargeAmount - creditAmount;

    return {
      creditAmount: Math.round(creditAmount * 100) / 100,
      chargeAmount: Math.round(chargeAmount * 100) / 100,
      netAmount: Math.round(netAmount * 100) / 100,
      proratedDays: remainingDays
    };
  }

  // Helper methods
  private async getSubscription(subscriptionId: string, tenantId: string) {
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(and(
        eq(subscriptions.id, subscriptionId),
        eq(subscriptions.tenantId, tenantId)
      ))
      .limit(1);

    return subscription || null;
  }

  private async getPlan(planId: string) {
    const [plan] = await db
      .select()
      .from(plans)
      .where(eq(plans.id, planId))
      .limit(1);

    return plan || null;
  }

  private isRenewalDue(subscription: any): boolean {
    if (!subscription.nextBillingDate) return false;
    const now = new Date();
    const nextBilling = new Date(subscription.nextBillingDate);
    return now >= nextBilling;
  }

  private async createRenewalInvoice(subscription: any, plan: any) {
    const { InvoiceNumberService } = await import('../invoice/InvoiceNumberService');
    
    // Generate invoice number
    const invoiceNumber = await InvoiceNumberService.generateInvoiceNumber(subscription.tenantId);
    
    // Get tenant settings for tax calculation
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, subscription.tenantId))
      .limit(1);

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    // Get client for tax calculation
    const [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, subscription.clientId))
      .limit(1);

    if (!client) {
      throw new Error('Client not found');
    }

    // Calculate amounts
    const subtotal = parseFloat(subscription.unitPrice || plan.price);
    
    // Calculate tax using TaxCalculationService
    const taxResult = await TaxCalculationService.calculateTax(subtotal, subscription.tenantId, {
      isB2B: client.metadata?.businessType === 'B2B',
      countryCode: client.metadata?.countryCode,
      stateCode: client.metadata?.stateCode
    });

    const total = subtotal + taxResult.amount;

    // Create invoice
    const [invoice] = await db
      .insert(invoices)
      .values({
        clientId: subscription.clientId,
        subscriptionId: subscription.id,
        invoiceNumber,
        status: 'PENDING',
        subtotal: subtotal.toString(),
        tax: taxResult.amount.toString(),
        total: total.toString(),
        currency: plan.currency || tenant.metadata?.defaultCurrency || 'USD',
        dueDate: new Date(), // Immediate payment for renewals
        invoiceType: 'recurring',
        tenantId: subscription.tenantId,
        metadata: {
          taxDetails: {
            rate: taxResult.rate,
            type: taxResult.type,
            description: taxResult.description
          }
        }
      })
      .returning();

    return invoice;
  }

  private async processRenewalPayment(subscription: any, invoice: any) {
    try {
      // Get tenant settings
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, subscription.tenantId))
        .limit(1);

      if (!tenant) {
        throw new Error('Tenant not found');
      }

      // Create payment record
      const [payment] = await db
        .insert(payments)
        .values({
          invoiceId: invoice.id,
          amount: invoice.total,
          currency: invoice.currency,
          status: 'PENDING',
          gateway: tenant.metadata?.defaultPaymentGateway || 'stripe',
          tenantId: subscription.tenantId,
        })
        .returning();

      // Get payment service
      const { paymentService } = await import('../payments/PaymentService');
      const gateway = await paymentService.getBestGateway({
        tenantId: subscription.tenantId,
        amount: parseFloat(invoice.total),
        currency: invoice.currency,
        customerId: subscription.clientId,
        isRecurring: true
      });

      // Get gateway configuration
      const gatewayConfig = await paymentService.getGatewayManager().getGatewayConfig(subscription.tenantId, gateway.name);
      if (!gatewayConfig) {
        throw new Error(`Gateway ${gateway.name} not configured for tenant`);
      }

      // Initialize the gateway with tenant configuration
      await gateway.initialize(gatewayConfig.config);

      // Try to process payment using stored payment method
      try {
        // For subscriptions, we typically use a stored payment method
        if (!subscription.paymentMethodId) {
          throw new Error('No payment method available for subscription renewal');
        }

        // Create payment intent
        const paymentIntent = await gateway.createPaymentIntent({
          amount: parseFloat(invoice.total),
          currency: invoice.currency,
          tenantId: subscription.tenantId,
          invoiceId: invoice.id,
          customerId: subscription.clientId,
          metadata: {
            subscriptionId: subscription.id,
            invoiceId: invoice.id,
            type: 'subscription_renewal'
          }
        });

        // Confirm payment with stored payment method
        const paymentResult = await gateway.confirmPayment({
          paymentIntentId: paymentIntent.id,
          paymentMethodId: subscription.paymentMethodId
        });

        // Update payment record with gateway details
        await db
          .update(payments)
          .set({
            gatewayPaymentId: paymentResult.id,
            gatewayData: paymentResult.gatewayData,
            updatedAt: new Date(),
          })
          .where(eq(payments.id, payment.id));

        // Return immediately - status updates will come through events
        return { 
          success: true, 
          payment: { 
            ...payment, 
            gatewayPaymentId: paymentResult.id 
          }
        };

      } catch (gatewayError) {
        console.error('Gateway payment processing failed:', gatewayError);
        
        // Let the payment event handler deal with the failure
        // Just update the gateway error details
        await db
          .update(payments)
          .set({
            errorMessage: gatewayError instanceof Error ? gatewayError.message : 'Unknown error',
            updatedAt: new Date(),
          })
          .where(eq(payments.id, payment.id));

        throw gatewayError;
      }

    } catch (error) {
      console.error('Renewal payment processing error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Payment failed' };
    }
  }

  private async updateSubscriptionForNextCycle(subscription: any) {
    // Get plan details for interval
    const [plan] = await db
      .select()
      .from(plans)
      .where(eq(plans.id, subscription.planId!))
      .limit(1);

    if (!plan) {
      throw new Error('Plan not found');
    }

    const currentPeriodEnd = new Date(subscription.currentPeriodEnd);
    
    // Calculate next billing dates based on plan interval
    const nextPeriodStart = new Date(currentPeriodEnd);
    const nextPeriodEnd = new Date(currentPeriodEnd);
    const nextBillingDate = new Date(currentPeriodEnd);
    
    // Use plan interval for calculations
    const interval = plan.interval || 'MONTHLY';
    const intervalCount = plan.intervalCount || 1;

    switch (interval.toUpperCase()) {
      case 'DAILY':
        nextPeriodEnd.setDate(nextPeriodEnd.getDate() + intervalCount);
        nextBillingDate.setDate(nextBillingDate.getDate() + intervalCount);
        break;
      case 'WEEKLY':
        nextPeriodEnd.setDate(nextPeriodEnd.getDate() + (7 * intervalCount));
        nextBillingDate.setDate(nextBillingDate.getDate() + (7 * intervalCount));
        break;
      case 'MONTHLY':
        nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + intervalCount);
        nextBillingDate.setMonth(nextBillingDate.getMonth() + intervalCount);
        break;
      case 'YEARLY':
        nextPeriodEnd.setFullYear(nextPeriodEnd.getFullYear() + intervalCount);
        nextBillingDate.setFullYear(nextBillingDate.getFullYear() + intervalCount);
        break;
      default:
        throw new Error(`Unsupported billing interval: ${interval}`);
    }

    // Update subscription
    await db
      .update(subscriptions)
      .set({
        currentPeriodStart: nextPeriodStart,
        currentPeriodEnd: nextPeriodEnd,
        nextBillingDate: nextBillingDate,
        failedPaymentAttempts: 0, // Reset failed attempts on successful renewal
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscription.id));
  }

  private async handleFailedRenewalPayment(subscription: any, invoice: any, error: string) {
    const currentAttempts = subscription.failedPaymentAttempts || 0;
    const newAttempts = currentAttempts + 1;

    // Update failed payment attempts
    await db
      .update(subscriptions)
      .set({
        failedPaymentAttempts: newAttempts,
        lastPaymentAttempt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscription.id));

    // Emit payment.retry_needed event if under max attempts
    if (newAttempts < 3) {
      await this.eventService.emit('payment.retry_needed', {
        subscriptionId: subscription.id,
        invoiceId: invoice.id,
        tenantId: subscription.tenantId,
        attemptNumber: newAttempts,
        nextAttemptDate: new Date(Date.now() + (24 * 60 * 60 * 1000)), // 24 hours later
      });
    } else {
      // If exceeded max attempts, move to PAST_DUE and emit event
      await db
        .update(subscriptions)
        .set({
          status: 'PAST_DUE',
          pastDueDate: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, subscription.id));

      // Emit subscription.past_due event
      await this.eventService.emit('subscription.past_due', {
        subscriptionId: subscription.id,
        tenantId: subscription.tenantId,
        invoiceId: invoice.id,
        failedAttempts: newAttempts,
        pastDueDate: new Date(),
      });
    }
  }

  private async updateSubscriptionStatus(subscriptionId: string, status: string, tenantId: string) {
    await db
      .update(subscriptions)
      .set({
        status: status as any,
        updatedAt: new Date(),
      })
      .where(and(
        eq(subscriptions.id, subscriptionId),
        eq(subscriptions.tenantId, tenantId)
      ));

    // Emit appropriate events based on status change
    if (status === 'ACTIVE') {
      await this.eventService.emit('subscription.activated', {
        subscriptionId: subscriptionId
      }, {
        source: 'SubscriptionService',
        tenantId: tenantId
      });
    } else if (status === 'CANCELLED') {
      await this.eventService.emit('subscription.terminated', {
        subscriptionId: subscriptionId
      }, {
        source: 'SubscriptionService',
        tenantId: tenantId
      });
    } else if (status === 'PAST_DUE') {
      await this.eventService.emit('subscription.suspended', {
        subscriptionId: subscriptionId
      }, {
        source: 'SubscriptionService',
        tenantId: tenantId
      });
    }
  }

  private async calculateUnusedTimeRefund(subscription: any): Promise<number> {
    const now = new Date();
    const periodEnd = new Date(subscription.currentPeriodEnd);
    const periodStart = new Date(subscription.currentPeriodStart);
    
    if (now >= periodEnd) return 0; // No refund if period ended
    
    const totalDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
    const remainingDays = Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    const totalAmount = parseFloat(subscription.unitPrice || '0');
    const refundAmount = (totalAmount / totalDays) * remainingDays;
    
    return Math.round(refundAmount * 100) / 100;
  }

  private async processSubscriptionRefund(subscription: any, amount: number, reason: string) {
    try {
      const { paymentService } = await import('../payments/PaymentService');

      // Get the latest payment for this subscription
      const latestPayment = await db
        .select()
        .from(payments)
        .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
        .where(and(
          eq(invoices.subscriptionId, subscription.id),
          eq(payments.status, 'COMPLETED'),
          eq(payments.tenantId, subscription.tenantId)
        ))
        .orderBy(desc(payments.createdAt))
        .limit(1);

      if (!latestPayment[0]) {
        throw new Error('No successful payment found for refund');
      }

      const payment = latestPayment[0].payments;

      // Process the refund using the payment service
      const refundResult = await paymentService.processRefund(
        subscription.tenantId,
        payment.id,
        amount,
        reason
      );

      // Record the refund in our database
      await db
        .update(payments)
        .set({
          refundAmount: amount.toString(),
          refundStatus: refundResult.status,
          refundId: refundResult.id,
          refundReason: refundResult.reason || reason,
          refundedAt: new Date(),
          status: refundResult.status === 'succeeded' ? 'REFUNDED' : payment.status,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, payment.id));

      console.log(`✅ Refund processed successfully: ${refundResult.id} for amount ${amount}`);

      return {
        refundId: refundResult.id,
        amount: refundResult.amount,
        reason: refundResult.reason || reason,
        status: refundResult.status
      };

    } catch (error) {
      console.error('❌ Refund processing failed:', error);
      
      // Fall back to manual refund tracking
      return {
        refundId: `manual_${Date.now()}`,
        amount,
        reason,
        status: 'pending_manual',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async logSubscriptionStateChange(
    subscriptionId: string,
    fromStatus: string,
    toStatus: string,
    reason: string,
    metadata: any,
    tenantId: string,
    userId?: string
  ) {
    try {
      const stateChange: NewSubscriptionStateChange = {
        subscriptionId,
        fromStatus,
        toStatus,
        reason,
        metadata,
        userId,
        tenantId,
      };

      await db.insert(subscriptionStateChanges).values(stateChange);
    } catch (error) {
      console.error('Failed to log subscription state change:', error);
      // Don't throw - this is just for audit trail
    }
  }
}

export const subscriptionService = new SubscriptionService(); 