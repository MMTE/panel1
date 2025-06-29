import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  Search, 
  Filter, 
  Plus, 
  TrendingUp,
  DollarSign,
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Download,
  Eye,
  Settings
} from 'lucide-react';
import { PluginSlot } from '../../lib/plugins';
import { useAuth } from '../../hooks/useAuth';
import { trpc } from '../../api/trpc';

export function AdminBilling() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'gateways'>('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedGateway, setSelectedGateway] = useState('all');
  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | '1y'>('30d');

  // Real tRPC data queries
  const { data: dashboardStats, isLoading: statsLoading } = trpc.dashboard.getStats.useQuery();
  const { data: transactionStats, isLoading: transactionStatsLoading } = trpc.analytics.getTransactionStats.useQuery({ period });
  const { data: recentTransactionsData, isLoading: transactionsLoading } = trpc.paymentGateways.getTransactions.useQuery({
    page: 1,
    limit: 10,
    status: selectedStatus !== 'all' ? selectedStatus as any : undefined,
    gatewayId: selectedGateway !== 'all' ? selectedGateway : undefined,
  });
  const { data: gatewaysData, isLoading: gatewaysLoading } = trpc.paymentGateways.getAll.useQuery({});

  // Extract data with fallbacks
  const recentTransactions = recentTransactionsData?.transactions || [];
  const paymentGateways = gatewaysData || [];

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'success':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
      case 'error':
        return 'bg-red-100 text-red-800';
      case 'refunded':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'success':
        return CheckCircle;
      case 'pending':
        return Clock;
      case 'failed':
      case 'error':
        return XCircle;
      case 'refunded':
        return RefreshCw;
      default:
        return AlertCircle;
    }
  };

  const formatCurrency = (amount: number, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredTransactions = recentTransactions.filter(transaction => {
    const matchesSearch = 
      transaction.customerEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transaction.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transaction.gatewayId?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = selectedStatus === 'all' || transaction.status.toLowerCase() === selectedStatus.toLowerCase();
    const matchesGateway = selectedGateway === 'all' || transaction.gatewayId === selectedGateway;
    
    return matchesSearch && matchesStatus && matchesGateway;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Billing & Payments</h1>
          <p className="text-gray-600 mt-1">
            Monitor transactions, manage payment gateways, and track revenue
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <PluginSlot 
            slotId="admin.page.billing.header.actions" 
            props={{ user, stats: dashboardStats }}
            className="flex items-center space-x-2"
          />
          
          <button className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 flex items-center space-x-2">
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'overview', name: 'Overview', icon: TrendingUp },
              { id: 'transactions', name: 'Transactions', icon: CreditCard },
              { id: 'gateways', name: 'Payment Gateways', icon: Settings }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center space-x-2 ${
                  activeTab === tab.id
                    ? 'border-purple-500 text-purple-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span>{tab.name}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Period Selector */}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Overview</h3>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as any)}
                  className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                  <option value="1y">Last year</option>
                </select>
              </div>

              {/* Revenue Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-green-100">Total Revenue</p>
                      {transactionStatsLoading ? (
                        <div className="animate-pulse bg-green-400 h-8 w-24 rounded mt-2"></div>
                      ) : (
                        <p className="text-3xl font-bold mt-2">{formatCurrency(transactionStats?.totalRevenue || 0)}</p>
                      )}
                    </div>
                    <DollarSign className="w-8 h-8 text-green-200" />
                  </div>
                </div>

                <div className="bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-blue-100">Avg Transaction</p>
                      {transactionStatsLoading ? (
                        <div className="animate-pulse bg-blue-400 h-8 w-24 rounded mt-2"></div>
                      ) : (
                        <p className="text-3xl font-bold mt-2">{formatCurrency(transactionStats?.averageTransaction || 0)}</p>
                      )}
                    </div>
                    <Calendar className="w-8 h-8 text-blue-200" />
                  </div>
                </div>

                <div className="bg-gradient-to-r from-yellow-500 to-orange-500 rounded-xl p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-yellow-100">Pending Transactions</p>
                      {transactionStatsLoading ? (
                        <div className="animate-pulse bg-yellow-400 h-8 w-16 rounded mt-2"></div>
                      ) : (
                        <p className="text-3xl font-bold mt-2">{transactionStats?.pendingTransactions || 0}</p>
                      )}
                    </div>
                    <Clock className="w-8 h-8 text-yellow-200" />
                  </div>
                </div>

                <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-purple-100">Success Rate</p>
                      {transactionStatsLoading ? (
                        <div className="animate-pulse bg-purple-400 h-8 w-16 rounded mt-2"></div>
                      ) : (
                        <p className="text-3xl font-bold mt-2">{transactionStats?.successRate || 0}%</p>
                      )}
                    </div>
                    <TrendingUp className="w-8 h-8 text-purple-200" />
                  </div>
                </div>
              </div>

              {/* Transaction Stats */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Transaction Statistics</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {transactionStatsLoading ? '...' : transactionStats?.completedTransactions || 0}
                    </div>
                    <div className="text-sm text-gray-600">Completed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">
                      {transactionStatsLoading ? '...' : transactionStats?.failedTransactions || 0}
                    </div>
                    <div className="text-sm text-gray-600">Failed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-600">
                      {transactionStatsLoading ? '...' : transactionStats?.totalTransactions || 0}
                    </div>
                    <div className="text-sm text-gray-600">Total</div>
                  </div>
                </div>
              </div>

              {/* Plugin Slot: Billing Widgets */}
              <PluginSlot 
                slotId="admin.page.billing.widgets" 
                props={{ user, stats: transactionStats }}
                className="grid grid-cols-1 lg:grid-cols-2 gap-6"
              />

              {/* Recent Activity */}
              <div className="bg-gray-50 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Transactions</h3>
                {transactionsLoading ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="animate-pulse flex items-center justify-between p-3 bg-white rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div className="w-5 h-5 bg-gray-300 rounded"></div>
                          <div>
                            <div className="h-4 bg-gray-300 rounded w-32 mb-1"></div>
                            <div className="h-3 bg-gray-300 rounded w-24"></div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="h-4 bg-gray-300 rounded w-16 mb-1"></div>
                          <div className="h-3 bg-gray-300 rounded w-20"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentTransactions.slice(0, 5).map((transaction) => {
                      const StatusIcon = getStatusIcon(transaction.status);
                      return (
                        <div key={transaction.id} className="flex items-center justify-between p-3 bg-white rounded-lg">
                          <div className="flex items-center space-x-3">
                            <StatusIcon className={`w-5 h-5 ${
                              transaction.status.toLowerCase() === 'completed' ? 'text-green-500' :
                              transaction.status.toLowerCase() === 'pending' ? 'text-yellow-500' :
                              transaction.status.toLowerCase() === 'failed' ? 'text-red-500' : 'text-gray-500'
                            }`} />
                            <div>
                              <p className="font-medium text-gray-900">{transaction.customerEmail || 'Unknown Customer'}</p>
                              <p className="text-sm text-gray-500">{transaction.description || transaction.gatewayId}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`font-medium ${transaction.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {formatCurrency(transaction.amount, transaction.currency)}
                            </p>
                            <p className="text-sm text-gray-500">{formatDate(transaction.createdAt)}</p>
                          </div>
                        </div>
                      );
                    })}
                    {recentTransactions.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <CreditCard className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                        <p>No recent transactions found</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'transactions' && (
            <div className="space-y-6">
              {/* Filters */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
                <div className="flex flex-col sm:flex-row sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search transactions..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent w-full sm:w-64"
                    />
                  </div>

                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="all">All Status</option>
                    <option value="completed">Completed</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                    <option value="refunded">Refunded</option>
                  </select>

                  <select
                    value={selectedGateway}
                    onChange={(e) => setSelectedGateway(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="all">All Gateways</option>
                    <option value="stripe">Stripe</option>
                    <option value="paypal">PayPal</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left py-3 px-6 font-medium text-gray-900">Transaction</th>
                        <th className="text-left py-3 px-6 font-medium text-gray-900">Customer</th>
                        <th className="text-left py-3 px-6 font-medium text-gray-900">Amount</th>
                        <th className="text-left py-3 px-6 font-medium text-gray-900">Status</th>
                        <th className="text-left py-3 px-6 font-medium text-gray-900">Gateway</th>
                        <th className="text-left py-3 px-6 font-medium text-gray-900">Date</th>
                        <th className="text-right py-3 px-6 font-medium text-gray-900">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filteredTransactions.map((transaction) => {
                        const StatusIcon = getStatusIcon(transaction.status);
                        return (
                          <tr key={transaction.id} className="hover:bg-gray-50 transition-colors">
                            <td className="py-4 px-6">
                              <div>
                                <div className="font-medium text-gray-900">{transaction.id}</div>
                                <div className="text-sm text-gray-500">{transaction.description || transaction.gatewayId}</div>
                              </div>
                            </td>
                            <td className="py-4 px-6">
                              <div className="font-medium text-gray-900">{transaction.customerEmail || 'Unknown Customer'}</div>
                            </td>
                            <td className="py-4 px-6">
                              <div className={`font-medium ${transaction.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {formatCurrency(transaction.amount, transaction.currency)}
                              </div>
                            </td>
                            <td className="py-4 px-6">
                              <div className="flex items-center space-x-2">
                                <StatusIcon className={`w-4 h-4 ${
                                  transaction.status.toLowerCase() === 'completed' ? 'text-green-500' :
                                  transaction.status.toLowerCase() === 'pending' ? 'text-yellow-500' :
                                  transaction.status.toLowerCase() === 'failed' ? 'text-red-500' : 'text-gray-500'
                                }`} />
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(transaction.status)}`}>
                                  {transaction.status}
                                </span>
                              </div>
                            </td>
                            <td className="py-4 px-6">
                              <div className="text-gray-900 capitalize">{transaction.gatewayName || transaction.gatewayId}</div>
                            </td>
                            <td className="py-4 px-6">
                              <div className="text-gray-900">{formatDate(transaction.createdAt)}</div>
                            </td>
                            <td className="py-4 px-6">
                              <div className="flex items-center justify-end space-x-2">
                                <button className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
                                  <Eye className="w-4 h-4 text-gray-600" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'gateways' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {paymentGateways.map((gateway) => (
                  <div key={gateway.id} className="bg-white rounded-xl border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">{gateway.displayName || gateway.gatewayName}</h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        gateway.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 
                        gateway.status === 'INACTIVE' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {gateway.status}
                      </span>
                    </div>

                    <div className="space-y-3 mb-4">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Gateway Type</span>
                        <span className="font-medium capitalize">{gateway.gatewayName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Transactions</span>
                        <span className="font-medium">{gateway.stats?.totalTransactions?.toLocaleString() || '0'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Revenue</span>
                        <span className="font-medium">{formatCurrency(gateway.stats?.totalRevenue || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Success Rate</span>
                        <span className="font-medium">{gateway.stats?.successRate || 0}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Health Status</span>
                        <span className={`font-medium ${
                          gateway.health?.status === 'HEALTHY' ? 'text-green-600' :
                          gateway.health?.status === 'UNHEALTHY' ? 'text-red-600' :
                          'text-gray-600'
                        }`}>
                          {gateway.health?.status || 'Unknown'}
                        </span>
                      </div>
                    </div>

                    <button className="w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center space-x-2">
                      <Settings className="w-4 h-4" />
                      <span>Configure</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Plugin Slot: Page Bottom */}
      <PluginSlot 
        slotId="admin.page.billing.bottom" 
        props={{ user, activeTab, stats: transactionStats }}
        className="space-y-6"
      />
    </div>
  );
}