import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  Users,
  CreditCard,
  Calendar,
  Download,
  Filter,
  RefreshCw,
  Eye,
  ArrowUpRight,
  ArrowDownRight,
  Activity
} from 'lucide-react';
import { PluginSlot } from '../../lib/plugins';
import { useAuth } from '../../hooks/useAuth';
import { trpc } from '../../api/trpc';

export function AdminAnalytics() {
  const { user } = useAuth();
  const [selectedPeriod, setSelectedPeriod] = useState('30d');
  const [selectedMetric, setSelectedMetric] = useState('revenue');

  // Real tRPC calls for analytics data
  const { data: analyticsData, isLoading: analyticsLoading } = trpc.analytics.getOverview.useQuery({
    period: selectedPeriod,
    metric: selectedMetric,
  }, {
    enabled: !!user,
  });

  const { data: revenueChartData, isLoading: chartLoading } = trpc.analytics.getRevenueChart.useQuery({
    period: selectedPeriod,
  }, {
    enabled: !!user,
  });

  const { data: plansData, isLoading: plansLoading } = trpc.analytics.getTopPlans.useQuery({
    period: selectedPeriod,
  }, {
    enabled: !!user,
  });

  const { data: recentActivityData, isLoading: activityLoading } = trpc.analytics.getRecentActivity.useQuery({
    period: selectedPeriod,
  }, {
    enabled: !!user,
  });

  const { data: segmentsData, isLoading: segmentsLoading } = trpc.analytics.getCustomerSegments.useQuery({
    period: selectedPeriod,
  }, {
    enabled: !!user,
  });

  // Fallback data for loading states
  const overview = analyticsData?.overview || {
    revenue: { current: 0, previous: 0, change: 0, trend: 'up' },
    customers: { current: 0, previous: 0, change: 0, trend: 'up' },
    subscriptions: { current: 0, previous: 0, change: 0, trend: 'up' },
    churnRate: { current: 0, previous: 0, change: 0, trend: 'down' }
  };

  const revenueChart = revenueChartData?.chart || [];
  const topPlans = plansData?.plans || [];

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'subscription':
        return CreditCard;
      case 'payment':
        return DollarSign;
      case 'churn':
        return TrendingDown;
      case 'upgrade':
        return TrendingUp;
      default:
        return Activity;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'subscription':
        return 'text-blue-500';
      case 'payment':
        return 'text-green-500';
      case 'churn':
        return 'text-red-500';
      case 'upgrade':
        return 'text-purple-500';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analytics & Reports</h1>
          <p className="text-gray-600 mt-1">
            Track performance, revenue, and customer insights
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <PluginSlot 
            slotId="admin.page.analytics.header.actions" 
            props={{ user, isDemoMode: false, data: analyticsData }}
            className="flex items-center space-x-2"
          />
          
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="1y">Last year</option>
          </select>
          
          <button className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-2">
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
          
          <button className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 flex items-center space-x-2">
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {Object.entries(overview).map(([key, data]) => {
          const isPositive = data.trend === 'up';
          const TrendIcon = isPositive ? ArrowUpRight : ArrowDownRight;
          
          return (
            <div key={key} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    key === 'revenue' ? 'bg-gradient-to-r from-green-500 to-emerald-500' :
                    key === 'customers' ? 'bg-gradient-to-r from-blue-500 to-cyan-500' :
                    key === 'subscriptions' ? 'bg-gradient-to-r from-purple-500 to-pink-500' :
                    'bg-gradient-to-r from-orange-500 to-red-500'
                  }`}>
                    {key === 'revenue' && <DollarSign className="w-5 h-5 text-white" />}
                    {key === 'customers' && <Users className="w-5 h-5 text-white" />}
                    {key === 'subscriptions' && <CreditCard className="w-5 h-5 text-white" />}
                    {key === 'churnRate' && <TrendingDown className="w-5 h-5 text-white" />}
                  </div>
                  <h3 className="font-medium text-gray-900 capitalize">
                    {key === 'churnRate' ? 'Churn Rate' : key}
                  </h3>
                </div>
                <TrendIcon className={`w-5 h-5 ${isPositive ? 'text-green-500' : 'text-red-500'}`} />
              </div>
              
              <div className="space-y-2">
                <div className="text-3xl font-bold text-gray-900">
                  {key === 'revenue' ? formatCurrency(data.current) :
                   key === 'churnRate' ? `${data.current}%` :
                   data.current.toLocaleString()}
                </div>
                <div className={`text-sm flex items-center space-x-1 ${
                  isPositive ? 'text-green-600' : 'text-red-600'
                }`}>
                  <span>{formatPercentage(data.change)}</span>
                  <span className="text-gray-500">vs last period</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts and Analytics Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Revenue Trend</h3>
            <select
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="revenue">Revenue</option>
              <option value="customers">Customers</option>
              <option value="subscriptions">Subscriptions</option>
            </select>
          </div>
          
          {/* Simplified Chart Visualization */}
          <div className="h-64 flex items-end space-x-2">
            {revenueChart.map((item, index) => {
              const value = selectedMetric === 'revenue' ? item.revenue : item.customers;
              const maxValue = Math.max(...revenueChart.map(i => 
                selectedMetric === 'revenue' ? i.revenue : i.customers
              ));
              const height = (value / maxValue) * 100;
              
              return (
                <div key={index} className="flex-1 flex flex-col items-center">
                  <div 
                    className="w-full bg-gradient-to-t from-purple-500 to-pink-500 rounded-t-sm transition-all duration-300 hover:from-purple-600 hover:to-pink-600"
                    style={{ height: `${height}%` }}
                    title={`${selectedMetric === 'revenue' ? formatCurrency(value) : value}`}
                  ></div>
                  <div className="text-xs text-gray-500 mt-2">
                    {new Date(item.date).getDate()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Recent Activity</h3>
          <div className="space-y-4">
            {activityLoading ? (
              <div className="text-gray-500 text-sm">Loading activity data...</div>
            ) : recentActivityData?.recentActivity?.length ? (
              recentActivityData.recentActivity.map((activity, index) => {
                const ActivityIcon = getActivityIcon(activity.type);
                const colorClass = getActivityColor(activity.type);
                
                return (
                  <div key={index} className="flex items-start space-x-3">
                    <div className={`w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center ${colorClass}`}>
                      <ActivityIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">{activity.description}</p>
                      <p className="text-sm text-gray-500">{activity.customer}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className={`text-sm font-medium ${
                          activity.amount > 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {formatCurrency(Math.abs(activity.amount))}
                        </span>
                        <span className="text-xs text-gray-400">{new Date(activity.time).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-gray-500 text-sm">No recent activity to display</div>
            )}
          </div>
        </div>
      </div>

      {/* Plugin Slot: Analytics Widgets */}
      <PluginSlot 
        slotId="admin.page.analytics.widgets" 
        props={{ user, isDemoMode: false, data: analyticsData, selectedPeriod }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
      />

      {/* Detailed Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Plans */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Top Performing Plans</h3>
          <div className="space-y-4">
            {plansLoading ? (
              <div className="text-gray-500 text-sm">Loading plans data...</div>
            ) : plansData?.plans?.length ? (
              plansData.plans.map((plan, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center text-white text-sm font-bold">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{plan.name}</p>
                      <p className="text-sm text-gray-500">{plan.subscribers} subscribers</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">{formatCurrency(plan.revenue)}</p>
                    <p className="text-sm text-green-600">{formatPercentage(plan.growth || 0)}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-gray-500 text-sm">No plans data available</div>
            )}
          </div>
        </div>

        {/* Customer Segments */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-6">Customer Segments</h3>
          <div className="space-y-4">
            {segmentsLoading ? (
              <div className="text-gray-500 text-sm">Loading segments data...</div>
            ) : segmentsData?.customerSegments?.length ? (
              segmentsData.customerSegments.map((segment, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">{segment.segment}</span>
                    <span className="text-sm text-gray-500">{segment.percentage}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${segment.percentage}%` }}
                    ></div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{segment.count} customers</span>
                    <span>{formatCurrency(segment.revenue)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-gray-500 text-sm">No customer segments data available</div>
            )}
          </div>
        </div>
      </div>

      {/* Plugin Slot: Page Bottom */}
      <PluginSlot 
        slotId="admin.page.analytics.bottom" 
        props={{ user, isDemoMode: false, data: analyticsData, selectedPeriod, selectedMetric }}
        className="space-y-6"
      />
    </div>
  );
}