import { fetchJson, fetchBlob, getApiBaseUrl } from './http';

const base = () => `${getApiBaseUrl()}/api/billing`;

export interface InvoiceRow {
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
  dueDate: string | null;
  paidAt: string | null;
  invoiceType: string | null;
  parentInvoiceId: string | null;
  tenantId: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface InvoiceItemRow {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number | null;
  unitPrice: string | null;
  total: string | null;
}

export interface InvoiceWithItems extends InvoiceRow {
  items: InvoiceItemRow[];
}

export interface PaginatedInvoices {
  invoices: InvoiceRow[];
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

export const billingApi = {
  async listInvoices(params?: {
    status?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    clientId?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedInvoices> {
    const qs = new URLSearchParams();
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    if (params?.search) qs.set('search', params.search);
    if (params?.dateFrom) qs.set('dateFrom', params.dateFrom);
    if (params?.dateTo) qs.set('dateTo', params.dateTo);
    if (params?.clientId) qs.set('clientId', params.clientId);
    qs.set('limit', String(params?.limit ?? 20));
    qs.set('offset', String(params?.offset ?? 0));
    return fetchJson<PaginatedInvoices>(`${base()}/invoices?${qs.toString()}`);
  },

  async getInvoice(id: string): Promise<InvoiceWithItems> {
    return fetchJson<InvoiceWithItems>(`${base()}/invoices/${encodeURIComponent(id)}`);
  },

  async createInvoice(body: {
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
  }): Promise<InvoiceRow> {
    return fetchJson<InvoiceRow>(`${base()}/invoices`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async updateInvoice(id: string, body: {
    status?: string;
    dueDate?: string;
    currency?: string;
  }): Promise<InvoiceRow> {
    return fetchJson<InvoiceRow>(`${base()}/invoices/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  async deleteInvoice(id: string): Promise<{ success: boolean }> {
    return fetchJson<{ success: boolean }>(`${base()}/invoices/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async sendInvoice(id: string): Promise<{ success: boolean }> {
    return fetchJson<{ success: boolean }>(`${base()}/invoices/${encodeURIComponent(id)}/send`, {
      method: 'POST',
    });
  },

  async markPaid(id: string, paymentId: string, amount: string): Promise<InvoiceRow> {
    return fetchJson<InvoiceRow>(`${base()}/invoices/${encodeURIComponent(id)}/pay`, {
      method: 'POST',
      body: JSON.stringify({ paymentId, amount }),
    });
  },

  async getPdf(id: string): Promise<Blob> {
    return fetchBlob(`${base()}/invoices/${encodeURIComponent(id)}/pdf`);
  },

  async createCredit(id: string, amount: string, reason: string): Promise<InvoiceRow> {
    return fetchJson<InvoiceRow>(`${base()}/invoices/${encodeURIComponent(id)}/credit`, {
      method: 'POST',
      body: JSON.stringify({ amount, reason }),
    });
  },

  async runDunning(): Promise<{ success: boolean }> {
    return fetchJson<{ success: boolean }>(`${base()}/dunning/run`, {
      method: 'POST',
    });
  },

  async getInvoiceItems(id: string): Promise<InvoiceItemRow[]> {
    return fetchJson<InvoiceItemRow[]>(`${base()}/invoices/${encodeURIComponent(id)}/items`);
  },

  async getStats(): Promise<BillingStats> {
    return fetchJson<BillingStats>(`${base()}/stats`);
  },

  async getMyInvoices(params?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedInvoices> {
    const qs = new URLSearchParams();
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    qs.set('limit', String(params?.limit ?? 20));
    qs.set('offset', String(params?.offset ?? 0));
    return fetchJson<PaginatedInvoices>(`${base()}/my-invoices?${qs.toString()}`);
  },
};
