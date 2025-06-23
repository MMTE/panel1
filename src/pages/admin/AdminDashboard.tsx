import React from 'react';
import { 
  Users, 
  CreditCard, 
  FileText, 
  TrendingUp,
  DollarSign,
  Activity,
  Clock,
  AlertCircle
} from 'lucide-react';
import { PluginSlot } from '../../lib/plugins';
import { useAuth } from '../../hooks/useAuth';

export function AdminDashboard() {
  const { user, isDemoMode } = useAuth();

  // Mock data for demo
  const stats = [
    {
      name: 'Total Users',
      value: '2,847',
      change: '+12%',
      changeType: 'positive',
      icon: Users,
      color: 'from-blue-500 to-cyan-500'
    },
    {
      name: 'Monthly Revenue',
      value: '$45,231',
      change: '+8%',
      changeType: 'positive',
      icon: DollarSign,
      color: 'from-green-500 to-emerald-500'
    },
    {
      name: 'Active Subscriptions',
      value: '1,234',
      change: '+5%',
      changeType: 'positive',
      icon: CreditCard,
      color: 'from-purple-500 to-pink-500'
    },
    {
      name: 'Pending Invoices',
      value: '23',
      change: '-3%',
      changeType: 'negative',
      icon: FileText,
      color: 'from-orange-500 to-red-500'
    }
  ];

  const recentActivity = [
    {
      id: 1,
      type: 'payment',
      message: 'Payment received from Acme Corp',
      amount: '$1,250',
      time: '2 minutes ago',
      icon: DollarSign,
      color: 'text-green-600'
    },
    {
      id: 2,
      type: 'user',
      message: 'New user registration: john@example.com',
      time: '15 minutes ago',
      icon: Users,
      color: 'text-blue-600'
    },
    {
      id: 3,
      type: 'invoice',
      message: 'Invoice #INV-001 is overdue',
      time: '1 hour ago',
      icon: AlertCircle,
      color: 'text-red-600'
    },
    {
      id: 4,
      type: 'subscription',
      message: 'Subscription renewed: Pro Plan',
      amount: '$99',
      time: '2 hours ago',
      icon: CreditCard,
      color: 'text-purple-600'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Welcome back, {user?.first_name || 'Admin'}! Here's what's happening with your platform.
          </p>
          {isDemoMode && (
            <div className="mt-2 inline-flex items-center px-3 py-1 rounded-full text-sm bg-orange-100 text-orange-800">
              <Activity className="w-4 h-4 mr-1" />
              Demo data is being displayed
            </div>
          )}
        </div>

        <PluginSlot 
          slotId="admin.dashboard.header.actions" 
          props={{ user, isDemoMode }}
          className="flex items-center space-x-2"
        />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
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
        props={{ user, isDemoMode, stats }}
        className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6"
      />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
              <button className="text-sm text-purple-600 hover:text-purple-700 font-medium">
                View all
              </button>
            </div>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-start space-x-3">
                  <div className={`w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center ${activity.color}`}>
                    <activity.icon className="w-4 h-4" />
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
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              <button className="w-full flex items-center justify-center px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200">
                <Users className="w-4 h-4 mr-2" />
                Add New User
              </button>
              <button className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                <FileText className="w-4 h-4 mr-2" />
                Create Invoice
              </button>
              <button className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                <CreditCard className="w-4 h-4 mr-2" />
                View Billing
              </button>
            </div>

            {/* Plugin Slot for additional quick actions */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <PluginSlot 
                slotId="admin.dashboard.quick.actions" 
                props={{ user, isDemoMode }}
                className="space-y-2"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Dashboard Slot */}
      <PluginSlot 
        slotId="admin.dashboard.bottom" 
        props={{ user, isDemoMode }}
        className="space-y-6"
      />
    </div>
  );
}