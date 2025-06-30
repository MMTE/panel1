import React, { useState } from 'react';
import { 
  CreditCard, 
  Search, 
  Filter,
  Plus,
  Loader2,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Eye,
  Settings,
  DollarSign,
  TrendingUp,
  Shield,
  Zap,
  Globe
} from 'lucide-react';
import { PluginSlot } from '../../lib/plugins';
import { useAuth } from '../../hooks/useAuth';
import { trpc } from '../../api/trpc';
import { Can, usePermissions } from '../../hooks/usePermissions';

interface PaymentGateway {
  id: string;
  name: string;
  type: 'STRIPE' | 'PAYPAL' | 'SQUARE' | 'CUSTOM';
  status: 'ACTIVE' | 'INACTIVE' | 'TESTING' | 'ERROR';
  isDefault: boolean;
  stats: {
    totalTransactions: number;
    totalRevenue: number;
    successRate: number;
  };
  health: {
    status: 'HEALTHY' | 'WARNING' | 'ERROR';
    lastCheck: string;
  };
}

export function AdminPaymentGateways() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [activeTab, setActiveTab] = useState<'gateways' | 'transactions'>('gateways');

  // Real tRPC calls for payment gateway data
  const { data: gatewaysData, isLoading: gatewaysLoading, refetch: refetchGateways } = trpc.paymentGateways.getAll.useQuery({
    search: searchTerm || undefined,
    status: selectedStatus !== 'all' ? selectedStatus : undefined,
  }, {
    enabled: !!user,
  });

  // Fetch payment gateway statistics
  const { data: gatewayStats, isLoading: statsLoading, refetch: refetchStats } = trpc.paymentGateways.getStats.useQuery(
    undefined,
    { enabled: !!user }
  );

  const gateways = gatewaysData?.gateways || [];
  const stats = gatewayStats || [];

  // Convert gateway stats to display format
  const displayGateways = stats.map(stat => ({
    id: stat.gatewayName,
    name: stat.displayName,
    type: stat.gatewayName.toUpperCase() as 'STRIPE' | 'PAYPAL' | 'SQUARE' | 'CUSTOM',
    status: stat.status as 'ACTIVE' | 'INACTIVE' | 'TESTING' | 'ERROR',
    isDefault: false, // TODO: Add default gateway logic
    stats: {
      totalTransactions: stat.totalPayments,
      totalRevenue: stat.totalAmount,
      successRate: stat.successRate,
    },
    health: {
      status: stat.healthCheckStatus === 'healthy' ? 'HEALTHY' : 
              stat.healthCheckStatus === 'warning' ? 'WARNING' : 'ERROR',
      lastCheck: stat.lastHealthCheck?.toISOString() || new Date().toISOString(),
    },
  }));

  // Mock data for demonstration when no real data available
  const mockGateways: PaymentGateway[] = [
    {
      id: '1',
      name: 'Stripe',
      type: 'STRIPE',
      status: 'ACTIVE',
      isDefault: true,
      stats: {
        totalTransactions: 1247,
        totalRevenue: 125430.50,
        successRate: 98.5,
      },
      health: {
        status: 'HEALTHY',
        lastCheck: new Date().toISOString(),
      },
    },
    {
      id: '2',
      name: 'PayPal',
      type: 'PAYPAL',
      status: 'ACTIVE',
      isDefault: false,
      stats: {
        totalTransactions: 89,
        totalRevenue: 15420.00,
        successRate: 96.8,
      },
      health: {
        status: 'HEALTHY',
        lastCheck: new Date(Date.now() - 300000).toISOString(),
      },
    },
  ];

  const finalGateways = displayGateways.length > 0 ? displayGateways : mockGateways;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-800';
      case 'INACTIVE':
        return 'bg-gray-100 text-gray-800';
      case 'TESTING':
        return 'bg-yellow-100 text-yellow-800';
      case 'ERROR':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'HEALTHY':
        return 'bg-green-100 text-green-800';
      case 'WARNING':
        return 'bg-yellow-100 text-yellow-800';
      case 'ERROR':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getGatewayIcon = (type: string) => {
    switch (type) {
      case 'STRIPE':
        return <CreditCard className="w-4 h-4" />;
      case 'PAYPAL':
        return <Globe className="w-4 h-4" />;
      case 'SQUARE':
        return <Zap className="w-4 h-4" />;
      default:
        return <CreditCard className="w-4 h-4" />;
    }
  };

  if (gatewaysLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
        <span className="ml-2 text-gray-600">Loading payment gateways...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Payment Gateways</h1>
          <p className="text-gray-600 mt-1">
            Manage payment gateways and monitor transactions
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              refetchGateways();
              refetchStats();
            }}
            className="px-3 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
          
          <Can permission="payment.manage_gateways">
          <button 
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Gateway</span>
          </button>
          </Can>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
          <div className="flex flex-col sm:flex-row sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search gateways..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent w-full sm:w-64"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="TESTING">Testing</option>
                <option value="ERROR">Error</option>
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <CreditCard className="w-4 h-4" />
            <span>{finalGateways.length} gateways</span>
          </div>
        </div>
      </div>

      {/* Gateways Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {finalGateways.map((gateway) => (
          <div key={gateway.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
                  {getGatewayIcon(gateway.type)}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{gateway.name}</h3>
                  <p className="text-sm text-gray-500">{gateway.type}</p>
                </div>
              </div>
              <div className="flex items-center space-x-1">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(gateway.status)}`}>
                  {gateway.status}
                </span>
                {gateway.isDefault && (
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                    Default
                  </span>
                )}
              </div>
            </div>

            {/* Gateway Stats */}
            <div className="space-y-3 mb-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Total Revenue</span>
                <span className="font-medium text-green-600">
                  {formatCurrency(gateway.stats.totalRevenue)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Success Rate</span>
                <span className="font-medium text-blue-600">
                  {gateway.stats.successRate}%
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Transactions</span>
                <span className="font-medium text-gray-900">
                  {gateway.stats.totalTransactions.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Health Status */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-600">Health Status</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getHealthColor(gateway.health.status)}`}>
                  {gateway.health.status}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center space-x-2">
              <button className="flex-1 flex items-center justify-center px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm">
                <Eye className="w-3 h-3 mr-1" />
                View Details
              </button>
              <button className="flex-1 flex items-center justify-center px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm">
                <Settings className="w-3 h-3 mr-1" />
                Configure
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {finalGateways.length === 0 && !gatewaysLoading && (
        <div className="text-center py-12">
          <CreditCard className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No payment gateways found</h3>
          <p className="text-gray-600 mb-6">
            Get started by adding your first payment gateway.
          </p>
          <button 
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200"
          >
            Add Gateway
          </button>
        </div>
      )}

      {/* Plugin Slots */}
      <PluginSlot 
        slotId="admin.page.paymentGateways.bottom" 
        props={{ user, gateways: finalGateways }}
        className="space-y-6"
      />
    </div>
  );
} 