import React from 'react';
import { 
  Package, 
  Calendar, 
  DollarSign, 
  CheckCircle, 
  Clock, 
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  CreditCard,
  Settings,
  Loader
} from 'lucide-react';
import { ClientSubscription } from '../../hooks/useClientData';

interface SubscriptionDetailsProps {
  subscription: ClientSubscription;
  onClose: () => void;
  onCancel: () => void;
}

export function SubscriptionDetails({ subscription, onClose, onCancel }: SubscriptionDetailsProps) {
  const formatCurrency = (amount: number | string) => {
    const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: subscription.currency || 'USD'
    }).format(numericAmount);
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

  const daysRemaining = () => {
    const endDate = new Date(subscription.current_period_end);
    const today = new Date();
    const diffTime = endDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getProvisioningStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getProvisioningStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'pending':
        return <Loader className="w-4 h-4 text-yellow-500 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Settings className="w-4 h-4 text-gray-500" />;
    }
  };

  const remainingDays = daysRemaining();

  // Calculate total monthly cost
  const totalCost = subscription.components.reduce((total, component) => {
    const quantity = component.quantity || 1;
    const unitPrice = typeof component.unitPrice === 'string' ? parseFloat(component.unitPrice) : component.unitPrice;
    return total + (quantity * unitPrice);
  }, 0);

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden max-w-2xl w-full">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Package className="w-6 h-6 text-purple-500" />
            <h2 className="text-xl font-bold text-gray-900">{subscription.plan.name}</h2>
          </div>
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
              {subscription.status}
            </span>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="mb-8">
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="flex justify-between mb-2">
              <span className="text-gray-600">Total Cost</span>
              <span className="font-medium">
                {formatCurrency(totalCost)}/{getIntervalLabel(subscription.plan.interval)}
              </span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-gray-600">Billing Cycle</span>
              <span className="font-medium">{subscription.plan.interval}</span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-gray-600">Current Period</span>
              <span className="font-medium">
                {formatDate(subscription.current_period_start)} - {formatDate(subscription.current_period_end)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Next Billing Date</span>
              <span className="font-medium">{formatDate(subscription.next_billing_date)}</span>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-500 mb-4">Components</h3>
            <div className="space-y-4">
              {subscription.components.map((component, index) => (
                <div key={index} className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <Package className="w-5 h-5 text-purple-500 mt-1" />
                      <div>
                        <div className="font-medium text-gray-900">{component.name}</div>
                        {component.description && (
                          <div className="text-sm text-gray-500 mt-1">{component.description}</div>
                        )}
                        <div className="flex items-center space-x-2 mt-2">
                          {getProvisioningStatusIcon(component.provisioningStatus)}
                          <span className={`text-xs px-2 py-1 rounded-full ${getProvisioningStatusColor(component.provisioningStatus)}`}>
                            {component.provisioningStatus}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-gray-900">
                        {formatCurrency(component.unitPrice)} × {component.quantity || 1}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        {formatCurrency(parseFloat(component.unitPrice.toString()) * (component.quantity || 1))}/{getIntervalLabel(subscription.plan.interval)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex items-start space-x-3">
            <Clock className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-800 mb-1">Current Period Status</h4>
              <p className="text-blue-700 text-sm">
                You have <span className="font-bold">{remainingDays} days</span> remaining in your current billing period.
                {subscription.status === 'ACTIVE' && ' Your subscription will automatically renew on '}
                {subscription.status === 'ACTIVE' && formatDate(subscription.next_billing_date)}.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:justify-between space-y-3 sm:space-y-0 sm:space-x-3">
          <div className="flex space-x-2">
            <button className="flex items-center space-x-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
              <CreditCard className="w-4 h-4" />
              <span>Update Payment</span>
            </button>
          </div>

          <div className="flex space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
            
            {subscription.status === 'ACTIVE' && (
              <button
                onClick={onCancel}
                className="border border-red-300 text-red-700 px-4 py-2 rounded-lg hover:bg-red-50 transition-colors flex items-center space-x-1"
              >
                <AlertCircle className="w-4 h-4" />
                <span>Cancel</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}