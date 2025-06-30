import { db, subscriptions, subscriptionComponents, invoices, invoiceItems } from '../../db/index.js';
import { eq, and } from 'drizzle-orm';
import { InvoiceNumberService } from './InvoiceNumberService.js';
import { InvoicePDFStandards } from './InvoicePDFStandards.js';
import { EventService } from '../events/EventService.js';

interface ComponentInvoiceOptions {
  tenantId: string;
  subscriptionId: string;
  dueDate?: Date;
  invoiceType?: string;
}

export class ComponentInvoiceService {
  /**
   * Generate a new invoice for a subscription based on its components
   */
  static async generateInvoice(options: ComponentInvoiceOptions): Promise<string> {
    const { tenantId, subscriptionId, dueDate, invoiceType = 'regular' } = options;

    // Fetch subscription with components and client info
    const [subscription] = await db
      .select({
        id: subscriptions.id,
        clientId: subscriptions.clientId,
        userId: subscriptions.userId,
        currency: subscriptions.currency,
      })
      .from(subscriptions)
      .where(and(
        eq(subscriptions.id, subscriptionId),
        eq(subscriptions.tenantId, tenantId)
      ));

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Fetch subscription components
    const components = await db
      .select()
      .from(subscriptionComponents)
      .where(eq(subscriptionComponents.subscriptionId, subscriptionId));

    if (!components.length) {
      throw new Error('No components found for subscription');
    }

    // Calculate due date if not provided
    const calculatedDueDate = dueDate || (() => {
      const date = new Date();
      date.setDate(date.getDate() + InvoicePDFStandards.getStandardPaymentTerms('US', 'B2B'));
      return date;
    })();

    // Generate invoice number
    const invoiceNumber = await InvoiceNumberService.generateInvoiceNumber(tenantId);

    // Start a transaction for creating invoice and items
    return await db.transaction(async (tx) => {
      // Calculate subtotal from components
      const subtotal = components.reduce((total, component) => {
        const quantity = component.quantity || 1;
        const unitPrice = parseFloat(component.unitPrice.toString());
        return total + (quantity * unitPrice);
      }, 0);

      // Create the invoice
      const [invoice] = await tx
        .insert(invoices)
        .values({
          clientId: subscription.clientId,
          userId: subscription.userId,
          subscriptionId: subscription.id,
          invoiceNumber,
          status: 'PENDING',
          subtotal: subtotal.toFixed(2),
          tax: '0',
          total: subtotal.toFixed(2), // No tax for now
          currency: subscription.currency,
          dueDate: calculatedDueDate,
          invoiceType,
          tenantId
        })
        .returning();

      // Create invoice items for each component
      await Promise.all(components.map(component => {
        const quantity = component.quantity || 1;
        const unitPrice = parseFloat(component.unitPrice.toString());
        const total = quantity * unitPrice;

        return tx
          .insert(invoiceItems)
          .values({
            invoiceId: invoice.id,
            description: `${component.name}${component.description ? ` - ${component.description}` : ''}`,
            quantity,
            unitPrice: component.unitPrice.toString(),
            total: total.toFixed(2)
          });
      }));

      // Emit invoice created event
      await EventService.emit('invoice.created', {
        invoiceId: invoice.id,
        tenantId: invoice.tenantId
      });

      return invoice.id;
    });
  }

  /**
   * Calculate price for a subscription component
   */
  private static calculateComponentPrice(component: any): number {
    const quantity = component.quantity || 1;
    const unitPrice = parseFloat(component.unitPrice.toString());
    return quantity * unitPrice;
  }
} 