import { z } from 'zod';
import { router, protectedProcedure, requirePermission } from '../trpc/trpc.js';
import { db, invoices, invoiceItems, clients, users, subscriptions, payments } from '../db/index.js';
import { eq, and, desc, count, ilike, or, gte, lte, isNull } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { InvoiceNumberService } from '../lib/invoice/InvoiceNumberService.js';
import { InvoicePDFService } from '../lib/invoice/InvoicePDFService.js';
import { InvoiceEventHandler } from '../lib/invoice/InvoiceEventHandler.js';
import { ResourceType } from '../lib/auth/PermissionManager.js';
import { ValidationError } from '../lib/errors';

const CreateInvoiceInput = z.object({
  clientId: z.string().uuid({
    message: 'Please select a valid client.',
  }),
  subscriptionId: z.string().uuid({
    message: 'Invalid subscription ID.',
  }).optional(),
  items: z.array(z.object({
    description: z.string().min(1, {
      message: 'Item description cannot be empty.',
    }),
    quantity: z.number().int().min(1, {
      message: 'Quantity must be at least 1.',
    }).default(1),
    unitPrice: z.string().regex(/^\d+(\.\d{1,2})?$/, {
      message: 'Price must be a valid number.',
    }),
  }), {
    required_error: 'At least one invoice item is required.',
  }).min(1, {
    message: 'At least one invoice item is required.',
  }),
  tax: z.string().regex(/^\d+(\.\d{1,2})?$/, {
    message: 'Tax must be a valid percentage.',
  }).default('0'),
  dueDate: z.date({
    required_error: 'Due date is required.',
    invalid_type_error: 'Due date must be a valid date.',
  }),
  currency: z.string().default('USD'),
});

export const invoicesRouter = router({
  getAll: requirePermission('invoice.read')
    .input(z.object({
      limit: z.number().min(1).max(100).default(10),
      offset: z.number().min(0).default(0),
      search: z.string().optional(),
      status: z.enum(['DRAFT', 'PENDING', 'PAID', 'CANCELLED']).optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      // Ensure tenant context
      if (!ctx.tenantId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Tenant context is required',
        });
      }

      try {
        const conditions = [eq(invoices.tenantId, ctx.tenantId)]; // Always filter by tenant

        // Add search condition if provided
        if (input.search) {
          conditions.push(
            or(
              ilike(invoices.invoiceNumber, `%${input.search}%`),
              ilike(users.email, `%${input.search}%`),
              ilike(users.firstName, `%${input.search}%`),
              ilike(users.lastName, `%${input.search}%`)
            )
          );
        }

        // Add status filter if provided
        if (input.status) {
          conditions.push(eq(invoices.status, input.status));
        }

        // Add date range filters if provided
        if (input.dateFrom) {
          conditions.push(gte(invoices.dueDate, new Date(input.dateFrom)));
        }
        if (input.dateTo) {
          conditions.push(lte(invoices.dueDate, new Date(input.dateTo)));
        }

        const whereClause = and(...conditions);

        // Base query for fetching invoices with proper joins
        const query = db
          .select({
            id: invoices.id,
            number: invoices.invoiceNumber,
            status: invoices.status,
            subtotal: invoices.subtotal,
            tax: invoices.tax,
            total: invoices.total,
            currency: invoices.currency,
            dueDate: invoices.dueDate,
            createdAt: invoices.createdAt,
            client: {
              id: clients.id,
              name: users.firstName,
              email: users.email,
            },
          })
          .from(invoices)
          .leftJoin(clients, eq(invoices.clientId, clients.id))
          .leftJoin(users, eq(clients.userId, users.id))
          .where(whereClause)
          .orderBy(desc(invoices.createdAt))
          .limit(input.limit)
          .offset(input.offset);

        // Count query with proper joins
        const countQuery = db
          .select({ value: count() })
          .from(invoices)
          .leftJoin(clients, eq(invoices.clientId, clients.id))
          .leftJoin(users, eq(clients.userId, users.id))
          .where(whereClause);

        const [results, countResult] = await Promise.all([
          query,
          countQuery,
        ]);

        const total = Number(countResult[0]?.value ?? 0);

        return {
          invoices: results,
          total,
          hasMore: total > (input.offset + input.limit),
        };
      } catch (error) {
        console.error('Error in invoices.getAll:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An error occurred while fetching invoices',
          cause: error,
        });
      }
    }),

  getById: requirePermission('invoice.read', ctx => ({
    type: ResourceType.INVOICE,
    id: ctx.input.id,
    tenantId: ctx.tenantId || '',
  }))
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const invoice = await db.query.invoices.findFirst({
        where: and(
          eq(invoices.id, input.id),
          ctx.tenantId ? eq(invoices.tenantId, ctx.tenantId) : undefined
        ),
        with: {
          client: true,
          items: true,
          payments: true,
        },
      });

      if (!invoice) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Invoice not found',
        });
      }

      return invoice;
    }),

  getStats: requirePermission('invoice.read')
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

  create: requirePermission('invoice.create')
    .input((input) => {
      const result = CreateInvoiceInput.safeParse(input);
      if (!result.success) {
        throw new ValidationError('Invoice creation failed due to validation errors.', result.error.flatten().fieldErrors);
      }
      return result.data;
    })
    .mutation(async ({ input, ctx }) => {
      const { clientId, subscriptionId, items, tax, dueDate, currency } = input;

      // Validate client exists
      const client = await ctx.db
        .select()
        .from(clients)
        .where(and(
          eq(clients.id, clientId),
          eq(clients.tenantId, ctx.tenantId!)
        ))
        .limit(1);

      if (!client.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Selected client does not exist'
        });
      }

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
          subtotal: subtotal.toFixed(2),
          tax: taxAmount.toFixed(2),
          total: total.toFixed(2),
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
        total: (parseFloat(item.unitPrice) * item.quantity).toFixed(2),
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

  updateStatus: requirePermission('invoice.update', ctx => ({
    type: 'INVOICE',
    id: ctx.input.id,
    tenantId: ctx.tenantId || '',
  }))
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

  generatePDF: requirePermission('invoice.read', ctx => ({
    type: 'INVOICE',
    id: ctx.input.id,
    tenantId: ctx.tenantId || '',
  }))
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
  getByClient: requirePermission('invoice.read_own')
    .input(z.object({
      limit: z.number().min(1).max(100).default(10),
      offset: z.number().min(0).default(0),
      status: z.enum(['DRAFT', 'PENDING', 'PAID', 'OVERDUE', 'CANCELLED']).optional(),
    }))
    .query(async ({ input, ctx }) => {
      // First get the client ID for the current user
      const [clientRecord] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(and(
          eq(clients.userId, ctx.user!.id),
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

      if (input.status) {
        whereConditions.push(eq(invoices.status, input.status));
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
        .limit(input.limit)
        .offset(input.offset);

      const [totalResult] = await db
        .select({ count: count() })
        .from(invoices)
        .where(and(...whereConditions));

      return {
        invoices: clientInvoices,
        total: totalResult.count,
        hasMore: input.offset + input.limit < totalResult.count,
      };
    }),

  // Process payment for invoice (client portal)
  processPayment: requirePermission('invoice.process_payment', ctx => ({
    type: 'INVOICE',
    id: ctx.input.invoiceId,
    tenantId: ctx.tenantId || '',
  }))
    .input(z.object({
      invoiceId: z.string().uuid(),
      paymentMethodId: z.string().optional(),
      savePaymentMethod: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      // First get the client ID and verify invoice ownership
      const [clientRecord] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(and(
          eq(clients.userId, ctx.user!.id),
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
  confirmPayment: requirePermission('invoice.process_payment')
    .input(z.object({
      paymentIntentId: z.string(),
      paymentMethodId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
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