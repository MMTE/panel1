import { trpc } from '../api/trpc';
import { useAuth } from './useAuth';

export function useInvoices() {
  const { isDemoMode } = useAuth();
  
  // Mock invoice data for demo
  const mockInvoices = [
    {
      id: 'inv_001',
      invoice_number: 'INV-2024-001',
      client: {
        company_name: 'Acme Corporation',
        user: { first_name: 'John', last_name: 'Doe', email: 'john@acme.com' }
      },
      status: 'PAID',
      total: 299.99,
      currency: 'USD',
      due_date: '2024-01-15T00:00:00Z',
      paid_at: '2024-01-14T10:30:00Z',
      created_at: '2024-01-01T09:00:00Z',
      items: [
        { description: 'Professional Hosting Plan', quantity: 1, unit_price: 299.99 }
      ]
    },
    {
      id: 'inv_002',
      invoice_number: 'INV-2024-002',
      client: {
        company_name: 'Tech Startup Inc',
        user: { first_name: 'Jane', last_name: 'Smith', email: 'jane@techstartup.com' }
      },
      status: 'PENDING',
      total: 99.99,
      currency: 'USD',
      due_date: '2024-01-25T00:00:00Z',
      paid_at: null,
      created_at: '2024-01-10T14:20:00Z',
      items: [
        { description: 'Basic Hosting Plan', quantity: 1, unit_price: 99.99 }
      ]
    },
    {
      id: 'inv_003',
      invoice_number: 'INV-2024-003',
      client: {
        company_name: 'Global Solutions Ltd',
        user: { first_name: 'Mike', last_name: 'Johnson', email: 'mike@globalsolutions.com' }
      },
      status: 'OVERDUE',
      total: 199.99,
      currency: 'USD',
      due_date: '2024-01-10T00:00:00Z',
      paid_at: null,
      created_at: '2023-12-25T11:15:00Z',
      items: [
        { description: 'Enterprise Hosting Plan', quantity: 1, unit_price: 199.99 }
      ]
    },
    {
      id: 'inv_004',
      invoice_number: 'INV-2024-004',
      client: {
        company_name: 'Small Business LLC',
        user: { first_name: 'Sarah', last_name: 'Wilson', email: 'sarah@smallbiz.com' }
      },
      status: 'DRAFT',
      total: 49.99,
      currency: 'USD',
      due_date: '2024-02-01T00:00:00Z',
      paid_at: null,
      created_at: '2024-01-20T16:45:00Z',
      items: [
        { description: 'Starter Hosting Plan', quantity: 1, unit_price: 49.99 }
      ]
    }
  ];

  const mockStats = {
    totalInvoices: 1247,
    totalAmount: 125430.50,
    paidAmount: 118650.25,
    pendingAmount: 4320.75,
    overdueAmount: 2459.50
  };

  const {
    data: invoicesData,
    isLoading: isInvoicesLoading,
    error: invoicesError,
    refetch: refetchInvoices
  } = trpc.invoices.getAll.useQuery(
    { limit: 100, offset: 0 },
    { enabled: !isDemoMode }
  );

  const {
    data: statsData,
    isLoading: isStatsLoading,
    error: statsError
  } = trpc.invoices.getStats.useQuery(
    undefined,
    { enabled: !isDemoMode }
  );

  return {
    invoices: isDemoMode ? mockInvoices : (invoicesData?.invoices || []),
    totalInvoices: isDemoMode ? mockInvoices.length : (invoicesData?.total || 0),
    stats: isDemoMode ? mockStats : statsData,
    loading: isInvoicesLoading || isStatsLoading,
    error: invoicesError?.message || statsError?.message,
    refetch: refetchInvoices
  };
}