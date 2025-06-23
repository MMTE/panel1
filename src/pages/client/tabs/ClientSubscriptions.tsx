import React from 'react';
import { Package, Eye, AlertCircle } from 'lucide-react';
import { ClientSubscription } from '../../../hooks/useClientData';

interface ClientSubscriptionsProps {
  subscriptions: ClientSubscription[];
  onViewSubscription: (subscription: ClientSubscription) => void;
  onCancelSubscription: (subscriptionId: string) => void;
}

export function ClientSubscriptions({ 
  subscriptions, 
  onViewSubscription, 
  onCancelSubscription 
}: ClientSubscriptionsProps) {
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

  const getIntervalLabel = (interval: string) => {
    switch (interval) {
      case 'MONTHLY':
        return 'month';
      case 'YEARLY':
        return 'year';
      case 'WEEKLY':
        return 'week';
      case 'DAILY':
        return 'day';
      default:
        return interval.toLowerCase();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Your Subscriptions</h2>
        <button className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200">
          Browse Plans
        </button>
      </div>

      {subscriptions.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {subscriptions.map((subscription) => (
            <div key={subscription.id} className="bg-white border border-gray-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">{subscription.plan.name}</h3>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  subscription.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 
                  subscription.status === 'CANCELLED' ? 'bg-red-100 text-red-800' : 
                  'bg-gray-100 text-gray-800'
                }`}>
                  {subscription.status}
                </span>
              </div>

              <div className="space-y-3 mb-6">
                <div className="flex justify-between">
                  <span className="text-gray-600">Price</span>
                  <span className="font-medium">
                    {formatCurrency(subscription.plan.price)}/{getIntervalLabel(subscription.plan.interval)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Current Period</span>
                  <span className="font-medium">
                    {formatDate(subscription.current_period_start)} - {formatDate(subscription.current_period_end)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Next Billing</span>
                  <span className="font-medium">{formatDate(subscription.next_billing_date)}</span>
                </div>
              </div>

              <div className="flex space-x-2">
                <button 
                  onClick={() => onViewSubscription(subscription)}
                  className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center space-x-1"
                >
                  <Eye className="w-4 h-4" />
                  <span>Details</span>
                </button>
                {subscription.status === 'ACTIVE' && (
                  <button 
                    onClick={() => onCancelSubscription(subscription.id)}
                    className="flex-1 border border-red-300 text-red-700 px-4 py-2 rounded-lg hover:bg-red-50 transition-colors flex items-center justify-center space-x-1"
                  >
                    <AlertCircle className="w-4 h-4" />
                    <span>Cancel</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Subscriptions</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            You don't have any active subscriptions. Browse our plans to get started with our services.
          </p>
          <button className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200">
            Browse Plans
          </button>
        </div>
      )}
    </div>
  );
}