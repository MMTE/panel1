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

export function AdminBilling() {
  const { user, isDemoMode } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'gateways'>('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedGateway, setSelectedGateway] = useState('all');

  // Mock billing data for demo
  const billingStats = {
    totalRevenue: 125430.50,
    monthlyRevenue: 18750.25,
    pendingAmount: 3420.00,
    refundedAmount: 890.50,
    transactionCount: 1247,
    successRate: 98.2
  };

  const recentTransactions = [
    {
      id: 'txn_001',
      type: 'payment',
      amount: 99.99,
      currency: 'USD',
      status: 'completed',
      gateway: 'stripe',
      customer: 'Acme Corp',
      invoice: 'INV-001',
      created_at: '2024-01-21T10:30:00Z',
      gateway_id: 'pi_1234567890'
    },
    {
      id: 'txn_002',
      type: 'refund',
      amount: -29.99,
      currency: 'USD',
      status: 'completed',
      gateway: 'stripe',
      customer: 'Tech Startup Inc',
      invoice: 'INV-002',
      created_at: '2024-01-21T09:15:00Z',
      gateway_id: 're_1234567890'
    },
    {
      id: 'txn_003',
      type: 'payment',
      amount: 199.99,
      currency: 'USD',
      status: 'failed',
      gateway: 'paypal',
      customer: 'Global Solutions Ltd',
      invoice: 'INV-003',
      created_at: '2024-01-21T08:45:00Z',
      gateway_id: 'PAYID-1234567890',
      error_message: 'Insufficient funds'
    },
    {
      id: 'txn_004',
      type: 'payment',
      amount: 49.99,
      currency: 'USD',
      status: 'pending',
      gateway: 'stripe',
      customer: 'Small Business LLC',
      invoice: 'INV-004',
      created_at: '2024-01-21T08:00:00Z',
      gateway_id: 'pi_0987654321'
    }
  ];

  const paymentGateways = [
    {
      id: 'stripe',
      name: 'Stripe',
      status: 'active',
      transactions: 1156,
      revenue: 115430.50,
      successRate: 98.5,
      lastTransaction: '2024-01-21T10:30:00Z'
    },
    {
      id: 'paypal',
      name: 'PayPal',
      status: 'active',
      transactions: 91,
      revenue: 10000.00,
      successRate: 96.8,
      lastTransaction: '2024-01-21T08:45:00Z'
    },
    {
      id: 'manual',
      name: 'Manual Payment',
      status: 'active',
      transactions: 0,
      revenue: 0,
      successRate: 100,
      lastTransaction: null
    }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'refunded':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return CheckCircle;
      case 'pending':
        return Clock;
      case 'failed':
        return XCircle;
      case 'refunded':
        return RefreshCw;
      default:
        return AlertCircle;
    }
  };

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
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredTransactions = recentTransactions.filter(transaction => {
    const matchesSearch = 
      transaction.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transaction.invoice.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transaction.gateway_id.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = selectedStatus === 'all' || transaction.status === selectedStatus;
    const matchesGateway = selectedGateway === 'all' || transaction.gateway === selectedGateway;
    
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
            props={{ user, isDemoMode, stats: billingStats }}
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
              {/* Revenue Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-green-100">Total Revenue</p>
                      <p className="text-3xl font-bold mt-2">{formatCurrency(billingStats.totalRevenue)}</p>
                    </div>
                    <DollarSign className="w-8 h-8 text-green-200" />
                  </div>
                </div>

                <div className="bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-blue-100">Monthly Revenue</p>
                      <p className="text-3xl font-bold mt-2">{formatCurrency(billingStats.monthlyRevenue)}</p>
                    </div>
                    <Calendar className="w-8 h-8 text-blue-200" />
                  </div>
                </div>

                <div className="bg-gradient-to-r from-yellow-500 to-orange-500 rounded-xl p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-yellow-100">Pending Amount</p>
                      <p className="text-3xl font-bold mt-2">{formatCurrency(billingStats.pendingAmount)}</p>
                    </div>
                    <Clock className="w-8 h-8 text-yellow-200" />
                  </div>
                </div>

                <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl p-6 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-purple-100">Success Rate</p>
                      <p className="text-3xl font-bold mt-2">{billingStats.successRate}%</p>
                    </div>
                    <TrendingUp className="w-8 h-8 text-purple-200" />
                  </div>
                </div>
              </div>

              {/* Plugin Slot: Billing Widgets */}
              <PluginSlot 
                slotId="admin.page.billing.widgets" 
                props={{ user, isDemoMode, stats: billingStats }}
                className="grid grid-cols-1 lg:grid-cols-2 gap-6"
              />

              {/* Recent Activity */}
              <div className="bg-gray-50 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Transactions</h3>
                <div className="space-y-3">
                  {recentTransactions.slice(0, 5).map((transaction) => {
                    const StatusIcon = getStatusIcon(transaction.status);
                    return (
                      <div key={transaction.id} className="flex items-center justify-between p-3 bg-white rounded-lg">
                        <div className="flex items-center space-x-3">
                          <StatusIcon className={`w-5 h-5 ${
                            transaction.status === 'completed' ? 'text-green-500' :
                            transaction.status === 'pending' ? 'text-yellow-500' :
                            transaction.status === 'failed' ? 'text-red-500' : 'text-gray-500'
                          }`} />
                          <div>
                            <p className="font-medium text-gray-900">{transaction.customer}</p>
                            <p className="text-sm text-gray-500">{transaction.invoice} • {transaction.gateway}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-medium ${transaction.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {formatCurrency(transaction.amount)}
                          </p>
                          <p className="text-sm text-gray-500">{formatDate(transaction.created_at)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
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
                                <div className="text-sm text-gray-500">{transaction.invoice}</div>
                              </div>
                            </td>
                            <td className="py-4 px-6">
                              <div className="font-medium text-gray-900">{transaction.customer}</div>
                            </td>
                            <td className="py-4 px-6">
                              <div className={`font-medium ${transaction.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {formatCurrency(transaction.amount)}
                              </div>
                            </td>
                            <td className="py-4 px-6">
                              <div className="flex items-center space-x-2">
                                <StatusIcon className={`w-4 h-4 ${
                                  transaction.status === 'completed' ? 'text-green-500' :
                                  transaction.status === 'pending' ? 'text-yellow-500' :
                                  transaction.status === 'failed' ? 'text-red-500' : 'text-gray-500'
                                }`} />
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(transaction.status)}`}>
                                  {transaction.status}
                                </span>
                              </div>
                            </td>
                            <td className="py-4 px-6">
                              <div className="text-gray-900 capitalize">{transaction.gateway}</div>
                            </td>
                            <td className="py-4 px-6">
                              <div className="text-gray-900">{formatDate(transaction.created_at)}</div>
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
                      <h3 className="text-lg font-semibold text-gray-900">{gateway.name}</h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        gateway.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {gateway.status}
                      </span>
                    </div>

                    <div className="space-y-3 mb-4">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Transactions</span>
                        <span className="font-medium">{gateway.transactions.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Revenue</span>
                        <span className="font-medium">{formatCurrency(gateway.revenue)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Success Rate</span>
                        <span className="font-medium">{gateway.successRate}%</span>
                      </div>
                      {gateway.lastTransaction && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Last Transaction</span>
                          <span className="font-medium text-sm">{formatDate(gateway.lastTransaction)}</span>
                        </div>
                      )}
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
        props={{ user, isDemoMode, activeTab, stats: billingStats }}
        className="space-y-6"
      />
    </div>
  );
}