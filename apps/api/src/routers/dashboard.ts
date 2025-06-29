import { router, protectedProcedure } from '../trpc/trpc.js';
import { db } from '../db/index.js';
import { users, clients, invoices, subscriptions } from '../db/schema/index.js';
import { count, sum, gte, eq } from 'drizzle-orm';

export const dashboardRouter = router({
  getStats: protectedProcedure
    .query(async ({ ctx }) => {
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
        db.select({ count: count() }).from(users).where(eq(users.tenantId, ctx.tenantId || '')),
        db.select({ count: count() }).from(clients).where(eq(clients.tenantId, ctx.tenantId || '')),
        db.select({ count: count() }).from(invoices).where(eq(invoices.tenantId, ctx.tenantId || '')),
        db.select({ sum: sum(invoices.total) })
          .from(invoices)
          .where(
            ctx.tenantId 
              ? eq(invoices.tenantId, ctx.tenantId)
              : gte(invoices.createdAt, startOfMonth)
          ),
        db.select({ count: count() })
          .from(subscriptions)
          .where(ctx.tenantId 
            ? eq(subscriptions.tenantId, ctx.tenantId)
            : eq(subscriptions.status, 'ACTIVE')
          )
      ]);
      
      return {
        totalUsers: totalUsersResult[0]?.count || 0,
        totalClients: totalClientsResult[0]?.count || 0,
        totalInvoices: totalInvoicesResult[0]?.count || 0,
        monthlyRevenue: monthlyRevenueResult[0]?.sum || 0,
        activeSubscriptions: activeSubscriptionsResult[0]?.count || 0,
      };
    }),

  getRecentActivity: protectedProcedure
    .query(async ({ ctx }) => {
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
        .where(ctx.tenantId ? eq(invoices.tenantId, ctx.tenantId) : undefined)
        .orderBy(invoices.createdAt)
        .limit(10);

      // Transform to activity format
      const activities = recentInvoices.map(invoice => ({
        id: invoice.id,
        type: 'invoice',
        message: `Invoice ${invoice.invoiceNumber} ${invoice.status.toLowerCase()}`,
        amount: `$${invoice.total.toFixed(2)}`,
        time: formatTimeAgo(invoice.createdAt),
        createdAt: invoice.createdAt,
      }));

      return activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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