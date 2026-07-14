import type { ModuleContext } from '@panel1/types';
import { eq, and, desc, sql, gte, lte, or, ilike } from 'drizzle-orm';
import { subscriptions, subscriptionComponents, subscriptionStateChanges } from './schema.js';
import type { Subscription, SubscriptionStateChange } from './schema.js';
import type {
  ISubscriptionService,
  CreateSubscriptionInput,
  UpdateSubscriptionInput,
  CancelSubscriptionInput,
  SubscriptionDTO,
  PaginatedSubscriptions,
  SubscriptionFilters,
  SubscriptionStats,
  ProrationResult,
  SubscriptionCancellationResult,
} from './types.js';

export class SubscriptionService implements ISubscriptionService {
  private db: any;
  private ctx: ModuleContext;

  constructor(ctx: ModuleContext) {
    this.ctx = ctx;
    this.db = ctx.db;
  }

  async createSubscription(input: CreateSubscriptionInput, tenantId: string, userId?: string): Promise<SubscriptionDTO> {
    const plan = await this.getPlan(input.planId, tenantId);
    if (!plan) throw new Error('Plan not found');

    const now = new Date();
    const interval = plan.interval || 'MONTHLY';
    const intervalCount = plan.intervalCount || 1;
    const currentPeriodEnd = this.calculatePeriodEnd(now, interval, intervalCount);

    const nextBillingDate = input.trialDays
      ? new Date(now.getTime() + input.trialDays * 24 * 60 * 60 * 1000)
      : currentPeriodEnd;

    const status = input.trialDays ? 'TRIALING' : 'ACTIVE';

    const [subscription] = await this.db
      .insert(subscriptions)
      .values({
        clientId: input.clientId,
        planId: input.planId,
        planName: plan.name,
        status,
        currentPeriodStart: now,
        currentPeriodEnd,
        nextBillingDate,
        billingCycleAnchor: now,
        trialStart: input.trialDays ? now : null,
        trialEnd: input.trialDays ? nextBillingDate : null,
        unitPrice: plan.price,
        paymentMethodId: input.paymentMethodId,
        metadata: input.metadata || {},
        tenantId,
      })
      .returning();

    if (input.productId) {
      await this.createSubscribedComponents(subscription.id, input.productId, tenantId);
    }

    await this.logStateChange(subscription.id, 'NONE', status, 'subscription_created', { planId: input.planId }, tenantId, userId);
    await this.ctx.emit('subscription.created', { subscriptionId: subscription.id, tenantId });

    if (status === 'ACTIVE') {
      await this.ctx.emit('subscription.activated', { subscriptionId: subscription.id, tenantId });
    }

    return subscription;
  }

  async getSubscription(id: string, tenantId: string): Promise<SubscriptionDTO | null> {
    const [row] = await this.db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.id, id), eq(subscriptions.tenantId, tenantId)))
      .limit(1);
    return row || null;
  }

  async listSubscriptions(
    filters: SubscriptionFilters,
    tenantId: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<PaginatedSubscriptions> {
    const conditions: any[] = [eq(subscriptions.tenantId, tenantId)];

    if (filters.status) conditions.push(eq(subscriptions.status, filters.status));
    if (filters.clientId) conditions.push(eq(subscriptions.clientId, filters.clientId));
    if (filters.planId) conditions.push(eq(subscriptions.planId, filters.planId));
    if (filters.search) {
      conditions.push(
        or(
          ilike(subscriptions.planName!, `%${filters.search}%`),
          sql`false`,
        ),
      );
    }

    const rows = await this.db
      .select()
      .from(subscriptions)
      .where(and(...conditions))
      .orderBy(desc(subscriptions.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(subscriptions)
      .where(and(...conditions));

    return { subscriptions: rows, total, hasMore: offset + limit < total };
  }

  async updateSubscription(id: string, data: UpdateSubscriptionInput, tenantId: string): Promise<SubscriptionDTO> {
    const [existing] = await this.db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.id, id), eq(subscriptions.tenantId, tenantId)))
      .limit(1);

    if (!existing) throw new Error('Subscription not found');

    const updateData: any = { updatedAt: new Date() };
    if (data.planId !== undefined) updateData.planId = data.planId;
    if (data.paymentMethodId !== undefined) updateData.paymentMethodId = data.paymentMethodId;
    if (data.cancelAtPeriodEnd !== undefined) updateData.cancelAtPeriodEnd = data.cancelAtPeriodEnd;
    if (data.cancellationReason !== undefined) updateData.cancellationReason = data.cancellationReason;
    if (data.metadata !== undefined) updateData.metadata = data.metadata;

    const [updated] = await this.db
      .update(subscriptions)
      .set(updateData)
      .where(and(eq(subscriptions.id, id), eq(subscriptions.tenantId, tenantId)))
      .returning();

    return updated;
  }

  async cancelSubscription(
    id: string,
    input: CancelSubscriptionInput,
    tenantId: string,
    userId?: string,
  ): Promise<SubscriptionCancellationResult> {
    const subscription = await this.getSubscription(id, tenantId);
    if (!subscription) throw new Error('Subscription not found');
    if (subscription.status === 'CANCELLED') throw new Error('Subscription already cancelled');

    const canceledAt = new Date();
    let refundAmount: number | undefined;
    let refundId: string | undefined;

    if (input.cancelAtPeriodEnd) {
      await this.db
        .update(subscriptions)
        .set({ cancelAtPeriodEnd: true, cancellationReason: input.reason, updatedAt: new Date() })
        .where(and(eq(subscriptions.id, id), eq(subscriptions.tenantId, tenantId)));

      await this.logStateChange(id, subscription.status || 'ACTIVE', 'PENDING_CANCELLATION', input.reason || 'user_request', { cancelAtPeriodEnd: true }, tenantId, userId);
    } else {
      if (input.refundUnusedTime) {
        const amount = this.calculateUnusedTimeRefund(subscription);
        if (amount > 0) {
          refundAmount = amount;
          // Payment module would handle actual refund - emit event
          await this.ctx.emit('payment.refund_requested', {
            subscriptionId: id,
            tenantId,
            amount,
            reason: 'subscription_cancellation',
          });
        }
      }

      await this.db
        .update(subscriptions)
        .set({ status: 'CANCELLED', canceledAt, cancellationReason: input.reason, updatedAt: new Date() })
        .where(and(eq(subscriptions.id, id), eq(subscriptions.tenantId, tenantId)));

      await this.logStateChange(id, subscription.status || 'ACTIVE', 'CANCELLED', input.reason || 'user_request', { refundAmount }, tenantId, userId);
      await this.ctx.emit('subscription.cancelled', { subscriptionId: id, tenantId, reason: input.reason });
      await this.ctx.emit('subscription.terminated', { subscriptionId: id, tenantId });
    }

    return { success: true, canceledAt, refundAmount, refundId };
  }

  async processRenewal(subscriptionId: string, tenantId: string): Promise<{ success: boolean; invoiceId?: string; error?: string }> {
    const subscription = await this.getSubscription(subscriptionId, tenantId);
    if (!subscription) return { success: false, error: 'Subscription not found' };

    if (!subscription.nextBillingDate) return { success: false, error: 'No billing date set' };
    if (new Date() < new Date(subscription.nextBillingDate)) return { success: false, error: 'Not due for renewal' };

    const plan = await this.getPlan(subscription.planId!, tenantId);
    if (!plan) return { success: false, error: 'Plan not found' };

    // Emit event so billing module creates a renewal invoice
    await this.ctx.emit('subscription.renewed', { subscriptionId, tenantId });

    const interval = plan.interval || 'MONTHLY';
    const intervalCount = plan.intervalCount || 1;
    const currentPeriodEnd = new Date(subscription.currentPeriodEnd!);
    const nextPeriodStart = new Date(currentPeriodEnd);
    const nextPeriodEnd = this.calculatePeriodEnd(currentPeriodEnd, interval, intervalCount);
    const nextBillingDate = new Date(nextPeriodEnd);

    await this.db
      .update(subscriptions)
      .set({
        currentPeriodStart: nextPeriodStart,
        currentPeriodEnd: nextPeriodEnd,
        nextBillingDate,
        failedPaymentAttempts: 0,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscriptionId));

    return { success: true };
  }

  async handlePaymentSucceeded(payload: { subscriptionId: string; tenantId: string }): Promise<void> {
    const { subscriptionId, tenantId } = payload;
    const subscription = await this.getSubscription(subscriptionId, tenantId);
    if (!subscription) return;

    const wasTrial = subscription.status === 'TRIALING';
    const wasPastDue = subscription.status === 'PAST_DUE';

    await this.db
      .update(subscriptions)
      .set({
        status: 'ACTIVE',
        failedPaymentAttempts: 0,
        suspendedAt: null,
        pastDueDate: null,
        updatedAt: new Date(),
      })
      .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.tenantId, tenantId)));

    const fromStatus = subscription.status || 'NONE';
    await this.logStateChange(subscriptionId, fromStatus, 'ACTIVE', 'payment_succeeded', {}, tenantId);

    if (wasTrial || wasPastDue) {
      await this.ctx.emit('subscription.activated', { subscriptionId, tenantId });
    }
  }

  async handlePaymentFailed(payload: { subscriptionId: string; tenantId: string; attemptNumber: number }): Promise<void> {
    const { subscriptionId, tenantId, attemptNumber } = payload;
    const subscription = await this.getSubscription(subscriptionId, tenantId);
    if (!subscription) return;

    await this.db
      .update(subscriptions)
      .set({
        failedPaymentAttempts: attemptNumber,
        lastPaymentAttempt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.tenantId, tenantId)));

    if (attemptNumber >= 3) {
      await this.db
        .update(subscriptions)
        .set({ status: 'PAST_DUE', pastDueDate: new Date(), updatedAt: new Date() })
        .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.tenantId, tenantId)));

      await this.logStateChange(subscriptionId, subscription.status || 'ACTIVE', 'PAST_DUE', 'max_payment_attempts_reached', { failedAttempts: attemptNumber }, tenantId);
      await this.ctx.emit('subscription.past_due', { subscriptionId, tenantId, failedAttempts: attemptNumber });
      await this.ctx.emit('subscription.suspended', { subscriptionId, tenantId, reason: 'payment_failure' });
    }
  }

  async handleInvoiceOverdue(payload: { subscriptionId: string; tenantId: string }): Promise<void> {
    const { subscriptionId, tenantId } = payload;
    const subscription = await this.getSubscription(subscriptionId, tenantId);
    if (!subscription || subscription.status !== 'ACTIVE') return;

    await this.db
      .update(subscriptions)
      .set({ status: 'PAST_DUE', pastDueDate: new Date(), updatedAt: new Date() })
      .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.tenantId, tenantId)));

    await this.logStateChange(subscriptionId, 'ACTIVE', 'PAST_DUE', 'invoice_overdue', {}, tenantId);
    await this.ctx.emit('subscription.past_due', { subscriptionId, tenantId, failedAttempts: 0 });
    await this.ctx.emit('subscription.suspended', { subscriptionId, tenantId, reason: 'invoice_overdue' });
  }

  async calculateProration(subscriptionId: string, newPlanId: string, tenantId: string): Promise<ProrationResult> {
    const subscription = await this.getSubscription(subscriptionId, tenantId);
    if (!subscription) throw new Error('Subscription not found');

    const currentPlan = await this.getPlan(subscription.planId!, tenantId);
    const newPlan = await this.getPlan(newPlanId, tenantId);
    if (!currentPlan || !newPlan) throw new Error('Plan not found');

    const now = new Date();
    const periodStart = new Date(subscription.currentPeriodStart!);
    const periodEnd = new Date(subscription.currentPeriodEnd!);

    const totalDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
    const remainingDays = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    const currentPrice = parseFloat(subscription.unitPrice || currentPlan.price);
    const newPrice = parseFloat(newPlan.price);

    const creditAmount = Math.round((currentPrice / totalDays) * remainingDays * 100) / 100;
    const chargeAmount = Math.round((newPrice / totalDays) * remainingDays * 100) / 100;
    const netAmount = Math.round((chargeAmount - creditAmount) * 100) / 100;

    return { creditAmount, chargeAmount, netAmount, proratedDays: remainingDays };
  }

  async changePlan(subscriptionId: string, newPlanId: string, tenantId: string, userId?: string): Promise<SubscriptionDTO> {
    const subscription = await this.getSubscription(subscriptionId, tenantId);
    if (!subscription) throw new Error('Subscription not found');

    const newPlan = await this.getPlan(newPlanId, tenantId);
    if (!newPlan) throw new Error('Plan not found');

    const oldPlanId = subscription.planId!;

    const [updated] = await this.db
      .update(subscriptions)
      .set({
        planId: newPlanId,
        planName: newPlan.name,
        unitPrice: newPlan.price,
        updatedAt: new Date(),
      })
      .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.tenantId, tenantId)))
      .returning();

    await this.logStateChange(subscriptionId, 'ACTIVE', 'ACTIVE', 'plan_changed', { oldPlanId, newPlanId }, tenantId, userId);
    await this.ctx.emit('subscription.plan_changed', { subscriptionId, tenantId, oldPlanId, newPlanId });

    return updated;
  }

  async getStats(tenantId: string): Promise<SubscriptionStats> {
    const allSubs = await this.db
      .select({ status: subscriptions.status, unitPrice: subscriptions.unitPrice })
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenantId));

    const activeSubs = allSubs.filter(s => s.status === 'ACTIVE' || s.status === 'TRIALING');
    const mrr = activeSubs.reduce((sum, s) => sum + parseFloat(s.unitPrice || '0'), 0);

    return {
      totalSubscriptions: allSubs.length,
      activeSubscriptions: allSubs.filter(s => s.status === 'ACTIVE').length,
      trialingSubscriptions: allSubs.filter(s => s.status === 'TRIALING').length,
      pastDueSubscriptions: allSubs.filter(s => s.status === 'PAST_DUE').length,
      cancelledSubscriptions: allSubs.filter(s => s.status === 'CANCELLED').length,
      monthlyRecurringRevenue: mrr,
    };
  }

  async getStateChanges(subscriptionId: string, tenantId: string): Promise<any[]> {
    return this.db
      .select()
      .from(subscriptionStateChanges)
      .where(and(eq(subscriptionStateChanges.subscriptionId, subscriptionId), eq(subscriptionStateChanges.tenantId, tenantId)))
      .orderBy(desc(subscriptionStateChanges.createdAt))
      .limit(50);
  }

  // ── Private helpers ──

  private async getPlan(planId: string, tenantId?: string) {
    try {
      const result = await this.db
        .select()
        .from(sql`plans`)
        .where(eq(sql`plans.id`, planId))
        .limit(1);
      return result[0] || null;
    } catch {
      return null;
    }
  }

  private calculatePeriodEnd(start: Date, interval: string, intervalCount: number): Date {
    const end = new Date(start);
    switch (interval.toUpperCase()) {
      case 'YEARLY':
        end.setFullYear(end.getFullYear() + intervalCount);
        break;
      case 'WEEKLY':
        end.setDate(end.getDate() + 7 * intervalCount);
        break;
      case 'DAILY':
        end.setDate(end.getDate() + intervalCount);
        break;
      default: // MONTHLY
        end.setMonth(end.getMonth() + intervalCount);
    }
    return end;
  }

  private async createSubscribedComponents(subscriptionId: string, productId: string, tenantId: string): Promise<void> {
    try {
      const components = await this.db
        .select()
        .from(sql`product_components`)
        .where(eq(sql`product_components.product_id`, productId))
        .limit(50);

      for (const pc of components) {
        await this.db.insert(subscriptionComponents).values({
          subscriptionId,
          componentId: pc.component_id || pc.componentId,
          name: pc.name || 'Component',
          quantity: 1,
          unitPrice: pc.unit_price || pc.unitPrice || '0',
          metadata: { provisioningStatus: 'pending' },
          tenantId,
        });
      }
    } catch {
      // Products/components might not exist yet in this tenant
      this.ctx.logger.warn('Could not load product components for subscription', { productId });
    }
  }

  private calculateUnusedTimeRefund(subscription: SubscriptionDTO): number {
    const now = new Date();
    const periodEnd = new Date(subscription.currentPeriodEnd!);
    const periodStart = new Date(subscription.currentPeriodStart!);
    if (now >= periodEnd) return 0;

    const totalDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
    const remainingDays = Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const totalAmount = parseFloat(subscription.unitPrice || '0');

    return Math.round((totalAmount / totalDays) * remainingDays * 100) / 100;
  }

  private async logStateChange(
    subscriptionId: string,
    fromStatus: string,
    toStatus: string,
    reason: string,
    metadata: any,
    tenantId: string,
    userId?: string,
  ): Promise<void> {
    try {
      await this.db.insert(subscriptionStateChanges).values({
        subscriptionId,
        fromStatus,
        toStatus,
        reason,
        metadata,
        userId,
        tenantId,
      });
    } catch (err) {
      this.ctx.logger.error('Failed to log state change', { subscriptionId, error: err });
    }
  }
}
