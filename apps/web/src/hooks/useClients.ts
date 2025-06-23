import { trpc } from '../api/trpc';
import { useAuth } from './useAuth';

export function useClients() {
  const { isDemoMode } = useAuth();
  
  // Mock client data for demo
  const mockClients = [
    {
      id: '1',
      company_name: 'Acme Corporation',
      user: {
        email: 'john@acme.com',
        first_name: 'John',
        last_name: 'Doe'
      },
      phone: '+1 (555) 123-4567',
      city: 'New York',
      country: 'United States',
      status: 'ACTIVE',
      created_at: '2024-01-15T10:30:00Z',
      _count: {
        invoices: 12,
        subscriptions: 3
      },
      total_revenue: 2450.00
    },
    {
      id: '2',
      company_name: 'Tech Startup Inc',
      user: {
        email: 'jane@techstartup.com',
        first_name: 'Jane',
        last_name: 'Smith'
      },
      phone: '+1 (555) 987-6543',
      city: 'San Francisco',
      country: 'United States',
      status: 'ACTIVE',
      created_at: '2024-01-10T09:15:00Z',
      _count: {
        invoices: 8,
        subscriptions: 2
      },
      total_revenue: 1890.00
    },
    {
      id: '3',
      company_name: 'Global Solutions Ltd',
      user: {
        email: 'mike@globalsolutions.com',
        first_name: 'Mike',
        last_name: 'Johnson'
      },
      phone: '+44 20 7123 4567',
      city: 'London',
      country: 'United Kingdom',
      status: 'INACTIVE',
      created_at: '2024-01-05T14:20:00Z',
      _count: {
        invoices: 5,
        subscriptions: 1
      },
      total_revenue: 750.00
    }
  ];

  const {
    data: clientsData,
    isLoading,
    error,
    refetch
  } = trpc.clients.getAll.useQuery(
    { limit: 100, offset: 0 },
    { enabled: !isDemoMode }
  );

  return {
    clients: isDemoMode ? mockClients : (clientsData?.clients || []),
    totalClients: isDemoMode ? mockClients.length : (clientsData?.total || 0),
    loading: isLoading,
    error: error?.message,
    refetch
  };
}