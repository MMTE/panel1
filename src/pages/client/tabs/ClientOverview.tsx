import React from 'react';
import { 
  DollarSign, 
  Package, 
  FileText, 
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle,
  Activity
} from 'lucide-react';
import { PluginSlot } from '../../../lib/plugins';
import { ClientData, ClientInvoice, ClientSubscription } from '../../../hooks/useClientData';
import { useAuth } from '../../../hooks/useAuth';

interface ClientOverviewProps {
  clientData: ClientData;
  onViewInvoice: (invoice: ClientInvoice) => void;
  onViewSubscription: (subscription: ClientSubscription) => void;
  onTabChange: (tab: 'overview' | 'invoices' | 'subscriptions' | 'profile') => void;
}

export function ClientOverview({ 
  clientData, 
  onViewInvoice, 
  onViewSubscription,
  onTabChange
}: ClientOverviewProps) {
  const { user, isDemoMode } = useAuth();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ACTIVE':
      case 'PAID':
        return CheckCircle;
      case 'PENDING':
        return Clock;
      case 'OVERDUE':
      case 'CANCELLED':
        return AlertCircle;
      default:
        return Activity;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
      case 'PAID':
        return 'text-green-500';
      case 'PENDING':
        return 'text-yellow-500';
      case 'OVERDUE':
      case 'CANCELLED':
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100">Total Spent</p>
              <p className="text-3xl font-bold mt-2">{formatCurrency(clientData.stats.totalSpent)}</p>
            </div>
            <DollarSign className="w-8 h-8 text-blue-200" />
          </div>
        </div>

        <div className="bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100">Active Services</p>
              <p className="text-3xl font-bold mt-2">{clientData.stats.activeSubscriptions}</p>
            </div>
            <Package className="w-8 h-8 text-green-200" />
          </div>
        </div>

        <div className="bg-gradient-to-r from-yellow-500 to-orange-500 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-yellow-100">Pending Invoices</p>
              <p className="text-3xl font-bold mt-2">{clientData.stats.pendingInvoices}</p>
            </div>
            <FileText className="w-8 h-8 text-yellow-200" />
          </div>
        </div>

        <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100">Next Billing</p>
              <p className="text-lg font-bold mt-2">{formatDate(clientData.stats.nextBilling)}</p>
            </div>
            <Calendar className="w-8 h-8 text-purple-200" />
          </div>
        </div>
      </div>

      {/* Plugin Slot: Client Dashboard Widgets */}
      <PluginSlot 
        slotId="client.dashboard.widgets" 
        props={{ user, isDemoMode, clientData }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
      />

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-50 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Recent Invoices</h3>
            <button 
              onClick={() => onTabChange('invoices')}
              className="text-sm text-purple-600 hover:text-purple-800 font-medium"
            >
              View All
            </button>
          </div>
          
          {clientData.invoices.length > 0 ? (
            <div className="space-y-3">
              {clientData.invoices.slice(0, 3).map((invoice) => {
                const StatusIcon = getStatusIcon(invoice.status);
                return (
                  <div 
                    key={invoice.id} 
                    className="flex items-center justify-between p-3 bg-white rounded-lg cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => onViewInvoice(invoice)}
                  >
                    <div className="flex items-center space-x-3">
                      <StatusIcon className={getStatusColor(invoice.status)} />
                      <div>
                        <p className="font-medium text-gray-900">{invoice.invoice_number}</p>
                        <p className="text-sm text-gray-500">{formatDate(invoice.created_at)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900">{formatCurrency(invoice.total)}</p>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        invoice.status === 'PAID' ? 'bg-green-100 text-green-800' : 
                        invoice.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' : 
                        'bg-red-100 text-red-800'
                      }`}>
                        {invoice.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 bg-white rounded-lg">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No invoices found</p>
            </div>
          )}
        </div>

        <div className="bg-gray-50 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Active Subscriptions</h3>
            <button 
              onClick={() => onTabChange('subscriptions')}
              className="text-sm text-purple-600 hover:text-purple-800 font-medium"
            >
              View All
            </button>
          </div>
          
          {clientData.subscriptions.length > 0 ? (
            <div className="space-y-3">
              {clientData.subscriptions.map((subscription) => (
                <div 
                  key={subscription.id} 
                  className="flex items-center justify-between p-3 bg-white rounded-lg cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => onViewSubscription(subscription)}
                >
                  <div className="flex items-center space-x-3">
                    <Package className="w-5 h-5 text-blue-500" />
                    <div>
                      <p className="font-medium text-gray-900">{subscription.plan.name}</p>
                      <p className="text-sm text-gray-500">
                        Next billing: {formatDate(subscription.next_billing_date)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">
                      {formatCurrency(subscription.plan.price)}/{subscription.plan.interval.toLowerCase()}
                    </p>
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {subscription.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 bg-white rounded-lg">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No active subscriptions</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}