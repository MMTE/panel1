import { z } from 'zod';
import { router, protectedProcedure, adminProcedure, tenantProcedure } from '../trpc/trpc.js';
import { db, invoices, invoiceItems, clients, users, subscriptions, payments } from '../db/index.js';
import { eq, and, desc, count, ilike, or, gte, lte } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { InvoiceNumberService } from '../lib/invoice/InvoiceNumberService.js';
import { InvoicePDFService } from '../lib/invoice/InvoicePDFService.js';
import { InvoiceEventHandler } from '../lib/invoice/InvoiceEventHandler.js';

export const invoicesRouter = router({
  getAll: tenantProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(10),
      offset: z.number().min(0).default(0),
      search: z.string().optional(),
      status: z.enum(['DRAFT', 'PENDING', 'PAID', 'OVERDUE', 'CANCELLED']).optional(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const { limit, offset, search, status, startDate, endDate } = input;

      let whereConditions = [eq(invoices.tenantId, ctx.tenantId!)];

      if (search) {
        whereConditions.push(
          or(
            ilike(invoices.invoiceNumber, `%${search}%`),
            ilike(clients.companyName, `%${search}%`),
            ilike(users.email, `%${search}%`)
          )!
        );
      }

      if (status) {
        whereConditions.push(eq(invoices.status, status));
      }

      if (startDate) {
        whereConditions.push(gte(invoices.createdAt, startDate));
      }

      if (endDate) {
        whereConditions.push(lte(invoices.createdAt, endDate));
      }

      const allInvoices = await db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          status: invoices.status,
          subtotal: invoices.subtotal,
          tax: invoices.tax,
          total: invoices.total,
          currency: invoices.currency,
          dueDate: invoices.dueDate,
          paidAt: invoices.paidAt,
          createdAt: invoices.createdAt,
          clientId: clients.id,
          clientCompanyName: clients.companyName,
          clientUserEmail: users.email,
          clientUserFirstName: users.firstName,
          clientUserLastName: users.lastName,
        })
        .from(invoices)
        .leftJoin(clients, eq(invoices.clientId, clients.id))
        .leftJoin(users, eq(clients.userId, users.id))
        .where(and(...whereConditions))
        .orderBy(desc(invoices.createdAt))
        .limit(limit)
        .offset(offset);

      const [totalResult] = await db
        .select({ count: count() })
        .from(invoices)
        .leftJoin(clients, eq(invoices.clientId, clients.id))
        .leftJoin(users, eq(clients.userId, users.id))
        .where(and(...whereConditions));

      return {
        invoices: allInvoices,
        total: totalResult.count,
        hasMore: offset + limit < totalResult.count,
      };
    }),

  getById: tenantProcedure
    .input(z.object({
      id: z.string().uuid(),
    }))
    .query(async ({ input, ctx }) => {
      const [invoice] = await ctx.db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          status: invoices.status,
          subtotal: invoices.subtotal,
          tax: invoices.tax,
          total: invoices.total,
          currency: invoices.currency,
          dueDate: invoices.dueDate,
          paidAt: invoices.paidAt,
          createdAt: invoices.createdAt,
          updatedAt: invoices.updatedAt,
          clientId: clients.id,
          clientCompanyName: clients.companyName,
          clientAddress: clients.address,
          clientCity: clients.city,
          clientState: clients.state,
          clientZipCode: clients.zipCode,
          clientCountry: clients.country,
          clientUserEmail: users.email,
          clientUserFirstName: users.firstName,
          clientUserLastName: users.lastName,
        })
        .from(invoices)
        .leftJoin(clients, eq(invoices.clientId, clients.id))
        .leftJoin(users, eq(clients.userId, users.id))
        .where(and(
          eq(invoices.id, input.id),
          eq(invoices.tenantId, ctx.tenantId)
        ))
        .limit(1);

      if (!invoice) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Invoice not found',
        });
      }

      // Get invoice items
      const items = await ctx.db
        .select()
        .from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, input.id));

      // Get payments
      const invoicePayments = await ctx.db
        .select()
        .from(payments)
        .where(eq(payments.invoiceId, input.id));

      return {
        ...invoice,
        items,
        payments: invoicePayments,
      };
    }),

  getStats: tenantProcedure
    .query(async ({ ctx }) => {
      // Get total invoices count
      const [totalInvoices] = await ctx.db
        .select({ count: count() })
        .from(invoices)
        .where(eq(invoices.tenantId, ctx.tenantId));

      // Get total amount
      const totalAmountResult = await ctx.db
        .select({ total: invoices.total })
        .from(invoices)
        .where(eq(invoices.tenantId, ctx.tenantId));

      const totalAmount = totalAmountResult.reduce((sum, invoice) => 
        sum + parseFloat(invoice.total), 0
      );

      // Get paid amount
      const paidAmountResult = await ctx.db
        .select({ total: invoices.total })
        .from(invoices)
        .where(and(
          eq(invoices.tenantId, ctx.tenantId),
          eq(invoices.status, 'PAID')
        ));

      const paidAmount = paidAmountResult.reduce((sum, invoice) => 
        sum + parseFloat(invoice.total), 0
      );

      // Get pending amount
      const pendingAmountResult = await ctx.db
        .select({ total: invoices.total })
        .from(invoices)
        .where(and(
          eq(invoices.tenantId, ctx.tenantId),
          eq(invoices.status, 'PENDING')
        ));

      const pendingAmount = pendingAmountResult.reduce((sum, invoice) => 
        sum + parseFloat(invoice.total), 0
      );

      // Get overdue amount
      const overdueAmountResult = await ctx.db
        .select({ total: invoices.total })
        .from(invoices)
        .where(and(
          eq(invoices.tenantId, ctx.tenantId),
          eq(invoices.status, 'OVERDUE')
        ));

      const overdueAmount = overdueAmountResult.reduce((sum, invoice) => 
        sum + parseFloat(invoice.total), 0
      );

      return {
        totalInvoices: totalInvoices.count,
        totalAmount,
        paidAmount,
        pendingAmount,
        overdueAmount,
      };
    }),

  create: adminProcedure
    .input(z.object({
      clientId: z.string().uuid(),
      subscriptionId: z.string().uuid().optional(),
      items: z.array(z.object({
        description: z.string(),
        quantity: z.number().int().min(1).default(1),
        unitPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
      })),
      tax: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'),
      dueDate: z.date(),
      currency: z.string().default('USD'),
    }))
    .mutation(async ({ input, ctx }) => {
      const { clientId, subscriptionId, items, tax, dueDate, currency } = input;

      // Calculate totals
      const subtotal = items.reduce((sum, item) => 
        sum + (parseFloat(item.unitPrice) * item.quantity), 0
      );
      const taxAmount = parseFloat(tax);
      const total = subtotal + taxAmount;

      // Generate proper invoice number using the service
      const invoiceNumber = await InvoiceNumberService.generateInvoiceNumber(ctx.tenantId!);

      // Create invoice
      const [newInvoice] = await ctx.db
        .insert(invoices)
        .values({
          clientId,
          userId: ctx.user.id,
          subscriptionId,
          invoiceNumber,
          subtotal: subtotal.toString(),
          tax: taxAmount.toString(),
          total: total.toString(),
          currency,
          dueDate,
          tenantId: ctx.tenantId,
        })
        .returning();

      // Create invoice items
      const invoiceItemsData = items.map(item => ({
        invoiceId: newInvoice.id,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: (parseFloat(item.unitPrice) * item.quantity).toString(),
      }));

      await ctx.db
        .insert(invoiceItems)
        .values(invoiceItemsData);

      // Trigger email notification for invoice created
      try {
        await InvoiceEventHandler.handleInvoiceCreated(newInvoice.id, ctx.tenantId!);
      } catch (error) {
        console.error('Failed to send invoice created email:', error);
        // Don't fail the invoice creation if email fails
      }

      return newInvoice;
    }),

  updateStatus: adminProcedure
    .input(z.object({
      id: z.string().uuid(),
      status: z.enum(['DRAFT', 'PENDING', 'PAID', 'OVERDUE', 'CANCELLED']),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, status } = input;

      const updateData: any = {
        status,
        updatedAt: new Date(),
      };

      // If marking as paid, set paidAt timestamp
      if (status === 'PAID') {
        updateData.paidAt = new Date();
      }

      const [updatedInvoice] = await ctx.db
        .update(invoices)
        .set(updateData)
        .where(and(
          eq(invoices.id, id),
          ctx.tenantId ? eq(invoices.tenantId, ctx.tenantId) : undefined
        ))
        .returning();

      if (!updatedInvoice) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Invoice not found',
        });
      }

      // Trigger email notification for status changes
      try {
        if (status === 'PAID') {
          await InvoiceEventHandler.handleInvoicePaid(updatedInvoice.id, ctx.tenantId!);
        } else if (status === 'OVERDUE') {
          await InvoiceEventHandler.handleInvoiceOverdue(updatedInvoice.id, ctx.tenantId!);
        }
      } catch (error) {
        console.error('Failed to send invoice status email:', error);
        // Don't fail the status update if email fails
      }

      return updatedInvoice;
    }),

  generatePDF: tenantProcedure
    .input(z.object({
      id: z.string().uuid(),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const pdfBuffer = await InvoicePDFService.generatePDF(input.id, ctx.tenantId!);
        
        // Convert buffer to base64 for transmission
        const base64PDF = pdfBuffer.toString('base64');
        
        return {
          pdf: base64PDF,
          filename: `invoice-${input.id}.pdf`,
          mimeType: 'application/pdf',
        };
      } catch (error) {
        console.error('PDF generation failed:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate PDF',
        });
      }
    }),

  // Get invoices for current client user
  getByClient: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(10),
      offset: z.number().min(0).default(0),
      status: z.enum(['DRAFT', 'PENDING', 'PAID', 'OVERDUE', 'CANCELLED']).optional(),
    }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user || ctx.user.role !== 'CLIENT') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only client users can access their invoices',
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
        eq(invoices.clientId, clientRecord.id),
        eq(invoices.tenantId, ctx.tenantId!)
      ];

      if (status) {
        whereConditions.push(eq(invoices.status, status));
      }

      const clientInvoices = await db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          status: invoices.status,
          subtotal: invoices.subtotal,
          tax: invoices.tax,
          total: invoices.total,
          currency: invoices.currency,
          dueDate: invoices.dueDate,
          paidAt: invoices.paidAt,
          createdAt: invoices.createdAt,
        })
        .from(invoices)
        .where(and(...whereConditions))
        .orderBy(desc(invoices.createdAt))
        .limit(limit)
        .offset(offset);

      const [totalResult] = await db
        .select({ count: count() })
        .from(invoices)
        .where(and(...whereConditions));

      return {
        invoices: clientInvoices,
        total: totalResult.count,
        hasMore: offset + limit < totalResult.count,
      };
    }),

  // Process payment for invoice (client portal)
  processPayment: protectedProcedure
    .input(z.object({
      invoiceId: z.string().uuid(),
      paymentMethodId: z.string().optional(),
      savePaymentMethod: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user || ctx.user.role !== 'CLIENT') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only client users can process payments',
        });
      }

      // First get the client ID and verify invoice ownership
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

      // Get invoice and verify ownership
      const [invoice] = await db
        .select()
        .from(invoices)
        .where(and(
          eq(invoices.id, input.invoiceId),
          eq(invoices.clientId, clientRecord.id),
          eq(invoices.tenantId, ctx.tenantId!)
        ))
        .limit(1);

      if (!invoice) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Invoice not found or access denied',
        });
      }

      if (invoice.status === 'PAID') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invoice is already paid',
        });
      }

      // Get payment service
      const { paymentService } = await import('../lib/payments/PaymentService');

      try {
        // Get best payment gateway
        const gateway = await paymentService.getBestGateway({
          tenantId: ctx.tenantId!,
          amount: parseFloat(invoice.total),
          currency: invoice.currency,
          customerId: clientRecord.id,
          isRecurring: false
        });

        // Initialize the gateway
        const gatewayConfig = await paymentService.getGatewayManager().getGatewayConfig(
          ctx.tenantId!,
          gateway.name
        );
        
        if (!gatewayConfig) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Payment gateway not configured',
          });
        }

        await gateway.initialize(gatewayConfig.config);

        // Create payment intent
        const paymentIntent = await gateway.createPaymentIntent({
          amount: parseFloat(invoice.total),
          currency: invoice.currency,
          tenantId: ctx.tenantId!,
          invoiceId: invoice.id,
          customerId: clientRecord.id,
          metadata: {
            invoiceId: invoice.id,
            clientId: clientRecord.id,
            type: 'invoice_payment',
            processedBy: 'client_portal'
          }
        });

        // Create payment record
        const [payment] = await db
          .insert(payments)
          .values({
            invoiceId: invoice.id,
            amount: invoice.total,
            currency: invoice.currency,
            status: 'PENDING',
            gateway: gateway.name,
            gatewayPaymentId: paymentIntent.id,
            tenantId: ctx.tenantId!,
          })
          .returning();

        // Return payment intent for client-side confirmation
        return {
          paymentIntentId: paymentIntent.id,
          clientSecret: paymentIntent.clientSecret,
          amount: parseFloat(invoice.total),
          currency: invoice.currency,
          paymentId: payment.id,
        };

      } catch (error) {
        console.error('Payment processing error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Payment processing failed',
        });
      }
    }),

  // Confirm payment (webhook or client confirmation)
  confirmPayment: protectedProcedure
    .input(z.object({
      paymentIntentId: z.string(),
      paymentMethodId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user || ctx.user.role !== 'CLIENT') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only client users can confirm payments',
        });
      }

      // Get payment record
      const [payment] = await db
        .select({
          id: payments.id,
          invoiceId: payments.invoiceId,
          status: payments.status,
          gateway: payments.gateway,
          tenantId: payments.tenantId,
        })
        .from(payments)
        .where(and(
          eq(payments.gatewayPaymentId, input.paymentIntentId),
          eq(payments.tenantId, ctx.tenantId!)
        ))
        .limit(1);

      if (!payment) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Payment not found',
        });
      }

      if (payment.status === 'COMPLETED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Payment already completed',
        });
      }

      // Get payment service
      const { paymentService } = await import('../lib/payments/PaymentService');

      try {
        // Get gateway
        const gateway = await paymentService.getGatewayManager().getGateway(payment.gateway);
        const gatewayConfig = await paymentService.getGatewayManager().getGatewayConfig(
          payment.tenantId,
          payment.gateway
        );

        if (!gatewayConfig) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Payment gateway not configured',
          });
        }

        await gateway.initialize(gatewayConfig.config);

        // Confirm payment
        const paymentResult = await gateway.confirmPayment({
          paymentIntentId: input.paymentIntentId,
          paymentMethodId: input.paymentMethodId,
        });

        if (paymentResult.status === 'succeeded') {
          // Update payment record
          await db
            .update(payments)
            .set({
              status: 'COMPLETED',
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
            .where(eq(invoices.id, payment.invoiceId));

          // Trigger email notification
          try {
            await InvoiceEventHandler.handleInvoicePaid(payment.invoiceId, payment.tenantId);
          } catch (error) {
            console.error('Failed to send payment confirmation email:', error);
          }

          return {
            success: true,
            paymentId: payment.id,
            status: 'completed',
          };
        } else {
          // Update payment as failed
          await db
            .update(payments)
            .set({
              status: 'FAILED',
              errorMessage: `Payment failed with status: ${paymentResult.status}`,
              updatedAt: new Date(),
            })
            .where(eq(payments.id, payment.id));

          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Payment failed: ${paymentResult.status}`,
          });
        }

      } catch (error) {
        console.error('Payment confirmation error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Payment confirmation failed',
        });
      }
    }),
});