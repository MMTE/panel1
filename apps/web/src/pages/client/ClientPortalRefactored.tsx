import React, { useState } from 'react';
import { Loader, AlertCircle, User } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { PluginSlot } from '../../lib/plugins';
import { useClientData, ClientInvoice, ClientSubscription } from '../../hooks/useClientData';
import { ClientHeader } from '../../components/client/ClientHeader';
import { ClientNavigation } from '../../components/client/ClientNavigation';
import { InvoiceDetails } from '../../components/client/InvoiceDetails';
import { SubscriptionDetails } from '../../components/client/SubscriptionDetails';
import { PaymentModal } from '../../components/client/PaymentModal';

// Import tab content components
import { ClientOverview } from './tabs/ClientOverview';
import { ClientSubscriptions } from './tabs/ClientSubscriptions';
import { ClientInvoices } from './tabs/ClientInvoices';
import { ClientProfile } from './tabs/ClientProfile';

export function ClientPortalRefactored() {
  const { user, signOut, isDemoMode } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'invoices' | 'subscriptions' | 'profile'>('overview');
  const { 
    clientData, 
    loading, 
    error, 
    updateProfile,
    payInvoice,
    cancelSubscription
  } = useClientData();
  
  // Modal states
  const [selectedInvoice, setSelectedInvoice] = useState<ClientInvoice | null>(null);
  const [selectedSubscription, setSelectedSubscription] = useState<ClientSubscription | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
      window.location.href = '/';
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleViewInvoice = (invoice: ClientInvoice) => {
    setSelectedInvoice(invoice);
  };

  const handleViewSubscription = (subscription: ClientSubscription) => {
    setSelectedSubscription(subscription);
  };

  const handlePayInvoice = async (invoiceId: string) => {
    const invoice = clientData?.invoices.find(i => i.id === invoiceId);
    if (invoice) {
      setSelectedInvoice(invoice);
      setShowPaymentModal(true);
    }
  };

  const handlePaymentComplete = async () => {
    if (selectedInvoice) {
      await payInvoice(selectedInvoice.id);
      setShowPaymentModal(false);
      setSelectedInvoice(null);
    }
  };

  const handleCancelSubscription = async () => {
    if (selectedSubscription) {
      await cancelSubscription(selectedSubscription.id);
      setShowCancelModal(false);
      setSelectedSubscription(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 text-purple-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading your account information...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Data</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!clientData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <User className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">No Client Profile Found</h2>
          <p className="text-gray-600 mb-6">
            We couldn't find a client profile associated with your account. Please contact support for assistance.
          </p>
          <button
            onClick={handleSignOut}
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <ClientHeader 
        firstName={clientData.profile.first_name} 
        email={clientData.profile.email}
        onSignOut={handleSignOut}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Navigation Tabs */}
        <ClientNavigation 
          activeTab={activeTab} 
          onTabChange={(tab) => setActiveTab(tab as any)} 
        />

        <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200">
          {activeTab === 'overview' && (
            <ClientOverview 
              clientData={clientData}
              onViewInvoice={handleViewInvoice}
              onViewSubscription={handleViewSubscription}
              onTabChange={setActiveTab}
            />
          )}

          {activeTab === 'subscriptions' && (
            <ClientSubscriptions 
              subscriptions={clientData.subscriptions}
              onViewSubscription={handleViewSubscription}
              onCancelSubscription={(id) => {
                const subscription = clientData.subscriptions.find(s => s.id === id);
                if (subscription) {
                  setSelectedSubscription(subscription);
                  setShowCancelModal(true);
                }
              }}
            />
          )}

          {activeTab === 'invoices' && (
            <ClientInvoices 
              invoices={clientData.invoices}
              onViewInvoice={handleViewInvoice}
              onPayInvoice={handlePayInvoice}
            />
          )}

          {activeTab === 'profile' && (
            <ClientProfile 
              profile={clientData.profile}
              onUpdateProfile={updateProfile}
            />
          )}
        </div>

        {/* Plugin Slot: Client Portal Bottom */}
        <PluginSlot 
          slotId="client.portal.bottom" 
          props={{ user, isDemoMode, clientData }}
          className="mt-6"
        />
      </div>

      {/* Invoice Details Modal */}
      {selectedInvoice && !showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <InvoiceDetails 
            invoice={selectedInvoice} 
            onClose={() => setSelectedInvoice(null)}
            onPay={() => setShowPaymentModal(true)}
          />
        </div>
      )}

      {/* Subscription Details Modal */}
      {selectedSubscription && !showCancelModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <SubscriptionDetails 
            subscription={selectedSubscription} 
            onClose={() => setSelectedSubscription(null)}
            onCancel={() => setShowCancelModal(true)}
          />
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedInvoice && (
        <PaymentModal 
          invoiceId={selectedInvoice.id}
          amount={selectedInvoice.total}
          invoiceNumber={selectedInvoice.invoice_number}
          onClose={() => setShowPaymentModal(false)}
          onPaymentComplete={() => {
            setShowPaymentModal(false);
            setSelectedInvoice(null);
          }}
        />
      )}

      {/* Cancel Subscription Modal */}
      {showCancelModal && selectedSubscription && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Cancel Subscription</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to cancel your {selectedSubscription.plan.name} subscription? 
              You will still have access until the end of your current billing period on {new Date(selectedSubscription.current_period_end).toLocaleDateString()}.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Keep Subscription
              </button>
              <button
                onClick={handleCancelSubscription}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
              >
                Cancel Subscription
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}