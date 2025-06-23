import { z } from 'zod';
import { router, protectedProcedure, adminProcedure, tenantProcedure } from '../trpc/trpc.js';
import { db, invoices, invoiceItems, clients, users, subscriptions, payments } from '../db/index.js';
import { eq, and, desc, count, ilike, or, gte, lte } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

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

      // Generate invoice number
      const invoiceNumber = `INV-${new Date().getFullYear()}-${Date.now()}`;

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
          eq(invoices.tenantId, ctx.tenantId)
        ))
        .returning();

      if (!updatedInvoice) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Invoice not found',
        });
      }

      return updatedInvoice;
    }),
});