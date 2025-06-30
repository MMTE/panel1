import { router, protectedProcedure } from '../trpc/trpc.js';
import { db } from '../db/index.js';
import { users, clients, invoices, subscriptions } from '../db/schema/index.js';
import { count, sum, gte, eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

export const dashboardRouter = router({
  getStats: protectedProcedure
    .query(async ({ ctx }) => {
      // Ensure tenant context
      if (!ctx.tenantId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Tenant context is required',
        });
      }

      try {
        // Get start of current month
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const [
          totalUsersResult,
          totalClientsResult,
          totalInvoicesResult,
          monthlyRevenueResult,
          activeSubscriptionsResult
        ] = await Promise.all([
          db.select({ count: count() }).from(users).where(eq(users.tenantId, ctx.tenantId)),
          db.select({ count: count() }).from(clients).where(eq(clients.tenantId, ctx.tenantId)),
          db.select({ count: count() }).from(invoices).where(eq(invoices.tenantId, ctx.tenantId)),
          db.select({ sum: sum(invoices.total) })
            .from(invoices)
            .where(and(
              eq(invoices.tenantId, ctx.tenantId),
              gte(invoices.createdAt, startOfMonth)
            )),
          db.select({ count: count() })
            .from(subscriptions)
            .where(and(
              eq(subscriptions.tenantId, ctx.tenantId),
              eq(subscriptions.status, 'ACTIVE')
            ))
        ]);
        
        return {
          totalUsers: Number(totalUsersResult[0]?.count || 0),
          totalClients: Number(totalClientsResult[0]?.count || 0),
          totalInvoices: Number(totalInvoicesResult[0]?.count || 0),
          monthlyRevenue: Number(monthlyRevenueResult[0]?.sum || 0),
          activeSubscriptions: Number(activeSubscriptionsResult[0]?.count || 0),
        };
      } catch (error) {
        console.error('Error in dashboard.getStats:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred while fetching dashboard stats',
          cause: error,
        });
      }
    }),

  getRecentActivity: protectedProcedure
    .query(async ({ ctx }) => {
      // Ensure tenant context
      if (!ctx.tenantId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Tenant context is required',
        });
      }

      try {
        // Get recent invoices and payments
        const recentInvoices = await db
          .select({
            id: invoices.id,
            invoiceNumber: invoices.invoiceNumber,
            total: invoices.total,
            status: invoices.status,
            createdAt: invoices.createdAt,
            clientId: invoices.clientId,
          })
          .from(invoices)
          .where(eq(invoices.tenantId, ctx.tenantId))
          .orderBy(invoices.createdAt)
          .limit(10);

        // Transform to activity format
        const activities = recentInvoices.map(invoice => ({
          id: invoice.id,
          type: 'invoice',
          message: `Invoice ${invoice.invoiceNumber} ${invoice.status.toLowerCase()}`,
          amount: `$${Number(invoice.total).toFixed(2)}`,
          time: formatTimeAgo(invoice.createdAt),
          createdAt: invoice.createdAt,
        }));

        return activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      } catch (error) {
        console.error('Error in dashboard.getRecentActivity:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred while fetching recent activity',
          cause: error,
        });
      }
    }),
});

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
  
  if (diffInMinutes < 1) return 'Just now';
  if (diffInMinutes < 60) return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  
  return date.toLocaleDateString();
} 