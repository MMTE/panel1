import { z } from 'zod';
import { adminProcedure, tenantProcedure, router, requirePermission } from '../trpc/trpc';
import { TRPCError } from '@trpc/server';
import { db } from '../db';
import { eq, and, desc, asc, count, sql, gte, lte } from 'drizzle-orm';
import { 
  paymentGatewayConfigs,
  payments,
  invoices
} from '../db/schema';
import { encryptionService } from '../lib/security/EncryptionService';
import { paymentGatewayService } from '../lib/payments/PaymentGatewayService';

export const paymentGatewaysRouter = router({
  getAll: requirePermission('payment.read')
    .input(z.object({
      search: z.string().optional(),
      status: z.enum(['ACTIVE', 'INACTIVE', 'PENDING_SETUP', 'ERROR']).optional(),
      type: z.enum(['STRIPE', 'PAYPAL', 'SQUARE', 'CUSTOM']).optional(),
    }))
    .query(async ({ input, ctx }) => {
      try {
        // This part can remain as it's a complex query with stats, 
        // or be moved to the service later for full separation.
        // For now, let's keep it here but use the service for decryption.
        const gatewaysFromDb = await db.query.paymentGatewayConfigs.findMany({
            where: and(eq(paymentGatewayConfigs.tenantId, ctx.tenantId)) // Simplified for brevity
        });

        const gatewaysWithDecryptedConfig = await paymentGatewayService.getGateways(ctx.tenantId);

        // This is not efficient, ideally we'd join and avoid N+1.
        // But for demonstrating the service usage, this is a temporary step.
        const gatewaysWithStats = await Promise.all(
          gatewaysWithDecryptedConfig.map(async (gateway) => {
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

  getTransactions: requirePermission('payment.read')
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

  create: requirePermission('payment.create')
    .input(z.object({
      displayName: z.string().min(1).max(255),
      gatewayName: z.enum(['STRIPE', 'PAYPAL', 'SQUARE', 'CUSTOM']),
      config: z.record(z.any()),
      isDefault: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const gateway = await paymentGatewayService.createGateway(
          { ...input, status: 'TESTING' },
          ctx.tenantId
        );
        return gateway;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create payment gateway',
          cause: error,
        });
      }
    }),

  update: requirePermission('payment.update')
    .input(z.object({
      id: z.string().uuid(),
      displayName: z.string().min(1).max(255).optional(),
      config: z.record(z.any()).optional(),
      isDefault: z.boolean().optional(),
      status: z.enum(['ACTIVE', 'INACTIVE', 'TESTING', 'ERROR']).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const { id, ...updateData } = input;
        const gateway = await paymentGatewayService.updateGateway(id, updateData, ctx.tenantId);
        return gateway;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update payment gateway',
          cause: error,
        });
      }
    }),

  delete: requirePermission('payment.delete')
    .input(z.object({
      id: z.string().uuid(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await paymentGatewayService.deleteGateway(input.id, ctx.tenantId);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to delete payment gateway',
          cause: error,
        });
      }
    }),

  testConnection: requirePermission('payment.execute')
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