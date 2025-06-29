import { db } from '../../db';
import { 
  subscriptions, 
  invoices, 
  payments, 
  plans, 
  clients,
  subscriptionStateChanges,
  NewSubscriptionStateChange 
} from '../../db/schema';
import { eq, and, lte, gte, isNull, desc } from 'drizzle-orm';

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

export class SubscriptionService {
  /**
   * Process subscription renewal
   */
  async processRenewal(subscriptionId: string, tenantId: string): Promise<SubscriptionRenewalResult> {
    console.log(`🔄 Processing renewal for subscription: ${subscriptionId}`);

    try {
      // Get subscription details
      const subscription = await this.getSubscription(subscriptionId, tenantId);
      if (!subscription) {
        throw new Error('Subscription not found');
      }

      // Check if renewal is due
      if (!this.isRenewalDue(subscription)) {
        console.log(`⏰ Renewal not due yet for subscription: ${subscriptionId}`);
        return { success: false, error: 'Renewal not due' };
      }

      // Get plan details
      const plan = await this.getPlan(subscription.planId!);
      if (!plan) {
        throw new Error('Plan not found');
      }

      // Create renewal invoice
      const invoice = await this.createRenewalInvoice(subscription, plan);
      
      // Attempt payment
      const paymentResult = await this.processRenewalPayment(subscription, invoice);

      if (paymentResult.success) {
        // Update subscription for next billing cycle
        const nextBillingDate = this.calculateNextBillingDate(subscription, plan);
        
        await this.updateSubscriptionAfterSuccessfulRenewal(
          subscriptionId,
          nextBillingDate,
          tenantId
        );

        // Log state change
        await this.logSubscriptionStateChange(
          subscriptionId,
          'ACTIVE',
          'ACTIVE',
          'successful_renewal',
          { invoiceId: invoice.id, paymentId: paymentResult.payment?.id },
          tenantId
        );

        console.log(`✅ Subscription renewed successfully: ${subscriptionId}`);
        
        return {
          success: true,
          invoiceId: invoice.id,
          paymentId: paymentResult.payment?.id,
          nextBillingDate
        };
      } else {
        // Handle failed payment
        await this.handleFailedRenewalPayment(subscription, invoice, paymentResult.error || 'Payment failed');
        
        return {
          success: false,
          invoiceId: invoice.id,
          error: paymentResult.error
        };
      }

    } catch (error) {
      console.error(`❌ Subscription renewal failed: ${subscriptionId}`, error);
      
      // Log state change
      await this.logSubscriptionStateChange(
        subscriptionId,
        'ACTIVE',
        'ACTIVE', // Status might not change on renewal failure
        'renewal_failed',
        { error: error instanceof Error ? error.message : 'Unknown error' },
        tenantId
      );

      throw error;
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
    
    // Calculate amounts
    const subtotal = parseFloat(subscription.unitPrice || plan.price);
    const taxAmount = 0; // TODO: Implement tax calculation
    const total = subtotal + taxAmount;

    // Create invoice
    const [invoice] = await db
      .insert(invoices)
      .values({
        clientId: subscription.clientId,
        subscriptionId: subscription.id,
        invoiceNumber,
        status: 'PENDING',
        subtotal: subtotal.toString(),
        tax: taxAmount.toString(),
        total: total.toString(),
        currency: plan.currency || 'USD',
        dueDate: new Date(), // Immediate payment for renewals
        invoiceType: 'recurring',
        tenantId: subscription.tenantId,
      })
      .returning();

    return invoice;
  }

  private async processRenewalPayment(subscription: any, invoice: any) {
    try {
      // Create payment record
      const [payment] = await db
        .insert(payments)
        .values({
          invoiceId: invoice.id,
          amount: invoice.total,
          currency: invoice.currency,
          status: 'PENDING',
          gateway: 'stripe', // TODO: Get from tenant settings
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
        // This is a simplified version - in production, you'd want to store customer payment methods
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

        // For recurring payments, we'd typically auto-confirm with stored payment method
        // This is a simplified implementation
        let paymentResult;
        if (subscription.paymentMethodId) {
          paymentResult = await gateway.confirmPayment({
            paymentIntentId: paymentIntent.id,
            paymentMethodId: subscription.paymentMethodId
          });
        } else {
          // No stored payment method - mark as failed
          throw new Error('No payment method available for subscription renewal');
        }

        if (paymentResult.status === 'succeeded') {
          // Update payment record with gateway details
          await db
            .update(payments)
            .set({
              status: 'COMPLETED',
              gatewayPaymentId: paymentResult.id,
              gatewayData: paymentResult.gatewayData,
              updatedAt: new Date(),
            })
            .where(eq(payments.id, payment.id));

          // Mark invoice as paid
          await db
            .update(invoices)
            .set({
              status: 'PAID',
              paidAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(invoices.id, invoice.id));

          return { success: true, payment: { ...payment, gatewayPaymentId: paymentResult.id } };
        } else {
          throw new Error(`Payment failed with status: ${paymentResult.status}`);
        }

      } catch (gatewayError) {
        console.error('Gateway payment processing failed:', gatewayError);
        
        // Update payment record as failed
        await db
          .update(payments)
          .set({
            status: 'FAILED',
            errorMessage: gatewayError instanceof Error ? gatewayError.message : 'Unknown error',
            updatedAt: new Date(),
          })
          .where(eq(payments.id, payment.id));

        throw gatewayError;
      }

    } catch (error) {
      console.error('Payment processing error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Payment failed' };
    }
  }

  private calculateNextBillingDate(subscription: any, plan: any): Date {
    const currentPeriodEnd = new Date(subscription.currentPeriodEnd);
    const nextBillingDate = new Date(currentPeriodEnd);
    
    // TODO: Get interval from plan (monthly, yearly, etc.)
    // For now, assume monthly
    switch (plan.interval || 'MONTHLY') {
      case 'MONTHLY':
        nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
        break;
      case 'YEARLY':
        nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
        break;
      case 'WEEKLY':
        nextBillingDate.setDate(nextBillingDate.getDate() + 7);
        break;
      default:
        nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
    }

    return nextBillingDate;
  }

  private async updateSubscriptionAfterSuccessfulRenewal(
    subscriptionId: string,
    nextBillingDate: Date,
    tenantId: string
  ) {
    const currentPeriodEnd = new Date();
    const nextPeriodEnd = new Date(nextBillingDate);
    
    await db
      .update(subscriptions)
      .set({
        currentPeriodStart: currentPeriodEnd,
        currentPeriodEnd: nextPeriodEnd,
        nextBillingDate: nextBillingDate,
        failedPaymentAttempts: 0, // Reset failed attempts
        updatedAt: new Date(),
      })
      .where(and(
        eq(subscriptions.id, subscriptionId),
        eq(subscriptions.tenantId, tenantId)
      ));
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

    // If exceeded max attempts, move to PAST_DUE
    if (newAttempts >= 3) {
      await db
        .update(subscriptions)
        .set({
          status: 'PAST_DUE',
          pastDueDate: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, subscription.id));
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