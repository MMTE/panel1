import PDFDocument from 'pdfkit';
import { db, invoices, invoiceItems, clients, users, tenants } from '../../db/index.js';
import { eq, and } from 'drizzle-orm';

export interface InvoiceData {
  id: string;
  invoiceNumber: string;
  status: string;
  subtotal: string;
  tax: string;
  total: string;
  currency: string;
  dueDate: Date;
  paidAt: Date | null;
  createdAt: Date;
  client: {
    id: string;
    companyName: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    country: string | null;
    user: {
      email: string;
      firstName: string | null;
      lastName: string | null;
    };
  };
  tenant: {
    name: string;
    domain: string;
    settings: any;
  };
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: string;
    total: string;
  }>;
}

export class InvoicePDFService {
  /**
   * Generate PDF buffer for an invoice
   */
  static async generatePDF(invoiceId: string, tenantId: string): Promise<Buffer> {
    // Fetch invoice data with all related information
    const invoiceData = await this.getInvoiceData(invoiceId, tenantId);
    
    if (!invoiceData) {
      throw new Error('Invoice not found');
    }

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50,
        });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        this.generateInvoicePDF(doc, invoiceData);
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Fetch complete invoice data from database
   */
  private static async getInvoiceData(invoiceId: string, tenantId: string): Promise<InvoiceData | null> {
    // Get invoice with client and tenant data
    const [invoice] = await db
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
        clientAddress: clients.address,
        clientCity: clients.city,
        clientState: clients.state,
        clientZipCode: clients.zipCode,
        clientCountry: clients.country,
        clientUserEmail: users.email,
        clientUserFirstName: users.firstName,
        clientUserLastName: users.lastName,
        tenantName: tenants.name,
        tenantDomain: tenants.domain,
        tenantSettings: tenants.settings,
      })
      .from(invoices)
      .leftJoin(clients, eq(invoices.clientId, clients.id))
      .leftJoin(users, eq(clients.userId, users.id))
      .leftJoin(tenants, eq(invoices.tenantId, tenants.id))
      .where(and(
        eq(invoices.id, invoiceId),
        eq(invoices.tenantId, tenantId)
      ))
      .limit(1);

    if (!invoice) {
      return null;
    }

    // Get invoice items
    const items = await db
      .select()
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, invoiceId));

    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      subtotal: invoice.subtotal,
      tax: invoice.tax,
      total: invoice.total,
      currency: invoice.currency,
      dueDate: invoice.dueDate,
      paidAt: invoice.paidAt,
      createdAt: invoice.createdAt,
      client: {
        id: invoice.clientId!,
        companyName: invoice.clientCompanyName,
        address: invoice.clientAddress,
        city: invoice.clientCity,
        state: invoice.clientState,
        zipCode: invoice.clientZipCode,
        country: invoice.clientCountry,
        user: {
          email: invoice.clientUserEmail!,
          firstName: invoice.clientUserFirstName,
          lastName: invoice.clientUserLastName,
        },
      },
      tenant: {
        name: invoice.tenantName!,
        domain: invoice.tenantDomain!,
        settings: invoice.tenantSettings,
      },
      items: items.map(item => ({
        description: item.description,
        quantity: item.quantity || 1,
        unitPrice: item.unitPrice,
        total: item.total,
      })),
    };
  }

  /**
   * Generate the actual PDF content
   */
  private static generateInvoicePDF(doc: PDFDocument, invoice: InvoiceData): void {
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 50;

    // Header
    this.generateHeader(doc, invoice, pageWidth, margin);
    
    // Invoice details
    this.generateInvoiceDetails(doc, invoice, pageWidth, margin);
    
    // Client information
    this.generateClientInfo(doc, invoice, pageWidth, margin);
    
    // Items table
    this.generateItemsTable(doc, invoice, pageWidth, margin);
    
    // Total section
    this.generateTotals(doc, invoice, pageWidth, margin);
    
    // Footer
    this.generateFooter(doc, invoice, pageWidth, pageHeight, margin);
  }

  private static generateHeader(doc: PDFDocument, invoice: InvoiceData, pageWidth: number, margin: number): void {
    doc.fontSize(24)
       .font('Helvetica-Bold')
       .text(invoice.tenant.name, margin, margin)
       .fontSize(10)
       .font('Helvetica')
       .text(invoice.tenant.domain, margin, margin + 30);

    doc.fontSize(20)
       .font('Helvetica-Bold')
       .text('INVOICE', pageWidth - 150, margin, { align: 'right' })
       .fontSize(12)
       .font('Helvetica')
       .text(`#${invoice.invoiceNumber}`, pageWidth - 150, margin + 25, { align: 'right' });
  }

  private static generateInvoiceDetails(doc: PDFDocument, invoice: InvoiceData, pageWidth: number, margin: number): void {
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
       .text(invoice.status, margin + 80, startY + 30);

    if (invoice.paidAt) {
      doc.font('Helvetica-Bold')
         .text('Paid Date:', margin, startY + 45)
         .font('Helvetica')
         .text(this.formatDate(invoice.paidAt), margin + 80, startY + 45);
    }
  }

  private static generateClientInfo(doc: PDFDocument, invoice: InvoiceData, pageWidth: number, margin: number): void {
    const startY = margin + 160;
    
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .text('Bill To:', margin, startY);

    let y = startY + 20;
    
    const clientName = invoice.client.companyName || 
                      `${invoice.client.user.firstName || ''} ${invoice.client.user.lastName || ''}`.trim();
    
    if (clientName) {
      doc.fontSize(10)
         .font('Helvetica-Bold')
         .text(clientName, margin, y);
      y += 15;
    }

    doc.font('Helvetica')
       .text(invoice.client.user.email, margin, y);
    y += 15;

    if (invoice.client.address) {
      doc.text(invoice.client.address, margin, y);
      y += 15;
    }

    const cityStateZip = [
      invoice.client.city,
      invoice.client.state,
      invoice.client.zipCode
    ].filter(Boolean).join(', ');

    if (cityStateZip) {
      doc.text(cityStateZip, margin, y);
      y += 15;
    }

    if (invoice.client.country) {
      doc.text(invoice.client.country, margin, y);
    }
  }

  private static generateItemsTable(doc: PDFDocument, invoice: InvoiceData, pageWidth: number, margin: number): void {
    const startY = margin + 280;
    const tableWidth = pageWidth - (margin * 2);
    
    // Table headers
    doc.fontSize(10)
       .font('Helvetica-Bold')
       .text('Description', margin, startY)
       .text('Qty', pageWidth - 200, startY)
       .text('Unit Price', pageWidth - 150, startY)
       .text('Total', pageWidth - 100, startY);

    // Draw header line
    doc.moveTo(margin, startY + 15)
       .lineTo(pageWidth - margin, startY + 15)
       .stroke();

    let y = startY + 25;
    
    // Table rows
    invoice.items.forEach((item) => {
      doc.fontSize(9)
         .font('Helvetica')
         .text(item.description, margin, y, { width: tableWidth * 0.5 })
         .text(item.quantity.toString(), pageWidth - 200, y)
         .text(this.formatCurrency(parseFloat(item.unitPrice), invoice.currency), pageWidth - 150, y)
         .text(this.formatCurrency(parseFloat(item.total), invoice.currency), pageWidth - 100, y);
      
      y += 20;
    });

    // Draw bottom line
    doc.moveTo(margin, y)
       .lineTo(pageWidth - margin, y)
       .stroke();
  }

  private static generateTotals(doc: PDFDocument, invoice: InvoiceData, pageWidth: number, margin: number): void {
    const startY = margin + 350 + (invoice.items.length * 20);
    
    doc.fontSize(10)
       .font('Helvetica')
       .text('Subtotal:', pageWidth - 150, startY)
       .text(this.formatCurrency(parseFloat(invoice.subtotal), invoice.currency), pageWidth - 100, startY)
       .text('Tax:', pageWidth - 150, startY + 15)
       .text(this.formatCurrency(parseFloat(invoice.tax), invoice.currency), pageWidth - 100, startY + 15);

    doc.font('Helvetica-Bold')
       .fontSize(12)
       .text('Total:', pageWidth - 150, startY + 35)
       .text(this.formatCurrency(parseFloat(invoice.total), invoice.currency), pageWidth - 100, startY + 35);

    // Draw line above total
    doc.moveTo(pageWidth - 150, startY + 30)
       .lineTo(pageWidth - margin, startY + 30)
       .stroke();
  }

  private static generateFooter(doc: PDFDocument, invoice: InvoiceData, pageWidth: number, pageHeight: number, margin: number): void {
    doc.fontSize(8)
       .font('Helvetica')
       .text('Thank you for your business!', margin, pageHeight - 60)
       .text(`Generated on ${this.formatDate(new Date())}`, margin, pageHeight - 40);
  }

  private static formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  private static formatCurrency(amount: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  }
} 