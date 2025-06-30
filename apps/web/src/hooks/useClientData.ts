// Client data management hook
// Uses tRPC for type-safe API calls to PostgreSQL via Drizzle

import { useState, useEffect } from 'react';
import { trpc } from '../api/trpc';
import { useAuth } from './useAuth';

export interface ComponentDefinition {
  id: string;
  name: string;
  description: string;
  type: string;
  provider: string;
  features: Record<string, any>;
  options: {
    controlPanelUrl?: string;
    [key: string]: any;
  };
}

export interface SubscribedComponent {
  id: string;
  name: string;
  description: string;
  quantity: number;
  unitPrice: string;
  provisioningStatus: string;
  componentId: string;
  definition: ComponentDefinition;
}

export interface ClientSubscription {
  id: string;
  status: string;
  planId: string;
  planName: string;
  currency: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  nextBillingDate: string;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  subscribedComponents: SubscribedComponent[];
}

export function useClientData() {
  const { user } = useAuth();
  const isClient = user?.role === 'CLIENT';

  // Get current client profile
  const { 
    data: clientData, 
    isLoading: loading, 
    error,
    refetch 
  } = trpc.clients.getCurrent.useQuery(undefined, {
    enabled: isClient, // Only run if user is a client
    retry: false,
  });

  // Update client profile mutation
  const updateProfileMutation = trpc.clients.updateCurrent.useMutation({
    onSuccess: () => {
      refetch(); // Refetch client data after successful update
    },
  });

  // Payment processing mutation
  const processPaymentMutation = trpc.invoices.processPayment.useMutation();
  const confirmPaymentMutation = trpc.invoices.confirmPayment.useMutation();

  // Subscription cancellation mutation
  const cancelSubscriptionMutation = trpc.subscriptions.cancelByClient.useMutation();

  // Get client invoices
  const { data: invoices, refetch: refetchInvoices } = trpc.invoices.getByClient.useQuery(undefined, {
    enabled: isClient,
    retry: false,
  });

  // Get client subscriptions
  const { data: subscriptions, refetch: refetchSubscriptions } = trpc.subscriptions.getByClient.useQuery(undefined, {
    enabled: isClient,
    retry: false,
  });

  const updateProfile = async (profileData: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    company_name?: string;
    address?: string;
    city?: string;
    state?: string;
    zip_code?: string;
    country?: string;
  }) => {
    try {
      await updateProfileMutation.mutateAsync({
        companyName: profileData.company_name,
        address: profileData.address,
        city: profileData.city,
        state: profileData.state,
        zipCode: profileData.zip_code,
        country: profileData.country,
        phone: profileData.phone,
      });
      return true;
    } catch (error) {
      console.error('Failed to update profile:', error);
      return false;
    }
  };

  const payInvoice = async (invoiceId: string, paymentMethodId?: string) => {
    try {
      // First create the payment intent
      const paymentIntent = await processPaymentMutation.mutateAsync({
        invoiceId,
        paymentMethodId,
        savePaymentMethod: false,
      });

      // For demo purposes, we'll simulate the payment confirmation
      // In a real app, this would be handled by Stripe Elements or similar
      const confirmResult = await confirmPaymentMutation.mutateAsync({
        paymentIntentId: paymentIntent.paymentIntentId,
        paymentMethodId,
      });

      if (confirmResult.success) {
        // Refetch invoices to show updated status
        await refetchInvoices();
        return true;
      }

      return false;
    } catch (error) {
      console.error('Payment failed:', error);
      throw error;
    }
  };

  const cancelSubscription = async (subscriptionId: string, reason?: string) => {
    try {
      const result = await cancelSubscriptionMutation.mutateAsync({
        id: subscriptionId,
        cancelAtPeriodEnd: true, // Default to end of period
        reason,
      });

      if (result.success) {
        // Refetch subscriptions to show updated status
        await refetchSubscriptions();
        return true;
      }

      return false;
    } catch (error) {
      console.error('Subscription cancellation failed:', error);
      throw error;
    }
  };

  // Transform data for compatibility with existing ClientPortal
  const transformedClientData = clientData ? {
    profile: {
      first_name: clientData.user?.firstName || '',
      last_name: clientData.user?.lastName || '',
      email: clientData.user?.email || '',
      phone: clientData.phone || '',
      company_name: clientData.companyName || '',
      address: clientData.address || '',
      city: clientData.city || '',
      state: clientData.state || '',
      zip_code: clientData.zipCode || '',
      country: clientData.country || '',
    },
    invoices: invoices?.invoices || [],
    subscriptions: subscriptions || [],
    stats: {
      total_invoices: invoices?.invoices?.length || 0,
      overdue_invoices: invoices?.invoices?.filter(inv => inv.status === 'OVERDUE').length || 0,
      active_subscriptions: subscriptions?.filter(sub => sub.status === 'ACTIVE').length || 0,
    }
  } : null;

  return {
    clientData: transformedClientData,
    loading,
    error: error ? 'Failed to load client data' : null,
    refetch,
    updateProfile,
    payInvoice,
    cancelSubscription,
    // Expose loading states for UI feedback
    isPaymentProcessing: processPaymentMutation.isLoading || confirmPaymentMutation.isLoading,
    isCancelling: cancelSubscriptionMutation.isLoading,
    paymentError: processPaymentMutation.error || confirmPaymentMutation.error,
    cancellationError: cancelSubscriptionMutation.error,
  };
}