import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export interface ClientProfile {
  id: string;
  company_name?: string;
  first_name?: string;
  last_name?: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
}

export interface ClientSubscription {
  id: string;
  plan: {
    id: string;
    name: string;
    price: number;
    interval: string;
  };
  status: string;
  current_period_start: string;
  current_period_end: string;
  next_billing_date: string;
}

export interface ClientInvoice {
  id: string;
  invoice_number: string;
  status: string;
  total: number;
  due_date: string;
  paid_at: string | null;
  created_at: string;
  items: {
    description: string;
    amount: number;
  }[];
}

export interface ClientStats {
  totalSpent: number;
  activeSubscriptions: number;
  pendingInvoices: number;
  nextBilling: string;
}

export interface ClientData {
  profile: ClientProfile;
  subscriptions: ClientSubscription[];
  invoices: ClientInvoice[];
  stats: ClientStats;
}

export function useClientData() {
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, isDemoMode } = useAuth();

  // Mock client data for demo mode
  const mockClientData: ClientData = {
    profile: {
      id: 'demo-client-id',
      company_name: 'Acme Corporation',
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@acme.com',
      phone: '+1 (555) 123-4567',
      address: '123 Business St',
      city: 'New York',
      state: 'NY',
      zip_code: '10001',
      country: 'United States'
    },
    subscriptions: [
      {
        id: 'sub_001',
        plan: {
          id: 'plan_001',
          name: 'Professional Hosting',
          price: 19.99,
          interval: 'MONTHLY'
        },
        status: 'ACTIVE',
        current_period_start: '2024-01-01T00:00:00Z',
        current_period_end: '2024-02-01T00:00:00Z',
        next_billing_date: '2024-02-01T00:00:00Z'
      },
      {
        id: 'sub_002',
        plan: {
          id: 'plan_002',
          name: 'SSL Certificate',
          price: 9.99,
          interval: 'YEARLY'
        },
        status: 'ACTIVE',
        current_period_start: '2024-01-01T00:00:00Z',
        current_period_end: '2025-01-01T00:00:00Z',
        next_billing_date: '2025-01-01T00:00:00Z'
      }
    ],
    invoices: [
      {
        id: 'inv_001',
        invoice_number: 'INV-2024-001',
        status: 'PAID',
        total: 19.99,
        due_date: '2024-01-15T00:00:00Z',
        paid_at: '2024-01-14T10:30:00Z',
        created_at: '2024-01-01T09:00:00Z',
        items: [
          { description: 'Professional Hosting Plan', amount: 19.99 }
        ]
      },
      {
        id: 'inv_002',
        invoice_number: 'INV-2024-002',
        status: 'PENDING',
        total: 19.99,
        due_date: '2024-02-15T00:00:00Z',
        paid_at: null,
        created_at: '2024-02-01T09:00:00Z',
        items: [
          { description: 'Professional Hosting Plan', amount: 19.99 }
        ]
      }
    ],
    stats: {
      totalSpent: 239.88,
      activeSubscriptions: 2,
      pendingInvoices: 1,
      nextBilling: '2024-02-01T00:00:00Z'
    }
  };

  useEffect(() => {
    if (isDemoMode) {
      setClientData(mockClientData);
      setLoading(false);
      return;
    }

    if (!user) {
      setLoading(false);
      return;
    }

    const fetchClientData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch user profile
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id, email, first_name, last_name')
          .eq('auth_user_id', user.id)
          .single();

        if (userError) throw userError;

        // Fetch client profile
        const { data: clientData, error: clientError } = await supabase
          .from('clients')
          .select('*')
          .eq('user_id', userData.id)
          .single();

        if (clientError && clientError.code !== 'PGRST116') throw clientError; // PGRST116 is "no rows returned"

        // Fetch subscriptions
        const { data: subscriptionsData, error: subscriptionsError } = await supabase
          .from('subscriptions')
          .select(`
            id, 
            status, 
            current_period_start, 
            current_period_end, 
            next_billing_date,
            plans (
              id, 
              name, 
              price, 
              interval
            )
          `)
          .eq('client_id', clientData?.id || '')
          .eq('status', 'ACTIVE');

        if (subscriptionsError) throw subscriptionsError;

        // Fetch invoices
        const { data: invoicesData, error: invoicesError } = await supabase
          .from('invoices')
          .select(`
            id, 
            invoice_number, 
            status, 
            total, 
            due_date, 
            paid_at, 
            created_at,
            invoice_items (
              description,
              unit_price,
              quantity
            )
          `)
          .eq('client_id', clientData?.id || '')
          .order('created_at', { ascending: false });

        if (invoicesError) throw invoicesError;

        // Calculate stats
        const totalSpent = invoicesData
          .filter(invoice => invoice.status === 'PAID')
          .reduce((sum, invoice) => sum + parseFloat(invoice.total), 0);

        const pendingInvoices = invoicesData.filter(invoice => invoice.status === 'PENDING').length;
        
        const activeSubscriptions = subscriptionsData.length;
        
        const nextBillingDates = subscriptionsData
          .map(sub => sub.next_billing_date)
          .filter(date => date)
          .sort();
        
        const nextBilling = nextBillingDates.length > 0 ? nextBillingDates[0] : null;

        // Format the data
        const formattedData: ClientData = {
          profile: {
            id: clientData?.id || userData.id,
            company_name: clientData?.company_name || '',
            first_name: userData.first_name || '',
            last_name: userData.last_name || '',
            email: userData.email,
            phone: clientData?.phone || '',
            address: clientData?.address || '',
            city: clientData?.city || '',
            state: clientData?.state || '',
            zip_code: clientData?.zip_code || '',
            country: clientData?.country || ''
          },
          subscriptions: subscriptionsData.map(sub => ({
            id: sub.id,
            plan: {
              id: sub.plans.id,
              name: sub.plans.name,
              price: parseFloat(sub.plans.price),
              interval: sub.plans.interval
            },
            status: sub.status,
            current_period_start: sub.current_period_start,
            current_period_end: sub.current_period_end,
            next_billing_date: sub.next_billing_date
          })),
          invoices: invoicesData.map(invoice => ({
            id: invoice.id,
            invoice_number: invoice.invoice_number,
            status: invoice.status,
            total: parseFloat(invoice.total),
            due_date: invoice.due_date,
            paid_at: invoice.paid_at,
            created_at: invoice.created_at,
            items: invoice.invoice_items.map(item => ({
              description: item.description,
              amount: parseFloat(item.unit_price) * item.quantity
            }))
          })),
          stats: {
            totalSpent,
            activeSubscriptions,
            pendingInvoices,
            nextBilling: nextBilling || new Date().toISOString()
          }
        };

        setClientData(formattedData);
      } catch (err) {
        console.error('Error fetching client data:', err);
        setError(err instanceof Error ? err.message : 'An error occurred while fetching client data');
      } finally {
        setLoading(false);
      }
    };

    fetchClientData();
  }, [user, isDemoMode]);

  const updateProfile = async (updates: Partial<ClientProfile>): Promise<boolean> => {
    if (isDemoMode) {
      console.log('🎭 Demo mode: Profile update simulated', updates);
      if (clientData) {
        setClientData({
          ...clientData,
          profile: {
            ...clientData.profile,
            ...updates
          }
        });
      }
      return true;
    }

    if (!user || !clientData) return false;

    try {
      // Determine which updates go to users table vs clients table
      const userUpdates: any = {};
      const clientUpdates: any = {};

      if (updates.first_name) userUpdates.first_name = updates.first_name;
      if (updates.last_name) userUpdates.last_name = updates.last_name;
      if (updates.email) userUpdates.email = updates.email;

      if (updates.company_name) clientUpdates.company_name = updates.company_name;
      if (updates.phone) clientUpdates.phone = updates.phone;
      if (updates.address) clientUpdates.address = updates.address;
      if (updates.city) clientUpdates.city = updates.city;
      if (updates.state) clientUpdates.state = updates.state;
      if (updates.zip_code) clientUpdates.zip_code = updates.zip_code;
      if (updates.country) clientUpdates.country = updates.country;

      // Update user profile if needed
      if (Object.keys(userUpdates).length > 0) {
        const { error: userError } = await supabase
          .from('users')
          .update(userUpdates)
          .eq('auth_user_id', user.id);

        if (userError) throw userError;
      }

      // Update client profile if needed
      if (Object.keys(clientUpdates).length > 0) {
        const { error: clientError } = await supabase
          .from('clients')
          .update(clientUpdates)
          .eq('id', clientData.profile.id);

        if (clientError) throw clientError;
      }

      // Update local state
      if (clientData) {
        setClientData({
          ...clientData,
          profile: {
            ...clientData.profile,
            ...updates
          }
        });
      }

      return true;
    } catch (err) {
      console.error('Error updating profile:', err);
      setError(err instanceof Error ? err.message : 'An error occurred while updating profile');
      return false;
    }
  };

  const payInvoice = async (invoiceId: string): Promise<boolean> => {
    if (isDemoMode) {
      console.log('🎭 Demo mode: Invoice payment simulated', invoiceId);
      if (clientData) {
        const updatedInvoices = clientData.invoices.map(invoice => {
          if (invoice.id === invoiceId) {
            return {
              ...invoice,
              status: 'PAID',
              paid_at: new Date().toISOString()
            };
          }
          return invoice;
        });

        setClientData({
          ...clientData,
          invoices: updatedInvoices,
          stats: {
            ...clientData.stats,
            pendingInvoices: clientData.stats.pendingInvoices - 1,
            totalSpent: clientData.stats.totalSpent + (clientData.invoices.find(i => i.id === invoiceId)?.total || 0)
          }
        });
      }
      return true;
    }

    if (!user || !clientData) return false;

    try {
      // In a real implementation, this would integrate with a payment gateway
      // For now, we'll just update the invoice status
      const { error } = await supabase
        .from('invoices')
        .update({
          status: 'PAID',
          paid_at: new Date().toISOString()
        })
        .eq('id', invoiceId);

      if (error) throw error;

      // Update local state
      if (clientData) {
        const updatedInvoices = clientData.invoices.map(invoice => {
          if (invoice.id === invoiceId) {
            return {
              ...invoice,
              status: 'PAID',
              paid_at: new Date().toISOString()
            };
          }
          return invoice;
        });

        setClientData({
          ...clientData,
          invoices: updatedInvoices,
          stats: {
            ...clientData.stats,
            pendingInvoices: clientData.stats.pendingInvoices - 1,
            totalSpent: clientData.stats.totalSpent + (clientData.invoices.find(i => i.id === invoiceId)?.total || 0)
          }
        });
      }

      return true;
    } catch (err) {
      console.error('Error paying invoice:', err);
      setError(err instanceof Error ? err.message : 'An error occurred while paying invoice');
      return false;
    }
  };

  const cancelSubscription = async (subscriptionId: string): Promise<boolean> => {
    if (isDemoMode) {
      console.log('🎭 Demo mode: Subscription cancellation simulated', subscriptionId);
      if (clientData) {
        const updatedSubscriptions = clientData.subscriptions.map(subscription => {
          if (subscription.id === subscriptionId) {
            return {
              ...subscription,
              status: 'CANCELLED'
            };
          }
          return subscription;
        });

        setClientData({
          ...clientData,
          subscriptions: updatedSubscriptions,
          stats: {
            ...clientData.stats,
            activeSubscriptions: clientData.stats.activeSubscriptions - 1
          }
        });
      }
      return true;
    }

    if (!user || !clientData) return false;

    try {
      // Update subscription status
      const { error } = await supabase
        .from('subscriptions')
        .update({
          status: 'CANCELLED',
          cancel_at_period_end: true
        })
        .eq('id', subscriptionId);

      if (error) throw error;

      // Update local state
      if (clientData) {
        const updatedSubscriptions = clientData.subscriptions.map(subscription => {
          if (subscription.id === subscriptionId) {
            return {
              ...subscription,
              status: 'CANCELLED'
            };
          }
          return subscription;
        });

        setClientData({
          ...clientData,
          subscriptions: updatedSubscriptions,
          stats: {
            ...clientData.stats,
            activeSubscriptions: clientData.stats.activeSubscriptions - 1
          }
        });
      }

      return true;
    } catch (err) {
      console.error('Error cancelling subscription:', err);
      setError(err instanceof Error ? err.message : 'An error occurred while cancelling subscription');
      return false;
    }
  };

  return {
    clientData,
    loading,
    error,
    updateProfile,
    payInvoice,
    cancelSubscription
  };
}