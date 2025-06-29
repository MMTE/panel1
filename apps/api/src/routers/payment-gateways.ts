import { z } from 'zod';
import { adminProcedure, tenantProcedure, router } from '../trpc/trpc';
import { TRPCError } from '@trpc/server';
import { db } from '../db';
import { eq, and, desc, asc, count, sql, gte, lte } from 'drizzle-orm';
import { 
  paymentGatewayConfigs,
  payments,
  invoices
} from '../db/schema';

export const paymentGatewaysRouter = router({
  getAll: adminProcedure
    .input(z.object({
      search: z.string().optional(),
      status: z.enum(['ACTIVE', 'INACTIVE', 'PENDING_SETUP', 'ERROR']).optional(),
      type: z.enum(['STRIPE', 'PAYPAL', 'SQUARE', 'CUSTOM']).optional(),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const conditions = [eq(paymentGatewayConfigs.tenantId, ctx.tenantId)];

        if (input.search) {
          conditions.push(
            sql`${paymentGatewayConfigs.displayName} ILIKE ${`%${input.search}%`}`
          );
        }

        if (input.status) {
          conditions.push(eq(paymentGatewayConfigs.status, input.status));
        }

        if (input.type) {
          conditions.push(eq(paymentGatewayConfigs.gatewayName, input.type));
        }

        const gateways = await db
          .select()
          .from(paymentGatewayConfigs)
          .where(and(...conditions))
          .orderBy(desc(paymentGatewayConfigs.priority), asc(paymentGatewayConfigs.displayName));

        // Get stats for each gateway
        const gatewaysWithStats = await Promise.all(
          gateways.map(async (gateway) => {
            const [stats] = await db
              .select({
                totalTransactions: count(),
                totalRevenue: sql<number>`COALESCE(SUM(${payments.amount}), 0)`,
                successRate: sql<number>`CASE WHEN COUNT(*) > 0 THEN (COUNT(CASE WHEN ${payments.status} = 'SUCCESS' THEN 1 END) * 100.0 / COUNT(*)) ELSE 0 END`
              })
              .from(payments)
              .where(and(
                eq(payments.tenantId, ctx.tenantId),
                eq(payments.gatewayName, gateway.gatewayName)
              ));

            return {
              ...gateway,
              stats: {
                totalTransactions: stats.totalTransactions,
                totalRevenue: stats.totalRevenue,
                successRate: stats.successRate
              },
              health: {
                status: gateway.healthCheckStatus || 'UNKNOWN',
                lastCheck: gateway.lastHealthCheck?.toISOString()
              }
            };
          })
        );

        return {
          gateways: gatewaysWithStats
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch payment gateways',
          cause: error,
        });
      }
    }),

  getTransactions: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
      gatewayId: z.string().uuid().optional(),
      status: z.enum(['SUCCESS', 'FAILED', 'PENDING', 'REFUNDED']).optional(),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const conditions = [eq(payments.tenantId, ctx.tenantId)];

        if (input.gatewayId) {
          conditions.push(eq(payments.gatewayName, input.gatewayId));
        }

        if (input.status) {
          conditions.push(eq(payments.status, input.status));
        }

        const transactions = await db
          .select({
            id: payments.id,
            amount: payments.amount,
            currency: payments.currency,
            status: payments.status,
            gatewayId: payments.gatewayName,
            gatewayName: paymentGatewayConfigs.displayName,
            customerEmail: sql<string>`${invoices.clientEmail}`,
            description: sql<string>`${invoices.description}`,
            createdAt: payments.createdAt,
            gatewayTransactionId: payments.gatewayTransactionId,
            fee: payments.fee
          })
          .from(payments)
          .leftJoin(paymentGatewayConfigs, eq(payments.gatewayName, paymentGatewayConfigs.gatewayName))
          .leftJoin(invoices, eq(payments.invoiceId, invoices.id))
          .where(and(...conditions))
          .orderBy(desc(payments.createdAt))
          .limit(input.limit)
          .offset(input.offset);

        return {
          transactions: transactions.map(t => ({
            ...t,
            gateway: t.gatewayName || 'Unknown'
          }))
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to fetch payment transactions',
          cause: error,
        });
      }
    }),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(255),
      type: z.enum(['STRIPE', 'PAYPAL', 'SQUARE', 'CUSTOM']),
      config: z.record(z.any()),
      isDefault: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        // If this is set as default, unset other defaults
        if (input.isDefault) {
          await db
            .update(paymentGatewayConfigs)
            .set({ isDefault: false })
            .where(eq(paymentGatewayConfigs.tenantId, ctx.tenantId));
        }

        const [gateway] = await db
          .insert(paymentGatewayConfigs)
          .values({
            ...input,
            status: 'TESTING',
            tenantId: ctx.tenantId,
          })
          .returning();

        return gateway;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create payment gateway',
          cause: error,
        });
      }
    }),

  update: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(255).optional(),
      config: z.record(z.any()).optional(),
      isDefault: z.boolean().optional(),
      status: z.enum(['ACTIVE', 'INACTIVE', 'TESTING', 'ERROR']).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const { id, ...updateData } = input;

        // If this is set as default, unset other defaults
        if (updateData.isDefault) {
          await db
            .update(paymentGatewayConfigs)
            .set({ isDefault: false })
            .where(and(
              eq(paymentGatewayConfigs.tenantId, ctx.tenantId),
              sql`${paymentGatewayConfigs.id} != ${id}`
            ));
        }

        const [gateway] = await db
          .update(paymentGatewayConfigs)
          .set(updateData)
          .where(and(
            eq(paymentGatewayConfigs.id, id),
            eq(paymentGatewayConfigs.tenantId, ctx.tenantId)
          ))
          .returning();

        if (!gateway) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Payment gateway not found',
          });
        }

        return gateway;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update payment gateway',
          cause: error,
        });
      }
    }),

  delete: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const [gateway] = await db
          .delete(paymentGatewayConfigs)
          .where(and(
            eq(paymentGatewayConfigs.id, input.id),
            eq(paymentGatewayConfigs.tenantId, ctx.tenantId)
          ))
          .returning();

        if (!gateway) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Payment gateway not found',
          });
        }

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete payment gateway',
          cause: error,
        });
      }
    }),

  testConnection: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const [gateway] = await db
          .select()
          .from(paymentGatewayConfigs)
          .where(and(
            eq(paymentGatewayConfigs.id, input.id),
            eq(paymentGatewayConfigs.tenantId, ctx.tenantId)
          ))
          .limit(1);

        if (!gateway) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Payment gateway not found',
          });
        }

        // TODO: Implement actual connection testing based on gateway type
        // For now, return a mock success response
        return {
          success: true,
          message: 'Connection test successful',
          responseTime: Math.random() * 1000 + 100, // Mock response time
        };
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to test payment gateway connection',
          cause: error,
        });
      }
    }),
});

export type PaymentGatewaysRouter = typeof paymentGatewaysRouter; 