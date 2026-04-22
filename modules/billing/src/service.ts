import type { ModuleContext } from '@panel1/types';
import { eq, and, desc, count, sql, gte, lte, or, ilike, lt } from 'drizzle-orm';
import { invoices, invoiceItems, invoiceCounters, dunningAttempts } from './schema.js';
import type { Invoice, InvoiceItem, InvoiceCounter } from './schema.js';
import type {
  IBillingService,
  CreateInvoiceInput,
  UpdateInvoiceInput,
  InvoiceDTO,
  InvoiceItemDTO,
  InvoiceWithItemsDTO,
  PaginatedInvoices,
  InvoiceFilters,
  BillingStats,
  InvoiceStatus,
} from './types.js';
import PDFDocument from 'pdfkit';

export class BillingService implements IBillingService {
  private db: any;
  private ctx: ModuleContext;

  constructor(ctx: ModuleContext) {
    this.ctx = ctx;
    this.db = ctx.db;
  }

  async createInvoice(input: CreateInvoiceInput, tenantId: string, userId: string): Promise<InvoiceDTO> {
    return await this.db.transaction(async (tx: any) => {
      const invoiceNumber = await this.generateInvoiceNumber(tenantId, tx);

      const subtotal = input.items.reduce((sum, item) =>
        sum + (parseFloat(item.unitPrice) * item.quantity), 0
      );
      const taxAmount = parseFloat(input.tax || '0');
      const total = subtotal + taxAmount;

      const [invoice] = await tx
        .insert(invoices)
        .values({
          clientId: input.clientId,
          userId,
          subscriptionId: input.subscriptionId,
          invoiceNumber,
          status: 'PENDING',
          subtotal: subtotal.toFixed(2),
          tax: taxAmount.toFixed(2),
          total: total.toFixed(2),
          currency: input.currency || 'USD',
          dueDate: new Date(input.dueDate),
          tenantId,
        })
        .returning();

      await tx.insert(invoiceItems).values(
        input.items.map(item => ({
          invoiceId: invoice.id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: (parseFloat(item.unitPrice) * item.quantity).toFixed(2),
        }))
      );

      await this.ctx.emit('invoice.created', { invoiceId: invoice.id, tenantId });

      return invoice;
    });
  }

  async getInvoice(id: string, tenantId: string): Promise<InvoiceWithItemsDTO | null> {
    const [invoice] = await this.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)))
      .limit(1);

    if (!invoice) return null;

    const items = await this.db
      .select()
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, id));

    return { ...invoice, items };
  }

  async listInvoices(
    filters: InvoiceFilters,
    tenantId: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<PaginatedInvoices> {
    const conditions: any[] = [eq(invoices.tenantId, tenantId)];

    if (filters.status) {
      conditions.push(eq(invoices.status, filters.status));
    }
    if (filters.dateFrom) {
      conditions.push(gte(invoices.dueDate, new Date(filters.dateFrom)));
    }
    if (filters.dateTo) {
      conditions.push(lte(invoices.dueDate, new Date(filters.dateTo)));
    }
    if (filters.clientId) {
      conditions.push(eq(invoices.clientId, filters.clientId));
    }
    if (filters.search) {
      conditions.push(
        or(
          ilike(invoices.invoiceNumber, `%${filters.search}%`),
          sql`false`,
        ),
      );
    }

    const rows = await this.db
      .select()
      .from(invoices)
      .where(and(...conditions))
      .orderBy(desc(invoices.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ total }] = await this.db
      .select({ total: count() })
      .from(invoices)
      .where(and(...conditions));

    return { invoices: rows, total, hasMore: offset + limit < total };
  }

  async updateInvoice(id: string, data: UpdateInvoiceInput, tenantId: string): Promise<InvoiceDTO> {
    const updateData: any = { updatedAt: new Date() };
    if (data.status) updateData.status = data.status;
    if (data.dueDate) updateData.dueDate = new Date(data.dueDate);
    if (data.currency) updateData.currency = data.currency;

    if (data.status === 'PAID') {
      updateData.paidAt = new Date();
    }

    const [updated] = await this.db
      .update(invoices)
      .set(updateData)
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)))
      .returning();

    if (!updated) throw new Error('Invoice not found');

    if (data.status === 'PAID') {
      await this.ctx.emit('invoice.paid', {
        invoiceId: updated.id,
        paymentId: '',
        amount: parseFloat(updated.total || '0'),
        tenantId,
      });
      this.sendInvoiceNotification(updated.id, tenantId, 'paid').catch(() => {});
    } else if (data.status === 'OVERDUE') {
      await this.ctx.emit('invoice.overdue', { invoiceId: updated.id, tenantId });
      this.sendInvoiceNotification(updated.id, tenantId, 'overdue').catch(() => {});
    }

    return updated;
  }

  async deleteInvoice(id: string, tenantId: string): Promise<void> {
    const [invoice] = await this.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)))
      .limit(1);

    if (!invoice) throw new Error('Invoice not found');

    await this.db
      .update(invoices)
      .set({ status: 'CANCELLED', updatedAt: new Date() })
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)));

    await this.ctx.emit('invoice.cancelled', { invoiceId: id, tenantId });
  }

  async markPaid(id: string, paymentId: string, amount: string, tenantId: string): Promise<InvoiceDTO> {
    const [invoice] = await this.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)))
      .limit(1);

    if (!invoice) throw new Error('Invoice not found');

    const [updated] = await this.db
      .update(invoices)
      .set({ status: 'PAID', paidAt: new Date(), updatedAt: new Date() })
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)))
      .returning();

    await this.ctx.emit('invoice.paid', {
      invoiceId: id,
      paymentId,
      amount: parseFloat(amount),
      tenantId,
    });

    this.sendInvoiceNotification(id, tenantId, 'paid').catch(() => {});

    return updated;
  }

  async sendInvoice(id: string, tenantId: string): Promise<void> {
    const invoice = await this.getInvoice(id, tenantId);
    if (!invoice) throw new Error('Invoice not found');

    await this.sendInvoiceNotification(id, tenantId, 'created');
    await this.ctx.emit('invoice.sent', { invoiceId: id, tenantId });
  }

  async generatePdf(id: string, tenantId: string): Promise<Buffer> {
    const [invoice] = await this.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)))
      .limit(1);

    if (!invoice) throw new Error('Invoice not found');

    const items = await this.db
      .select()
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, id));

    return this.buildPdf(invoice, items);
  }

  async voidInvoice(id: string, tenantId: string): Promise<InvoiceDTO> {
    const [updated] = await this.db
      .update(invoices)
      .set({ status: 'CANCELLED', updatedAt: new Date() })
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)))
      .returning();

    if (!updated) throw new Error('Invoice not found');

    await this.ctx.emit('invoice.cancelled', { invoiceId: id, tenantId });
    return updated;
  }

  async createCredit(id: string, amount: string, reason: string, tenantId: string): Promise<InvoiceDTO> {
    const [original] = await this.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId)))
      .limit(1);

    if (!original) throw new Error('Invoice not found');

    return await this.db.transaction(async (tx: any) => {
      const creditNumber = await this.generateInvoiceNumber(tenantId, tx, 'CRD');

      const [credit] = await tx
        .insert(invoices)
        .values({
          clientId: original.clientId,
          userId: original.userId,
          subscriptionId: original.subscriptionId,
          invoiceNumber: creditNumber,
          status: 'PAID',
          subtotal: '0',
          tax: '0',
          total: `-${amount}`,
          currency: original.currency || 'USD',
          dueDate: new Date(),
          paidAt: new Date(),
          invoiceType: 'credit',
          parentInvoiceId: original.id,
          tenantId,
        })
        .returning();

      await tx.insert(invoiceItems).values({
        invoiceId: credit.id,
        description: reason || 'Credit note',
        quantity: 1,
        unitPrice: `-${amount}`,
        total: `-${amount}`,
      });

      await this.ctx.emit('invoice.refunded', {
        invoiceId: credit.id,
        amount: parseFloat(amount),
        tenantId,
      });

      return credit;
    });
  }

  async runDunningCycle(): Promise<void> {
    const today = new Date();

    const overdueInvoices = await this.db
      .select()
      .from(invoices)
      .where(and(
        eq(invoices.status, 'OVERDUE'),
        lt(invoices.dueDate, today),
      ));

    for (const invoice of overdueInvoices) {
      const [existingAttempts] = await this.db
        .select({ count: count() })
        .from(dunningAttempts)
        .where(and(
          eq(dunningAttempts.invoiceId, invoice.id),
          eq(dunningAttempts.tenantId, invoice.tenantId),
        ));

      const attemptNumber = Number(existingAttempts.count) + 1;

      if (attemptNumber > 5) continue;

      await this.db.insert(dunningAttempts).values({
        invoiceId: invoice.id,
        subscriptionId: invoice.subscriptionId || '',
        campaignType: attemptNumber <= 2 ? 'gentle_reminder' : attemptNumber <= 4 ? 'urgent_reminder' : 'final_notice',
        attemptNumber,
        status: 'sent',
        executedAt: new Date(),
        nextAttemptAt: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000),
        tenantId: invoice.tenantId,
      });

      await this.ctx.emit('dunning.attempted', {
        invoiceId: invoice.id,
        attempt: attemptNumber,
        tenantId: invoice.tenantId,
      });

      this.sendDunningEmail(invoice, attemptNumber).catch(() => {});
    }
  }

  async getStats(tenantId: string): Promise<BillingStats> {
    const [totalResult] = await this.db
      .select({ count: count() })
      .from(invoices)
      .where(eq(invoices.tenantId, tenantId));

    const allAmounts = await this.db
      .select({ total: invoices.total })
      .from(invoices)
      .where(eq(invoices.tenantId, tenantId));

    const totalAmount = allAmounts.reduce((sum, inv) => sum + parseFloat(inv.total), 0);

    const paidAmounts = await this.db
      .select({ total: invoices.total })
      .from(invoices)
      .where(and(eq(invoices.tenantId, tenantId), eq(invoices.status, 'PAID')));

    const paidAmount = paidAmounts.reduce((sum, inv) => sum + parseFloat(inv.total), 0);

    const pendingAmounts = await this.db
      .select({ total: invoices.total })
      .from(invoices)
      .where(and(eq(invoices.tenantId, tenantId), eq(invoices.status, 'PENDING')));

    const pendingAmount = pendingAmounts.reduce((sum, inv) => sum + parseFloat(inv.total), 0);

    const overdueAmounts = await this.db
      .select({ total: invoices.total })
      .from(invoices)
      .where(and(eq(invoices.tenantId, tenantId), eq(invoices.status, 'OVERDUE')));

    const overdueAmount = overdueAmounts.reduce((sum, inv) => sum + parseFloat(inv.total), 0);

    return {
      totalInvoices: totalResult.count,
      totalAmount,
      paidAmount,
      pendingAmount,
      overdueAmount,
    };
  }

  async handlePaymentSucceeded(payload: { invoiceId: string; paymentId: string; tenantId: string }): Promise<void> {
    const { invoiceId, paymentId, tenantId } = payload;

    const [invoice] = await this.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)))
      .limit(1);

    if (!invoice || invoice.status === 'PAID') return;

    await this.db
      .update(invoices)
      .set({ status: 'PAID', paidAt: new Date(), updatedAt: new Date() })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)));

    await this.ctx.emit('invoice.paid', {
      invoiceId,
      paymentId,
      amount: parseFloat(invoice.total),
      tenantId,
    });

    this.sendInvoiceNotification(invoiceId, tenantId, 'paid').catch(() => {});
  }

  async createRecurringInvoice(payload: { subscriptionId: string; tenantId: string }): Promise<string> {
    const { subscriptionId, tenantId } = payload;

    const invoiceNumber = await this.generateInvoiceNumber(tenantId, this.db);

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const [invoice] = await this.db
      .insert(invoices)
      .values({
        subscriptionId,
        invoiceNumber,
        status: 'PENDING',
        subtotal: '0',
        tax: '0',
        total: '0',
        currency: 'USD',
        dueDate,
        invoiceType: 'recurring',
        tenantId,
      })
      .returning();

    await this.ctx.emit('invoice.created', { invoiceId: invoice.id, tenantId });

    return invoice.id;
  }

  async generateRecurringInvoices(): Promise<void> {
    this.ctx.logger.info('Running recurring invoice generation');
  }

  async sendOverdueReminders(): Promise<void> {
    const today = new Date();
    const reminderCutoff = new Date(today);
    reminderCutoff.setDate(reminderCutoff.getDate() - 7);

    const overdueInvoices = await this.db
      .select()
      .from(invoices)
      .where(and(
        eq(invoices.status, 'OVERDUE'),
        lt(invoices.dueDate, reminderCutoff),
      ));

    for (const invoice of overdueInvoices) {
      this.sendInvoiceNotification(invoice.id, invoice.tenantId, 'overdue').catch(() => {});
    }
  }

  private async generateInvoiceNumber(tenantId: string, tx: any, prefix: string = 'INV'): Promise<string> {
    const currentYear = new Date().getFullYear();
    const padLength = 6;

    let counter = await tx
      .select()
      .from(invoiceCounters)
      .where(and(
        eq(invoiceCounters.tenantId, tenantId),
        eq(invoiceCounters.year, currentYear),
      ))
      .limit(1);

    if (counter.length === 0) {
      const [newCounter] = await tx
        .insert(invoiceCounters)
        .values({ tenantId, year: currentYear, lastNumber: 1, prefix })
        .returning();
      counter = [newCounter];
    } else {
      const [updatedCounter] = await tx
        .update(invoiceCounters)
        .set({ lastNumber: counter[0].lastNumber + 1, updatedAt: new Date() })
        .where(and(
          eq(invoiceCounters.tenantId, tenantId),
          eq(invoiceCounters.year, currentYear),
        ))
        .returning();
      counter = [updatedCounter];
    }

    const paddedNumber = counter[0].lastNumber.toString().padStart(padLength, '0');
    return `${prefix}-${currentYear}-${paddedNumber}`;
  }

  private buildPdf(invoice: any, items: any[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const pageWidth = doc.page.width;
        const margin = 50;

        doc.fontSize(20)
          .font('Helvetica-Bold')
          .text('INVOICE', pageWidth - 150, margin, { align: 'right' })
          .fontSize(12)
          .font('Helvetica')
          .text(`#${invoice.invoiceNumber}`, pageWidth - 150, margin + 25, { align: 'right' });

        const startY = margin + 80;
        doc.fontSize(10)
          .font('Helvetica-Bold')
          .text('Invoice Date:', margin, startY)
          .font('Helvetica')
          .text(this.formatDate(invoice.createdAt), margin + 80, startY)
          .font('Helvetica-Bold')
          .text('Due Date:', margin, startY + 15)
          .font('Helvetica')
          .text(this.formatDate(invoice.dueDate), margin + 80, startY + 15)
          .font('Helvetica-Bold')
          .text('Status:', margin, startY + 30)
          .font('Helvetica')
          .text(invoice.status || '', margin + 80, startY + 30);

        const tableStartY = margin + 170;
        doc.fontSize(10)
          .font('Helvetica-Bold')
          .text('Description', margin, tableStartY)
          .text('Qty', pageWidth - 200, tableStartY)
          .text('Unit Price', pageWidth - 150, tableStartY)
          .text('Total', pageWidth - 100, tableStartY);

        doc.moveTo(margin, tableStartY + 15)
          .lineTo(pageWidth - margin, tableStartY + 15)
          .stroke();

        let y = tableStartY + 25;
        for (const item of items) {
          doc.fontSize(9)
            .font('Helvetica')
            .text(item.description, margin, y, { width: (pageWidth - margin * 2) * 0.5 })
            .text(String(item.quantity || 1), pageWidth - 200, y)
            .text(this.formatCurrency(parseFloat(item.unitPrice), invoice.currency || 'USD'), pageWidth - 150, y)
            .text(this.formatCurrency(parseFloat(item.total), invoice.currency || 'USD'), pageWidth - 100, y);
          y += 20;
        }

        doc.moveTo(margin, y)
          .lineTo(pageWidth - margin, y)
          .stroke();

        const totalsStartY = y + 15;
        doc.fontSize(10)
          .font('Helvetica')
          .text('Subtotal:', pageWidth - 150, totalsStartY)
          .text(this.formatCurrency(parseFloat(invoice.subtotal), invoice.currency || 'USD'), pageWidth - 100, totalsStartY)
          .text('Tax:', pageWidth - 150, totalsStartY + 15)
          .text(this.formatCurrency(parseFloat(invoice.tax || '0'), invoice.currency || 'USD'), pageWidth - 100, totalsStartY + 15);

        doc.font('Helvetica-Bold')
          .fontSize(12)
          .text('Total:', pageWidth - 150, totalsStartY + 35)
          .text(this.formatCurrency(parseFloat(invoice.total), invoice.currency || 'USD'), pageWidth - 100, totalsStartY + 35);

        doc.fontSize(8)
          .font('Helvetica')
          .text('Thank you for your business!', margin, doc.page.height - 60);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private formatDate(date: Date | null | undefined): string {
    if (!date) return '';
    return (date instanceof Date ? date : new Date(date)).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  private formatCurrency(amount: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  }

  private async sendInvoiceNotification(invoiceId: string, tenantId: string, type: 'created' | 'paid' | 'overdue' | 'reminder'): Promise<void> {
    if (!this.ctx.email) return;

    const [invoice] = await this.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)))
      .limit(1);

    if (!invoice) return;

    const clientQuery = await this.db
      .select()
      .from(sql`clients`)
      .where(eq(sql`clients.id`, invoice.clientId))
      .limit(1);

    const userEmail = (clientQuery[0] as any)?.userEmail || '';

    if (!userEmail) return;

    const amount = this.formatCurrency(parseFloat(invoice.total), invoice.currency || 'USD');
    const dueDate = this.formatDate(invoice.dueDate);

    let subject: string;
    let html: string;
    let text: string;

    switch (type) {
      case 'created':
        subject = `Invoice ${invoice.invoiceNumber}`;
        html = `<h2>New Invoice</h2><p>Invoice #${invoice.invoiceNumber} for ${amount} is due ${dueDate}.</p>`;
        text = `Invoice #${invoice.invoiceNumber} for ${amount} is due ${dueDate}.`;
        break;
      case 'paid':
        subject = `Payment Received - Invoice ${invoice.invoiceNumber}`;
        html = `<h2>Payment Received</h2><p>Payment received for Invoice #${invoice.invoiceNumber} (${amount}).</p>`;
        text = `Payment received for Invoice #${invoice.invoiceNumber} (${amount}).`;
        break;
      case 'overdue':
        subject = `Overdue Notice - Invoice ${invoice.invoiceNumber}`;
        html = `<h2>Overdue Notice</h2><p>Invoice #${invoice.invoiceNumber} (${amount}) is overdue. Please submit payment immediately.</p>`;
        text = `Invoice #${invoice.invoiceNumber} (${amount}) is overdue. Please submit payment immediately.`;
        break;
      default:
        subject = `Payment Reminder - Invoice ${invoice.invoiceNumber}`;
        html = `<h2>Payment Reminder</h2><p>Invoice #${invoice.invoiceNumber} (${amount}) is due ${dueDate}.</p>`;
        text = `Invoice #${invoice.invoiceNumber} (${amount}) is due ${dueDate}.`;
    }

    await this.ctx.email.sendEmail({
      to: userEmail,
      subject,
      html,
      text,
      metadata: { invoiceId, type },
    });
  }

  private async sendDunningEmail(invoice: any, attemptNumber: number): Promise<void> {
    if (!this.ctx.email) return;

    const amount = this.formatCurrency(parseFloat(invoice.total), invoice.currency || 'USD');

    const urgency = attemptNumber <= 2 ? 'low' : attemptNumber <= 4 ? 'medium' : 'high';

    await this.ctx.email.sendEmail({
      to: '',
      subject: `Payment Reminder - Invoice ${invoice.invoiceNumber} (Attempt ${attemptNumber})`,
      html: `<p>Your invoice #${invoice.invoiceNumber} for ${amount} is overdue.</p><p>This is reminder attempt ${attemptNumber}.</p>`,
      text: `Your invoice #${invoice.invoiceNumber} for ${amount} is overdue. This is reminder attempt ${attemptNumber}.`,
      metadata: { invoiceId: invoice.id, attemptNumber, urgency },
    });
  }
}
