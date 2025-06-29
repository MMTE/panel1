import React, { useState, useEffect } from 'react';
import { 
  Package, 
  Search, 
  Filter, 
  Plus, 
  Edit,
  Trash2,
  MoreHorizontal,
  DollarSign,
  Calendar,
  Users,
  CheckCircle,
  XCircle,
  Star,
  Copy,
  Eye
} from 'lucide-react';
import { PluginSlot } from '../../lib/plugins';
import { useAuth } from '../../hooks/useAuth';
import { usePlans } from '../../hooks/usePlans';

export function AdminPlans() {
  const { user } = useAuth();
  const { plans, loading: plansLoading, error, refetch } = usePlans();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedInterval, setSelectedInterval] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  // Add loading and error states
  if (plansLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading plans...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Plans</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            onClick={() => refetch()}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency
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

  const filteredPlans = plans.filter(plan => {
    const matchesSearch = 
      plan.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      plan.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesInterval = selectedInterval === 'all' || plan.interval === selectedInterval;
    const matchesStatus = selectedStatus === 'all' || 
      (selectedStatus === 'active' && plan.isActive) ||
      (selectedStatus === 'inactive' && !plan.isActive);
    
    return matchesSearch && matchesInterval && matchesStatus;
  });

  const totalPlans = plans.length;
  const activePlans = plans.filter(p => p.isActive).length;
  const totalSubscribers = 0; // Will be calculated from subscriptions later
  const totalRevenue = 0; // Will be calculated from payments later

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Plans & Pricing</h1>
          <p className="text-gray-600 mt-1">
            Manage your subscription plans and pricing tiers
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <PluginSlot 
            slotId="admin.page.plans.header.actions" 
            props={{ user, plans: filteredPlans }}
            className="flex items-center space-x-2"
          />
          
          <button className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 flex items-center space-x-2">
            <Plus className="w-4 h-4" />
            <span>Create Plan</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Plans</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{totalPlans}</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
              <Package className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Plans</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{activePlans}</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Subscribers</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{totalSubscribers}</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Revenue</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{formatCurrency(totalRevenue)}</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-red-500 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
          <div className="flex flex-col sm:flex-row sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search plans..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent w-full sm:w-64"
              />
            </div>

            {/* Interval Filter */}
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={selectedInterval}
                onChange={(e) => setSelectedInterval(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="all">All Intervals</option>
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
                <option value="WEEKLY">Weekly</option>
                <option value="DAILY">Daily</option>
              </select>
            </div>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <PluginSlot 
            slotId="admin.page.plans.list.actions" 
            props={{ user, plans: filteredPlans, searchTerm, selectedInterval, selectedStatus }}
            className="flex items-center space-x-2"
          />
        </div>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPlans.map((plan) => (
          <div key={plan.id} className={`bg-white rounded-xl shadow-sm border-2 transition-all duration-200 hover:shadow-md ${
            plan.isActive ? 'border-gray-200 hover:border-purple-300' : 'border-gray-100 opacity-75'
          }`}>
            {/* Plan Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                  <p className="text-gray-600 text-sm mt-1">{plan.description}</p>
                </div>
                <div className="flex items-center space-x-2">
                  {plan.isActive ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <XCircle className="w-5 h-5 text-gray-400" />
                  )}
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    plan.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {plan.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>

              {/* Pricing */}
              <div className="flex items-baseline space-x-2">
                <span className="text-3xl font-bold text-gray-900">
                  {formatCurrency(parseFloat(plan.price), plan.currency)}
                </span>
                <span className="text-gray-500">/ {getIntervalLabel(plan.interval)}</span>
              </div>

              {/* Setup Fee & Trial */}
              <div className="flex items-center space-x-4 mt-2 text-sm text-gray-600">
                {parseFloat(plan.setupFee || '0') > 0 && (
                  <span>Setup: {formatCurrency(parseFloat(plan.setupFee || '0'))}</span>
                )}
                {(plan.trialPeriodDays || 0) > 0 && (
                  <span>{plan.trialPeriodDays}-day trial</span>
                )}
              </div>
            </div>

            {/* Features */}
            <div className="p-6 border-b border-gray-200">
              <h4 className="font-medium text-gray-900 mb-3">Features</h4>
              <ul className="space-y-2">
                {plan.features && Object.entries(plan.features).map(([key, value]) => (
                  <li key={key} className="flex items-center text-sm text-gray-600">
                    <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                    {typeof value === 'string' ? value : `${key}: ${value}`}
                  </li>
                ))}
              </ul>
            </div>

            {/* Stats */}
            <div className="p-6 border-b border-gray-200">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">0</div>
                  <div className="text-xs text-gray-500">Subscribers</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">{formatCurrency(0)}</div>
                  <div className="text-xs text-gray-500">Revenue</div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="p-6">
              <div className="flex items-center space-x-2">
                <button className="flex-1 flex items-center justify-center px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm">
                  <Eye className="w-3 h-3 mr-1" />
                  View
                </button>
                <button className="flex-1 flex items-center justify-center px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm">
                  <Edit className="w-3 h-3 mr-1" />
                  Edit
                </button>
                <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors" title="Duplicate">
                  <Copy className="w-4 h-4" />
                </button>
                <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredPlans.length === 0 && (
        <div className="text-center py-12">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No plans found</h3>
          <p className="text-gray-500 mb-6">
            {searchTerm || selectedInterval !== 'all' || selectedStatus !== 'all'
              ? 'Try adjusting your search or filter criteria'
              : 'Create your first plan to get started'
            }
          </p>
          <button className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200">
            Create Plan
          </button>
        </div>
      )}

      {/* Plugin Slot: Page Bottom */}
      <PluginSlot 
        slotId="admin.page.plans.bottom" 
        props={{ user, plans: filteredPlans }}
        className="space-y-6"
      />
    </div>
  );
}