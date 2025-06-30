import { z } from 'zod';
import { adminProcedure, router } from '../trpc/trpc';
import { TRPCError } from '@trpc/server';
import { db } from '../db';
import { sql, and, gte, lte, eq, desc } from 'drizzle-orm';
import { payments, invoices, subscriptions, clients } from '../db/schema';

export const analyticsRouter = router({
  getOverview: adminProcedure
    .input(z.object({
      period: z.enum(['7d', '30d', '90d', '1y']).default('30d'),
      metric: z.enum(['revenue', 'clients', 'invoices']).default('revenue'),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const now = new Date();
        const periodDays = {
          '7d': 7,
          '30d': 30,
          '90d': 90,
          '1y': 365,
        }[input.period];

        const currentPeriodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
        const previousPeriodStart = new Date(currentPeriodStart.getTime() - periodDays * 24 * 60 * 60 * 1000);

        if (input.metric === 'revenue') {
          // Get current period revenue
          const [currentRevenue] = await db
            .select({
              total: sql<number>`COALESCE(SUM(${payments.amount}), 0)`,
            })
            .from(payments)
            .where(and(
              eq(payments.tenantId, ctx.tenantId),
              eq(payments.status, 'COMPLETED'),
              gte(payments.createdAt, currentPeriodStart)
            ));

          // Get previous period revenue
          const [previousRevenue] = await db
            .select({
              total: sql<number>`COALESCE(SUM(${payments.amount}), 0)`,
            })
            .from(payments)
            .where(and(
              eq(payments.tenantId, ctx.tenantId),
              eq(payments.status, 'COMPLETED'),
              gte(payments.createdAt, previousPeriodStart),
              lte(payments.createdAt, currentPeriodStart)
            ));

          const currentValue = currentRevenue.total || 0;
          const previousValue = previousRevenue.total || 0;
          const percentageChange = previousValue > 0 ? ((currentValue - previousValue) / previousValue) * 100 : 0;

          return {
            currentValue,
            previousValue,
            percentageChange: Math.round(percentageChange * 100) / 100,
            trend: percentageChange >= 0 ? 'up' : 'down',
          };
        }

        if (input.metric === 'clients') {
          // Get current period new clients
          const [currentClients] = await db
            .select({
              total: sql<number>`COUNT(*)`,
            })
            .from(clients)
            .where(and(
              eq(clients.tenantId, ctx.tenantId),
              gte(clients.createdAt, currentPeriodStart)
            ));

          // Get previous period new clients
          const [previousClients] = await db
            .select({
              total: sql<number>`COUNT(*)`,
            })
            .from(clients)
            .where(and(
              eq(clients.tenantId, ctx.tenantId),
              gte(clients.createdAt, previousPeriodStart),
              lte(clients.createdAt, currentPeriodStart)
            ));

          const currentValue = Number(currentClients.total) || 0;
          const previousValue = Number(previousClients.total) || 0;
          const percentageChange = previousValue > 0 ? ((currentValue - previousValue) / previousValue) * 100 : 0;

          return {
            currentValue,
            previousValue,
            percentageChange: Math.round(percentageChange * 100) / 100,
            trend: percentageChange >= 0 ? 'up' : 'down',
          };
        }

        if (input.metric === 'invoices') {
          // Get current period invoices
          const [currentInvoices] = await db
            .select({
              total: sql<number>`COUNT(*)`,
            })
            .from(invoices)
            .where(and(
              eq(invoices.tenantId, ctx.tenantId),
              gte(invoices.createdAt, currentPeriodStart)
            ));

          // Get previous period invoices
          const [previousInvoices] = await db
            .select({
              total: sql<number>`COUNT(*)`,
            })
            .from(invoices)
            .where(and(
              eq(invoices.tenantId, ctx.tenantId),
              gte(invoices.createdAt, previousPeriodStart),
              lte(invoices.createdAt, currentPeriodStart)
            ));

          const currentValue = Number(currentInvoices.total) || 0;
          const previousValue = Number(previousInvoices.total) || 0;
          const percentageChange = previousValue > 0 ? ((currentValue - previousValue) / previousValue) * 100 : 0;

          return {
            currentValue,
            previousValue,
            percentageChange: Math.round(percentageChange * 100) / 100,
            trend: percentageChange >= 0 ? 'up' : 'down',
          };
        }

        // Fallback
        return {
          currentValue: 0,
          previousValue: 0,
          percentageChange: 0,
          trend: 'up' as const,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch analytics overview',
          cause: error,
        });
      }
    }),

  getRevenueChart: adminProcedure
    .input(z.object({
      period: z.enum(['7d', '30d', '90d', '1y']).default('30d'),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const now = new Date();
        const periodDays = {
          '7d': 7,
          '30d': 30,
          '90d': 90,
          '1y': 365,
        }[input.period];

        const startDate = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

        // Get daily revenue data
        const revenueData = await db
          .select({
            date: sql<string>`DATE(${payments.createdAt})`,
            revenue: sql<number>`COALESCE(SUM(${payments.amount}), 0)`,
          })
          .from(payments)
          .where(and(
            eq(payments.tenantId, ctx.tenantId),
            eq(payments.status, 'COMPLETED'),
            gte(payments.createdAt, startDate)
          ))
          .groupBy(sql`DATE(${payments.createdAt})`)
          .orderBy(sql`DATE(${payments.createdAt})`);

        // Generate labels and data arrays
        const labels: string[] = [];
        const data: number[] = [];
        const revenueMap = new Map(revenueData.map(item => [item.date, item.revenue]));

        // Fill in all dates in the period, including days with no revenue
        for (let i = 0; i < periodDays; i++) {
          const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
          const dateStr = date.toISOString().split('T')[0];
          const revenue = revenueMap.get(dateStr) || 0;
          
          labels.push(date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
          }));
          data.push(revenue);
        }

        return {
          labels,
          datasets: [
            {
              label: 'Revenue',
              data,
            },
          ],
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch revenue chart data',
          cause: error,
        });
      }
    }),

  getTopPlans: adminProcedure
    .input(z.object({
      period: z.enum(['7d', '30d', '90d', '1y']).default('30d'),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const now = new Date();
        const periodDays = {
          '7d': 7,
          '30d': 30,
          '90d': 90,
          '1y': 365,
        }[input.period];

        const startDate = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

        // Get plan performance data by joining subscriptions with payments
        const planData = await db
          .select({
            planId: subscriptions.planId,
            planName: sql<string>`COALESCE(${subscriptions.planName}, 'Unknown Plan')`,
            revenue: sql<number>`COALESCE(SUM(${payments.amount}), 0)`,
            subscribers: sql<number>`COUNT(DISTINCT ${subscriptions.id})`,
          })
          .from(subscriptions)
          .leftJoin(payments, and(
            eq(payments.subscriptionId, subscriptions.id),
            eq(payments.status, 'COMPLETED'),
            gte(payments.createdAt, startDate)
          ))
          .where(and(
            eq(subscriptions.tenantId, ctx.tenantId),
            eq(subscriptions.status, 'ACTIVE')
          ))
          .groupBy(subscriptions.planId, subscriptions.planName)
          .orderBy(desc(sql`COALESCE(SUM(${payments.amount}), 0)`))
          .limit(5);

        return {
          plans: planData.map(plan => ({
            name: plan.planName,
            revenue: plan.revenue || 0,
            subscribers: Number(plan.subscribers) || 0,
          })),
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch top plans',
          cause: error,
        });
      }
    }),

  getTransactionStats: adminProcedure
    .input(z.object({
      period: z.enum(['7d', '30d', '90d', '1y']).default('30d'),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const now = new Date();
        const periodDays = {
          '7d': 7,
          '30d': 30,
          '90d': 90,
          '1y': 365,
        }[input.period];

        const startDate = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

        // Get transaction statistics
        const [stats] = await db
          .select({
            totalTransactions: sql<number>`COUNT(*)`,
            completedTransactions: sql<number>`COUNT(CASE WHEN ${payments.status} = 'COMPLETED' THEN 1 END)`,
            failedTransactions: sql<number>`COUNT(CASE WHEN ${payments.status} = 'FAILED' THEN 1 END)`,
            pendingTransactions: sql<number>`COUNT(CASE WHEN ${payments.status} = 'PENDING' THEN 1 END)`,
            totalRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${payments.status} = 'COMPLETED' THEN ${payments.amount} ELSE 0 END), 0)`,
            averageTransaction: sql<number>`COALESCE(AVG(CASE WHEN ${payments.status} = 'COMPLETED' THEN ${payments.amount} END), 0)`,
          })
          .from(payments)
          .where(and(
            eq(payments.tenantId, ctx.tenantId),
            gte(payments.createdAt, startDate)
          ));

        const successRate = stats.totalTransactions > 0 
          ? (stats.completedTransactions / stats.totalTransactions) * 100 
          : 0;

        return {
          totalTransactions: Number(stats.totalTransactions) || 0,
          completedTransactions: Number(stats.completedTransactions) || 0,
          failedTransactions: Number(stats.failedTransactions) || 0,
          pendingTransactions: Number(stats.pendingTransactions) || 0,
          totalRevenue: stats.totalRevenue || 0,
          averageTransaction: stats.averageTransaction || 0,
          successRate: Math.round(successRate * 100) / 100,
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch transaction statistics',
          cause: error,
        });
      }
    }),

  getRecentActivity: adminProcedure
    .input(z.object({
      period: z.enum(['7d', '30d', '90d', '1y']).default('30d'),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const now = new Date();
        const periodDays = {
          '7d': 7,
          '30d': 30,
          '90d': 90,
          '1y': 365,
        }[input.period];

        const startDate = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

        // Get recent payments and subscription changes
        const recentPayments = await db
          .select({
            type: sql<string>`'payment'`,
            description: sql<string>`CONCAT('Payment received for ', ${subscriptions.planName})`,
            customer: sql<string>`${clients.name}`,
            amount: payments.amount,
            createdAt: payments.createdAt,
          })
          .from(payments)
          .leftJoin(subscriptions, eq(payments.subscriptionId, subscriptions.id))
          .leftJoin(clients, eq(subscriptions.clientId, clients.id))
          .where(and(
            eq(payments.tenantId, ctx.tenantId),
            eq(payments.status, 'COMPLETED'),
            gte(payments.createdAt, startDate)
          ))
          .orderBy(desc(payments.createdAt))
          .limit(10);

        return {
          recentActivity: recentPayments.map(activity => ({
            type: activity.type,
            description: activity.description,
            customer: activity.customer,
            amount: activity.amount,
            time: activity.createdAt.toISOString(),
          })),
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch recent activity',
          cause: error,
        });
      }
    }),

  getCustomerSegments: adminProcedure
    .input(z.object({
      period: z.enum(['7d', '30d', '90d', '1y']).default('30d'),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const now = new Date();
        const periodDays = {
          '7d': 7,
          '30d': 30,
          '90d': 90,
          '1y': 365,
        }[input.period];

        const startDate = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

        // Get customer segments based on subscription plans
        const segments = await db
          .select({
            segment: sql<string>`COALESCE(${subscriptions.planName}, 'No Plan')`,
            count: sql<number>`COUNT(DISTINCT ${clients.id})`,
            revenue: sql<number>`COALESCE(SUM(${payments.amount}), 0)`,
          })
          .from(clients)
          .leftJoin(subscriptions, and(
            eq(subscriptions.clientId, clients.id),
            eq(subscriptions.status, 'ACTIVE')
          ))
          .leftJoin(payments, and(
            eq(payments.clientId, clients.id),
            eq(payments.status, 'COMPLETED'),
            gte(payments.createdAt, startDate)
          ))
          .where(eq(clients.tenantId, ctx.tenantId))
          .groupBy(subscriptions.planName)
          .orderBy(desc(sql`COUNT(DISTINCT ${clients.id})`));

        // Calculate total customers and revenue for percentage calculations
        const totalCustomers = segments.reduce((sum, seg) => sum + Number(seg.count), 0);
        const totalRevenue = segments.reduce((sum, seg) => sum + Number(seg.revenue), 0);

        return {
          customerSegments: segments.map(segment => ({
            segment: segment.segment,
            count: Number(segment.count),
            revenue: Number(segment.revenue),
            percentage: totalCustomers > 0 ? Math.round((Number(segment.count) / totalCustomers) * 100) : 0,
          })),
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch customer segments',
          cause: error,
        });
      }
    }),
}); 