import Queue from 'bull';
import { db } from '../../../db';
import { subscriptions, invoices, payments, plans, clients, tenants } from '../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { JobData } from '../JobScheduler';
import { TaxCalculationService } from '../../invoice/TaxCalculationService';

export class SubscriptionRenewalProcessor {
  static async process(job: Queue.Job<JobData>): Promise<void> {
    const { subscriptionId } = job.data.payload;
    const { tenantId } = job.data;

    try {
      console.log(`🔄 Processing subscription renewal: ${subscriptionId}`);
      
      // Get subscription with plan details
      const subscription = await SubscriptionRenewalProcessor.getSubscriptionWithPlan(subscriptionId, tenantId);
      
      if (!subscription) {
        throw new Error('Subscription not found');
      }

      if (subscription.subscription.status !== 'ACTIVE') {
        console.log(`⚠️ Subscription ${subscriptionId} is not active, skipping renewal`);
        return;
      }

      // Check if already renewed (avoid duplicate processing)
      const currentPeriodEnd = new Date(subscription.subscription.currentPeriodEnd);
      const now = new Date();
      
      if (currentPeriodEnd > now) {
        console.log(`⏰ Subscription ${subscriptionId} not yet due for renewal`);
        return;
      }

      // Create renewal invoice
      const invoice = await SubscriptionRenewalProcessor.createRenewalInvoice(subscription);
      
      // Process payment for the invoice
      const paymentResult = await SubscriptionRenewalProcessor.processRenewalPayment(subscription, invoice);
      
      if (paymentResult.success) {
        // Update subscription for next billing cycle
        await SubscriptionRenewalProcessor.updateSubscriptionForNextCycle(subscription);
        
        console.log(`✅ Subscription renewal completed successfully: ${subscriptionId}`);
      } else {
        // Handle failed payment
        await SubscriptionRenewalProcessor.handleFailedRenewalPayment(subscription, paymentResult.error);
        
        console.log(`⚠️ Subscription renewal payment failed: ${subscriptionId}`);
      }
      
    } catch (error) {
      console.error(`❌ Subscription renewal failed: ${subscriptionId}`, error);
      throw error; // This will trigger Bull's retry mechanism
    }
  }

  private static async getSubscriptionWithPlan(subscriptionId: string, tenantId: string) {
    const result = await db
      .select({
        subscription: subscriptions,
        plan: plans,
        client: clients,
        tenant: tenants
      })
      .from(subscriptions)
      .leftJoin(plans, eq(subscriptions.planId, plans.id))
      .leftJoin(clients, eq(subscriptions.clientId, clients.id))
      .leftJoin(tenants, eq(subscriptions.tenantId, tenants.id))
      .where(
        and(
          eq(subscriptions.id, subscriptionId),
          eq(subscriptions.tenantId, tenantId)
        )
      )
      .limit(1);

    return result[0] || null;
  }

  private static async createRenewalInvoice(subscription: any) {
    const { InvoiceNumberService } = await import('../../invoice/InvoiceNumberService');
    
    // Generate invoice number
    const invoiceNumber = await InvoiceNumberService.generateInvoiceNumber(subscription.subscription.tenantId);
    
    // Calculate amounts
    const subtotal = parseFloat(subscription.subscription.unitPrice || subscription.plan.price);
    
    // Calculate tax using TaxCalculationService
    const taxResult = await TaxCalculationService.calculateTax(subtotal, subscription.subscription.tenantId, {
      isB2B: subscription.client.metadata?.businessType === 'B2B',
      countryCode: subscription.client.metadata?.countryCode,
      stateCode: subscription.client.metadata?.stateCode
    });

    const total = subtotal + taxResult.amount;

    // Create invoice
    const [invoice] = await db
      .insert(invoices)
      .values({
        clientId: subscription.subscription.clientId,
        subscriptionId: subscription.subscription.id,
        invoiceNumber,
        status: 'PENDING',
        subtotal: subtotal.toString(),
        tax: taxResult.amount.toString(),
        total: total.toString(),
        currency: subscription.plan.currency || subscription.tenant.metadata?.defaultCurrency || 'USD',
        dueDate: new Date(), // Immediate payment for renewals
        invoiceType: 'recurring',
        tenantId: subscription.subscription.tenantId,
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

  private static async processRenewalPayment(subscription: any, invoice: any) {
    try {
      // Create payment record
      const [payment] = await db
        .insert(payments)
        .values({
          invoiceId: invoice.id,
          amount: invoice.total,
          currency: invoice.currency,
          status: 'PENDING',
          gateway: subscription.tenant.metadata?.defaultPaymentGateway || 'stripe',
          tenantId: subscription.subscription.tenantId,
        })
        .returning();

      // Get payment service
      const { paymentService } = await import('../../payments/PaymentService');

      try {
        const gateway = await paymentService.getBestGateway({
          tenantId: subscription.subscription.tenantId,
          amount: parseFloat(invoice.total),
          currency: invoice.currency,
          customerId: subscription.subscription.clientId,
          isRecurring: true
        });

        // Initialize the gateway with tenant configuration
        const gatewayConfig = await paymentService.getGatewayManager().getGatewayConfig(
          subscription.subscription.tenantId, 
          gateway.name
        );
        if (!gatewayConfig) {
          throw new Error(`Gateway ${gateway.name} not configured for tenant`);
        }

        await gateway.initialize(gatewayConfig.config);

        // Create payment intent
        const paymentIntent = await gateway.createPaymentIntent({
          amount: parseFloat(invoice.total),
          currency: invoice.currency,
          tenantId: subscription.subscription.tenantId,
          invoiceId: invoice.id,
          customerId: subscription.subscription.clientId,
          metadata: {
            subscriptionId: subscription.subscription.id,
            invoiceId: invoice.id,
            type: 'subscription_renewal',
            processedBy: 'renewal_processor'
          }
        });

        // Process payment with stored payment method
        let paymentResult;
        if (subscription.subscription.paymentMethodId) {
          paymentResult = await gateway.confirmPayment({
            paymentIntentId: paymentIntent.id,
            paymentMethodId: subscription.subscription.paymentMethodId
          });
        } else {
          // No stored payment method - this will trigger dunning
          throw new Error('No payment method available for subscription renewal');
        }

        if (paymentResult.status === 'succeeded') {
          // Update payment record
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
      console.error('Renewal payment processing error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Payment failed' };
    }
  }

  private static async updateSubscriptionForNextCycle(subscription: any) {
    const currentPeriodEnd = new Date(subscription.subscription.currentPeriodEnd);
    
    // Calculate next billing dates based on plan interval
    const nextPeriodStart = new Date(currentPeriodEnd);
    const nextPeriodEnd = new Date(currentPeriodEnd);
    const nextBillingDate = new Date(currentPeriodEnd);
    
    // Use plan interval for calculations
    const interval = subscription.plan.interval || 'MONTHLY';
    const intervalCount = subscription.plan.intervalCount || 1;

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
      .where(eq(subscriptions.id, subscription.subscription.id));
  }

  private static async handleFailedRenewalPayment(subscription: any, error: string) {
    const currentAttempts = subscription.subscription.failedPaymentAttempts || 0;
    const newAttempts = currentAttempts + 1;

    // Update failed payment attempts
    await db
      .update(subscriptions)
      .set({
        failedPaymentAttempts: newAttempts,
        lastPaymentAttempt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscription.subscription.id));

    // If exceeded max attempts, move to PAST_DUE
    if (newAttempts >= 3) {
      await db
        .update(subscriptions)
        .set({
          status: 'PAST_DUE',
          pastDueDate: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, subscription.subscription.id));
    }
  }
} 