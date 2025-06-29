import React, { useState } from 'react';
import { 
  Users, 
  CreditCard, 
  FileText, 
  TrendingUp,
  DollarSign,
  Activity,
  Clock,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { PluginSlot } from '../../lib/plugins';
import { useAuth } from '../../hooks/useAuth';
import { trpc } from '../../api/trpc';
import { CreateClientModal } from '../../components/admin/CreateClientModal';
import { CreateInvoiceModal } from '../../components/admin/CreateInvoiceModal';
import { useNavigate } from 'react-router-dom';

export function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Modal states
  const [isCreateClientModalOpen, setIsCreateClientModalOpen] = useState(false);
  const [isCreateInvoiceModalOpen, setIsCreateInvoiceModalOpen] = useState(false);

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = trpc.dashboard.getStats.useQuery();
  const { data: recentActivity, isLoading: activityLoading, refetch: refetchActivity } = trpc.dashboard.getRecentActivity.useQuery();

  // Handle successful operations
  const handleClientCreated = () => {
    refetchStats();
    refetchActivity();
  };

  const handleInvoiceCreated = () => {
    refetchStats();
    refetchActivity();
  };

  // Quick action handlers
  const handleAddNewUser = () => {
    setIsCreateClientModalOpen(true);
  };

  const handleCreateInvoice = () => {
    setIsCreateInvoiceModalOpen(true);
  };

  const handleViewBilling = () => {
    navigate('/admin/billing');
  };

  const handleViewAnalytics = () => {
    navigate('/admin/analytics');
  };

  const handleViewAllActivity = () => {
    navigate('/admin/audit');
  };

  const dashboardStats = [
    {
      name: 'Total Users',
      value: stats?.totalUsers?.toString() || '0',
      change: '+12%',
      changeType: 'positive',
      icon: Users,
      color: 'from-blue-500 to-cyan-500'
    },
    {
      name: 'Monthly Revenue',
      value: `$${stats?.monthlyRevenue?.toLocaleString() || '0'}`,
      change: '+8%',
      changeType: 'positive',
      icon: DollarSign,
      color: 'from-green-500 to-emerald-500'
    },
    {
      name: 'Active Subscriptions',
      value: stats?.activeSubscriptions?.toString() || '0',
      change: '+5%',
      changeType: 'positive',
      icon: CreditCard,
      color: 'from-purple-500 to-pink-500'
    },
    {
      name: 'Total Invoices',
      value: stats?.totalInvoices?.toString() || '0',
      change: '-3%',
      changeType: 'negative',
      icon: FileText,
      color: 'from-orange-500 to-red-500'
    }
  ];

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
        <span className="ml-2 text-gray-600">Loading dashboard...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Welcome back, {user?.firstName || 'Admin'}! Here's what's happening with your platform.
          </p>
        </div>

        <PluginSlot 
          slotId="admin.dashboard.header.actions" 
          props={{ user }}
          className="flex items-center space-x-2"
        />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {dashboardStats.map((stat, index) => (
          <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stat.value}</p>
                <div className="flex items-center mt-2">
                  <span className={`text-sm font-medium ${
                    stat.changeType === 'positive' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {stat.change}
                  </span>
                  <span className="text-sm text-gray-500 ml-1">from last month</span>
                </div>
              </div>
              <div className={`w-12 h-12 bg-gradient-to-r ${stat.color} rounded-lg flex items-center justify-center`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Dashboard Widgets Slot */}
      <PluginSlot 
        slotId="admin.dashboard.widgets" 
        props={{ user, stats }}
        className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6"
      />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
              <button 
                onClick={handleViewAllActivity}
                className="text-sm text-purple-600 hover:text-purple-700 font-medium"
              >
                View all
              </button>
            </div>
          </div>
          <div className="p-6">
            {activityLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-purple-600 mr-2" />
                <span className="text-gray-600">Loading activity...</span>
              </div>
            ) : recentActivity && recentActivity.length > 0 ? (
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start space-x-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-blue-600">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">{activity.message}</p>
                      <div className="flex items-center mt-1">
                        <Clock className="w-3 h-3 text-gray-400 mr-1" />
                        <span className="text-xs text-gray-500">{activity.time}</span>
                        {activity.amount && (
                          <span className="text-xs text-gray-500 ml-2">• {activity.amount}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Activity className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No recent activity</h3>
                <p className="text-gray-600">Activity will appear here as your system is used.</p>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              <button 
                onClick={handleAddNewUser}
                className="w-full flex items-center justify-center px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200"
              >
                <Users className="w-4 h-4 mr-2" />
                Add New User
              </button>
              <button 
                onClick={handleCreateInvoice}
                className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <FileText className="w-4 h-4 mr-2" />
                Create Invoice
              </button>
              <button 
                onClick={handleViewBilling}
                className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <CreditCard className="w-4 h-4 mr-2" />
                View Billing
              </button>
              <button 
                onClick={handleViewAnalytics}
                className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                Analytics
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Additional Dashboard Sections */}
      <PluginSlot 
        slotId="admin.dashboard.bottom" 
        props={{ user, stats, recentActivity }}
        className="space-y-6"
      />

      {/* Modals */}
      <CreateClientModal
        isOpen={isCreateClientModalOpen}
        onClose={() => setIsCreateClientModalOpen(false)}
        onSuccess={handleClientCreated}
      />

      <CreateInvoiceModal
        isOpen={isCreateInvoiceModalOpen}
        onClose={() => setIsCreateInvoiceModalOpen(false)}
        onSuccess={handleInvoiceCreated}
      />
    </div>
  );
}