export type InvoiceStatus = 'DRAFT' | 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export interface InvoiceFilters {
  status?: InvoiceStatus;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  clientId?: string;
}

export interface CreateInvoiceInput {
  clientId: string;
  subscriptionId?: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: string;
  }>;
  tax?: string;
  dueDate: string;
  currency?: string;
}

export interface UpdateInvoiceInput {
  status?: InvoiceStatus;
  dueDate?: string;
  currency?: string;
}

export interface MarkPaidInput {
  paymentId: string;
  amount: string;
}

export interface CreateCreditInput {
  amount: string;
  reason: string;
}

export interface InvoiceDTO {
  id: string;
  clientId: string | null;
  userId: string | null;
  subscriptionId: string | null;
  invoiceNumber: string;
  status: string | null;
  subtotal: string | null;
  tax: string | null;
  total: string | null;
  currency: string | null;
  dueDate: Date | null;
  paidAt: Date | null;
  invoiceType: string | null;
  parentInvoiceId: string | null;
  tenantId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface InvoiceItemDTO {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number | null;
  unitPrice: string | null;
  total: string | null;
}

export interface InvoiceWithItemsDTO extends InvoiceDTO {
  items: InvoiceItemDTO[];
}

export interface PaginatedInvoices {
  invoices: InvoiceDTO[];
  total: number;
  hasMore: boolean;
}

export interface BillingStats {
  totalInvoices: number;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  overdueAmount: number;
}

export interface IBillingService {
  createInvoice(input: CreateInvoiceInput, tenantId: string, userId: string): Promise<InvoiceDTO>;
  getInvoice(id: string, tenantId: string): Promise<InvoiceWithItemsDTO | null>;
  listInvoices(filters: InvoiceFilters, tenantId: string, limit: number, offset: number): Promise<PaginatedInvoices>;
  updateInvoice(id: string, data: UpdateInvoiceInput, tenantId: string): Promise<InvoiceDTO>;
  deleteInvoice(id: string, tenantId: string): Promise<void>;
  markPaid(id: string, paymentId: string, amount: string, tenantId: string): Promise<InvoiceDTO>;
  sendInvoice(id: string, tenantId: string): Promise<void>;
  generatePdf(id: string, tenantId: string): Promise<Buffer>;
  voidInvoice(id: string, tenantId: string): Promise<InvoiceDTO>;
  createCredit(id: string, amount: string, reason: string, tenantId: string): Promise<InvoiceDTO>;
  runDunningCycle(): Promise<void>;
  getStats(tenantId: string): Promise<BillingStats>;
  handlePaymentSucceeded(payload: { invoiceId: string; paymentId: string; tenantId: string }): Promise<void>;
  createRecurringInvoice(payload: { subscriptionId: string; tenantId: string }): Promise<string>;
  generateRecurringInvoices(): Promise<void>;
  sendOverdueReminders(): Promise<void>;
}

declare module '@panel1/types' {
  interface EventMap {
    'invoice.created': { invoiceId: string; tenantId: string };
    'invoice.sent': { invoiceId: string; tenantId: string };
    'invoice.paid': { invoiceId: string; paymentId: string; amount: number; tenantId: string };
    'invoice.overdue': { invoiceId: string; tenantId: string };
    'invoice.cancelled': { invoiceId: string; tenantId: string };
    'invoice.refunded': { invoiceId: string; amount: number; tenantId: string };
    'dunning.attempted': { invoiceId: string; attempt: number; tenantId: string };
  }
}
