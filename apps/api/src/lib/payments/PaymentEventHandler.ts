import { EventService } from '../events/EventService';
import { Logger } from '../logging/Logger';
import { db } from '../../db';
import { invoices, subscriptions, plans } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { EventProcessor } from '../../lib/jobs/processors/EventProcessor';

/**
 * Payment Event Handler for processing payment-related events
 */
export class PaymentEventHandler {
  private static instance: PaymentEventHandler;
  private logger = Logger.getInstance();
  private eventService = EventService.getInstance();
  private eventProcessor = EventProcessor.getInstance();

  private constructor() {}

  static getInstance(): PaymentEventHandler {
    if (!PaymentEventHandler.instance) {
      PaymentEventHandler.instance = new PaymentEventHandler();
    }
    return PaymentEventHandler.instance;
  }

  /**
   * Initialize the payment event handler and register listeners
   */
  async initialize(): Promise<void> {
    this.logger.info('🎧 Initializing Payment Event Handler...');

    // Register event handlers with the EventProcessor
    this.eventProcessor.registerHandler('payment.succeeded', this.handlePaymentSucceeded.bind(this));
    this.eventProcessor.registerHandler('payment.failed', this.handlePaymentFailed.bind(this));

    this.logger.info('✅ Payment Event Handler initialized');
  }

  /**
   * Handle payment.succeeded event
   */
  private async handlePaymentSucceeded(eventData: {
    paymentId: string;
    invoiceId: string;
    tenantId: string;
    amount: number;
    currency: string;
    gatewayPaymentId?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      this.logger.info(`💰 Processing payment.succeeded event for payment: ${eventData.paymentId}`);

      // Update invoice status to PAID
      if (eventData.invoiceId) {
        await db
          .update(invoices)
          .set({
            status: 'PAID',
            paidAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(invoices.id, eventData.invoiceId),
              eq(invoices.tenantId, eventData.tenantId)
            )
          );

        this.logger.info(`✅ Invoice ${eventData.invoiceId} marked as PAID`);

        // Get the invoice to find related subscription
        const [invoice] = await db
          .select()
          .from(invoices)
          .where(
            and(
              eq(invoices.id, eventData.invoiceId),
              eq(invoices.tenantId, eventData.tenantId)
            )
          )
          .limit(1);

        if (invoice && invoice.subscriptionId) {
          // Update subscription status based on payment
          await this.handleSubscriptionPaymentSuccess(invoice.subscriptionId, eventData.tenantId);

          // If this was a renewal payment (check metadata), update subscription billing dates
          if (eventData.metadata?.type === 'subscription_renewal') {
            await this.handleSubscriptionRenewalSuccess(invoice.subscriptionId, eventData.tenantId);
          }
        }
      }

      // Emit subscription.activated event if this was for a new subscription
      if (eventData.metadata?.subscriptionId) {
        await this.eventService.emit('subscription.activated', {
          subscriptionId: eventData.metadata.subscriptionId,
          tenantId: eventData.tenantId,
          invoiceId: eventData.invoiceId,
          paymentId: eventData.paymentId,
        });
      }

      this.logger.info(`✅ Payment success processing completed for payment: ${eventData.paymentId}`);

    } catch (error) {
      this.logger.error(`❌ Failed to process payment.succeeded event for payment ${eventData.paymentId}:`, error);
      throw error;
    }
  }

  /**
   * Handle successful subscription renewal payment
   */
  private async handleSubscriptionRenewalSuccess(subscriptionId: string, tenantId: string): Promise<void> {
    try {
      // Get subscription and plan details
      const [subscription] = await db
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.id, subscriptionId),
            eq(subscriptions.tenantId, tenantId)
          )
        )
        .limit(1);

      if (!subscription) {
        throw new Error('Subscription not found');
      }

      const [plan] = await db
        .select()
        .from(plans)
        .where(eq(plans.id, subscription.planId!))
        .limit(1);

      if (!plan) {
        throw new Error('Plan not found');
      }

      // Calculate next billing date
      const currentPeriodEnd = new Date();
      const nextBillingDate = this.calculateNextBillingDate(currentPeriodEnd, plan.interval || 'MONTHLY');
      const nextPeriodEnd = new Date(nextBillingDate);

      // Update subscription billing dates
      await db
        .update(subscriptions)
        .set({
          currentPeriodStart: currentPeriodEnd,
          currentPeriodEnd: nextPeriodEnd,
          nextBillingDate: nextBillingDate,
          failedPaymentAttempts: 0, // Reset failed attempts
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(subscriptions.id, subscriptionId),
            eq(subscriptions.tenantId, tenantId)
          )
        );

      // Emit subscription.renewed event
      await this.eventService.emit('subscription.renewed', {
        subscriptionId,
        tenantId,
        currentPeriodStart: currentPeriodEnd,
        currentPeriodEnd: nextPeriodEnd,
        nextBillingDate,
      });

      this.logger.info(`✅ Subscription ${subscriptionId} renewal dates updated successfully`);

    } catch (error) {
      this.logger.error(`❌ Failed to handle subscription renewal success for subscription ${subscriptionId}:`, error);
      throw error;
    }
  }

  /**
   * Calculate next billing date based on interval
   */
  private calculateNextBillingDate(currentPeriodEnd: Date, interval: string): Date {
    const nextBillingDate = new Date(currentPeriodEnd);
    
    switch (interval) {
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

  /**
   * Handle payment.failed event
   */
  private async handlePaymentFailed(eventData: {
    paymentId: string;
    invoiceId: string;
    tenantId: string;
    errorCode?: string;
    errorMessage?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      this.logger.info(`⚠️ Processing payment.failed event for payment: ${eventData.paymentId}`);

      // Update invoice status to FAILED
      if (eventData.invoiceId) {
        await db
          .update(invoices)
          .set({
            status: 'FAILED',
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(invoices.id, eventData.invoiceId),
              eq(invoices.tenantId, eventData.tenantId)
            )
          );

        this.logger.info(`⚠️ Invoice ${eventData.invoiceId} marked as FAILED`);
      }

      // TODO: Implement retry logic, dunning management, etc.
      // For now, just log the failure

      this.logger.info(`✅ Payment failure processing completed for payment: ${eventData.paymentId}`);

    } catch (error) {
      this.logger.error(`❌ Failed to process payment.failed event for payment ${eventData.paymentId}:`, error);
      throw error;
    }
  }

  /**
   * Handle subscription payment success
   */
  private async handleSubscriptionPaymentSuccess(subscriptionId: string, tenantId: string): Promise<void> {
    try {
      // Get current subscription status
      const [subscription] = await db
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.id, subscriptionId),
            eq(subscriptions.tenantId, tenantId)
          )
        )
        .limit(1);

      if (!subscription) {
        this.logger.warn(`Subscription not found: ${subscriptionId}`);
        return;
      }

      // Update subscription status based on current state
      let newStatus = subscription.status;
      let shouldEmitEvent = false;

      if (subscription.status === 'PENDING' || subscription.status === 'PAYMENT_PENDING') {
        newStatus = 'ACTIVE';
        shouldEmitEvent = true;
      } else if (subscription.status === 'SUSPENDED' || subscription.status === 'PAST_DUE') {
        newStatus = 'ACTIVE';
        shouldEmitEvent = true;
      }

      if (newStatus !== subscription.status) {
        await db
          .update(subscriptions)
          .set({
            status: newStatus,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.id, subscriptionId));

        this.logger.info(`✅ Subscription ${subscriptionId} status updated to ${newStatus}`);

        // Emit appropriate events
        if (shouldEmitEvent) {
          if (subscription.status === 'PENDING' || subscription.status === 'PAYMENT_PENDING') {
            await this.eventService.emit('subscription.activated', {
              subscriptionId,
              tenantId,
              previousStatus: subscription.status,
            });
          } else if (subscription.status === 'SUSPENDED' || subscription.status === 'PAST_DUE') {
            await this.eventService.emit('subscription.unsuspended', {
              subscriptionId,
              tenantId,
              previousStatus: subscription.status,
            });
          }
        }
      }

    } catch (error) {
      this.logger.error(`❌ Failed to handle subscription payment success for subscription ${subscriptionId}:`, error);
      throw error;
    }
  }
} 