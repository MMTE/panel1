import { z } from 'zod';
import { adminProcedure, protectedProcedure, router } from '../trpc/trpc';
import { subscriptionService } from '../lib/subscription/SubscriptionService';
import { dunningManager } from '../lib/subscription/DunningManager';
import { jobScheduler } from '../lib/jobs/JobScheduler';
import { db } from '../db';
import { subscriptions, subscriptionStateChanges, dunningAttempts, clients, subscriptionComponents, components } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

export const subscriptionsRouter = router({
  // Create a new subscription
  create: adminProcedure
    .input(z.object({
      clientId: z.string().uuid(),
      planId: z.string().uuid(),
      productId: z.string().uuid().optional(),
      paymentMethodId: z.string().optional(),
      trialDays: z.number().min(0).max(365).optional(),
      metadata: z.record(z.any()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await subscriptionService.createSubscription({
        ...input,
        tenantId: ctx.tenantId!,
      });

      if (!result.success) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error || 'Failed to create subscription',
        });
      }

      return result.subscription;
    }),

  // Get subscription details
  getById: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      // Get subscription with components and their definitions
      const subscriptionData = await db
        .select({
          subscription: {
            id: subscriptions.id,
            status: subscriptions.status,
            planId: subscriptions.planId,
            planName: subscriptions.planName,
            currency: subscriptions.currency,
            currentPeriodStart: subscriptions.currentPeriodStart,
            currentPeriodEnd: subscriptions.currentPeriodEnd,
            nextBillingDate: subscriptions.nextBillingDate,
            cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
            createdAt: subscriptions.createdAt,
          },
          component: {
            id: subscriptionComponents.id,
            name: subscriptionComponents.name,
            description: subscriptionComponents.description,
            quantity: subscriptionComponents.quantity,
            unitPrice: subscriptionComponents.unitPrice,
            provisioningStatus: subscriptionComponents.provisioningStatus,
            componentId: subscriptionComponents.componentId,
          },
          definition: {
            id: components.id,
            name: components.name,
            description: components.description,
            type: components.type,
            provider: components.provider,
            features: components.features,
            options: components.options,
          }
        })
        .from(subscriptions)
        .leftJoin(
          subscriptionComponents,
          eq(subscriptionComponents.subscriptionId, subscriptions.id)
        )
        .leftJoin(
          components,
          eq(subscriptionComponents.componentId, components.id)
        )
        .where(and(
          eq(subscriptions.id, input.id),
          eq(subscriptions.tenantId, ctx.tenantId!)
        ));

      if (!subscriptionData.length) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Subscription not found',
        });
      }

      // Group components with their definitions
      const subscription = subscriptionData[0].subscription;
      const subscribedComponents = subscriptionData
        .filter(row => row.component.id) // Filter out null components
        .map(row => ({
          ...row.component,
          definition: row.definition
        }));

      return {
        ...subscription,
        subscribedComponents
      };
    }),

  // Get subscriptions for current client user
  getByClient: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(10),
      offset: z.number().min(0).default(0),
      status: z.enum(['ACTIVE', 'INACTIVE', 'CANCELLED', 'PAST_DUE', 'UNPAID', 'TRIALING', 'PAUSED', 'PENDING_CANCELLATION']).optional(),
    }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user || ctx.user.role !== 'CLIENT') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only client users can access their subscriptions',
        });
      }

      const { limit, offset, status } = input;

      // First get the client ID for the current user
      const [clientRecord] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(and(
          eq(clients.userId, ctx.user.id),
          eq(clients.tenantId, ctx.tenantId!)
        ))
        .limit(1);

      if (!clientRecord) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Client profile not found',
        });
      }

      let whereConditions = [
        eq(subscriptions.clientId, clientRecord.id),
        eq(subscriptions.tenantId, ctx.tenantId!)
      ];

      if (status) {
        whereConditions.push(eq(subscriptions.status, status));
      }

      // Get subscriptions with their components and component definitions
      const subscriptionData = await db
        .select({
          subscription: {
            id: subscriptions.id,
            status: subscriptions.status,
            planId: subscriptions.planId,
            planName: subscriptions.planName,
            currency: subscriptions.currency,
            currentPeriodStart: subscriptions.currentPeriodStart,
            currentPeriodEnd: subscriptions.currentPeriodEnd,
            nextBillingDate: subscriptions.nextBillingDate,
            cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
            createdAt: subscriptions.createdAt,
          },
          component: {
            id: subscriptionComponents.id,
            name: subscriptionComponents.name,
            description: subscriptionComponents.description,
            quantity: subscriptionComponents.quantity,
            unitPrice: subscriptionComponents.unitPrice,
            provisioningStatus: subscriptionComponents.provisioningStatus,
            componentId: subscriptionComponents.componentId,
          },
          definition: {
            id: components.id,
            name: components.name,
            description: components.description,
            type: components.type,
            provider: components.provider,
            features: components.features,
            options: components.options,
          }
        })
        .from(subscriptions)
        .leftJoin(
          subscriptionComponents,
          eq(subscriptionComponents.subscriptionId, subscriptions.id)
        )
        .leftJoin(
          components,
          eq(subscriptionComponents.componentId, components.id)
        )
        .where(and(...whereConditions))
        .orderBy(desc(subscriptions.createdAt))
        .limit(limit)
        .offset(offset);

      // Group subscriptions with their components
      const subscriptionsMap = new Map();
      
      subscriptionData.forEach(row => {
        if (!subscriptionsMap.has(row.subscription.id)) {
          subscriptionsMap.set(row.subscription.id, {
            ...row.subscription,
            subscribedComponents: []
          });
        }

        if (row.component.id) {
          const subscription = subscriptionsMap.get(row.subscription.id);
          subscription.subscribedComponents.push({
            ...row.component,
            definition: row.definition
          });
        }
      });

      return Array.from(subscriptionsMap.values());
    }),

  // List all subscriptions for tenant
  list: adminProcedure
    .input(z.object({
      status: z.enum(['ACTIVE', 'INACTIVE', 'CANCELLED', 'PAST_DUE', 'UNPAID', 'TRIALING', 'PAUSED', 'PENDING_CANCELLATION']).optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input, ctx }) => {
      let query = db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.tenantId, ctx.tenantId!))
        .orderBy(desc(subscriptions.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      if (input.status) {
        query = query.where(and(
          eq(subscriptions.tenantId, ctx.tenantId!),
          eq(subscriptions.status, input.status)
        ));
      }

      const results = await query;
      return results;
    }),

  // Cancel subscription
  cancel: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      cancelAtPeriodEnd: z.boolean().default(false),
      reason: z.string().optional(),
      refundUnusedTime: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await subscriptionService.cancelSubscription(
        input.id,
        ctx.tenantId!,
        {
          cancelAtPeriodEnd: input.cancelAtPeriodEnd,
          reason: input.reason,
          refundUnusedTime: input.refundUnusedTime,
          userId: ctx.user.id,
        }
      );

      return result;
    }),

  // Cancel subscription (client portal)
  cancelByClient: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      cancelAtPeriodEnd: z.boolean().default(true), // Default to end of period for clients
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user || ctx.user.role !== 'CLIENT') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only client users can cancel their subscriptions',
        });
      }

      // First get the client ID and verify subscription ownership
      const [clientRecord] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(and(
          eq(clients.userId, ctx.user.id),
          eq(clients.tenantId, ctx.tenantId!)
        ))
        .limit(1);

      if (!clientRecord) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Client profile not found',
        });
      }

      // Verify subscription ownership
      const [subscription] = await db
        .select()
        .from(subscriptions)
        .where(and(
          eq(subscriptions.id, input.id),
          eq(subscriptions.clientId, clientRecord.id),
          eq(subscriptions.tenantId, ctx.tenantId!)
        ))
        .limit(1);

      if (!subscription) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Subscription not found or access denied',
        });
      }

      if (subscription.status === 'CANCELLED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Subscription is already cancelled',
        });
      }

      // Cancel subscription with client-friendly defaults
      const result = await subscriptionService.cancelSubscription(
        input.id,
        ctx.tenantId!,
        {
          cancelAtPeriodEnd: input.cancelAtPeriodEnd,
          reason: input.reason || 'client_requested',
          refundUnusedTime: false, // No automatic refunds for client cancellations
          userId: ctx.user.id,
        }
      );

      return result;
    }),

  // Trigger manual renewal
  triggerRenewal: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const result = await subscriptionService.processRenewal(
        input.id,
        ctx.tenantId!
      );

      return result;
    }),

  // Calculate proration for plan change
  calculateProration: adminProcedure
    .input(z.object({
      subscriptionId: z.string().uuid(),
      newPlanId: z.string().uuid(),
    }))
    .query(async ({ input, ctx }) => {
      const result = await subscriptionService.calculateProration(
        input.subscriptionId,
        input.newPlanId,
        ctx.tenantId!
      );

      return result;
    }),

  // Get subscription state changes (audit trail)
  getStateChanges: adminProcedure
    .input(z.object({
      subscriptionId: z.string().uuid(),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const changes = await db
        .select()
        .from(subscriptionStateChanges)
        .where(and(
          eq(subscriptionStateChanges.subscriptionId, input.subscriptionId),
          eq(subscriptionStateChanges.tenantId, ctx.tenantId!)
        ))
        .orderBy(desc(subscriptionStateChanges.createdAt))
        .limit(input.limit);

      return changes;
    }),

  // Start dunning campaign
  startDunningCampaign: adminProcedure
    .input(z.object({
      subscriptionId: z.string().uuid(),
      strategy: z.enum(['default', 'gentle', 'aggressive']).default('default'),
    }))
    .mutation(async ({ input, ctx }) => {
      await dunningManager.startDunningCampaign(
        input.subscriptionId,
        ctx.tenantId!,
        input.strategy
      );

      return { success: true };
    }),

  // Get dunning attempts
  getDunningAttempts: adminProcedure
    .input(z.object({
      subscriptionId: z.string().uuid(),
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const attempts = await db
        .select()
        .from(dunningAttempts)
        .where(and(
          eq(dunningAttempts.subscriptionId, input.subscriptionId),
          eq(dunningAttempts.tenantId, ctx.tenantId!)
        ))
        .orderBy(desc(dunningAttempts.createdAt))
        .limit(input.limit);

      return attempts;
    }),

  // Get dunning strategies
  getDunningStrategies: adminProcedure
    .query(async () => {
      const strategies = dunningManager.getAllStrategies();
      return strategies;
    }),

  // Get job scheduler statistics
  getJobStats: adminProcedure
    .query(async () => {
      const stats = await jobScheduler.getQueueStats();
      return stats;
    }),

  // Schedule renewal check (admin action)
  scheduleRenewalCheck: adminProcedure
    .mutation(async ({ ctx }) => {
      await jobScheduler.scheduleSubscriptionRenewals();
      return { success: true, message: 'Renewal check scheduled' };
    }),

  // Process failed payments (admin action)
  processFailedPayments: adminProcedure
    .mutation(async ({ ctx }) => {
      await jobScheduler.processFailedPayments();
      return { success: true, message: 'Failed payment processing scheduled' };
    }),

  // Process dunning campaigns (admin action)
  processDunningCampaigns: adminProcedure
    .mutation(async ({ ctx }) => {
      await jobScheduler.processDunningCampaigns();
      return { success: true, message: 'Dunning campaigns scheduled' };
    }),

  // Update subscription status (admin)
  updateStatus: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      status: z.enum(['ACTIVE', 'INACTIVE', 'CANCELLED', 'PAST_DUE', 'UNPAID', 'TRIALING', 'PAUSED', 'PENDING_CANCELLATION']),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Get current subscription
      const [currentSubscription] = await db
        .select()
        .from(subscriptions)
        .where(and(
          eq(subscriptions.id, input.id),
          eq(subscriptions.tenantId, ctx.tenantId!)
        ))
        .limit(1);

      if (!currentSubscription) {
        throw new Error('Subscription not found');
      }

      // Update status
      const [updatedSubscription] = await db
        .update(subscriptions)
        .set({
          status: input.status,
          updatedAt: new Date(),
        })
        .where(and(
          eq(subscriptions.id, input.id),
          eq(subscriptions.tenantId, ctx.tenantId!)
        ))
        .returning();

      // Log state change
      await db
        .insert(subscriptionStateChanges)
        .values({
          subscriptionId: input.id,
          fromStatus: currentSubscription.status,
          toStatus: input.status,
          reason: input.reason || 'admin_update',
          metadata: { updatedBy: ctx.user.id },
          userId: ctx.user.id,
          tenantId: ctx.tenantId!,
        });

      return updatedSubscription;
    }),

  // Get subscription metrics
  getMetrics: adminProcedure
    .query(async ({ ctx }) => {
      // Get subscription counts by status
      const statusCounts = await db
        .select({
          status: subscriptions.status,
          count: db.$count()
        })
        .from(subscriptions)
        .where(eq(subscriptions.tenantId, ctx.tenantId!))
        .groupBy(subscriptions.status);

      // Get upcoming renewals (next 7 days)
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);

      const upcomingRenewals = await db
        .select()
        .from(subscriptions)
        .where(and(
          eq(subscriptions.tenantId, ctx.tenantId!),
          eq(subscriptions.status, 'ACTIVE'),
          eq(subscriptions.nextBillingDate, nextWeek)
        ));

      // Get failed payment count
      const failedPaymentCount = await db
        .select({ count: db.$count() })
        .from(subscriptions)
        .where(and(
          eq(subscriptions.tenantId, ctx.tenantId!),
          eq(subscriptions.status, 'PAST_DUE')
        ));

      return {
        statusCounts,
        upcomingRenewalsCount: upcomingRenewals.length,
        failedPaymentCount: failedPaymentCount[0]?.count || 0,
      };
    }),
}); 