import React, { useState, useEffect } from 'react';
import { 
  Building, 
  Search, 
  Plus, 
  Settings, 
  Users, 
  Globe,
  Shield,
  Edit,
  Trash2,
  MoreHorizontal,
  Calendar,
  Activity
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { tenantManager, type Tenant } from '../../lib/tenant/TenantManager';

export function AdminTenants() {
  const { user, isDemoMode } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadTenants();
  }, []);

  const loadTenants = async () => {
    try {
      setLoading(true);
      // In a real implementation, this would fetch all tenants for super admin
      // For demo, we'll show the current tenant
      const currentTenant = tenantManager.getCurrentTenant();
      if (currentTenant) {
        setTenants([currentTenant]);
      }
    } catch (error) {
      console.error('Error loading tenants:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTenants = tenants.filter(tenant =>
    tenant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tenant.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusColor = (isActive: boolean) => {
    return isActive 
      ? 'bg-green-100 text-green-800' 
      : 'bg-red-100 text-red-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tenant Management</h1>
          <p className="text-gray-600 mt-1">
            Manage multi-tenant instances and configurations
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 flex items-center space-x-2">
            <Plus className="w-4 h-4" />
            <span>Create Tenant</span>
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
          <div className="flex flex-col sm:flex-row sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search tenants..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent w-full sm:w-64"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <Activity className="w-4 h-4" />
            <span>{filteredTenants.length} tenants</span>
          </div>
        </div>
      </div>

      {/* Tenants Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTenants.map((tenant) => (
          <div key={tenant.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                  <Building className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{tenant.name}</h3>
                  <p className="text-sm text-gray-500">/{tenant.slug}</p>
                </div>
              </div>
              <div className="flex items-center space-x-1">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(tenant.is_active)}`}>
                  {tenant.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>

            {/* Tenant Info */}
            <div className="space-y-3 mb-4">
              {tenant.domain && (
                <div className="flex items-center text-sm text-gray-600">
                  <Globe className="w-4 h-4 mr-2" />
                  {tenant.domain}
                </div>
              )}
              
              <div className="flex items-center text-sm text-gray-600">
                <Calendar className="w-4 h-4 mr-2" />
                Created {formatDate(tenant.created_at)}
              </div>

              <div className="flex items-center text-sm text-gray-600">
                <Users className="w-4 h-4 mr-2" />
                {/* In real implementation, show user count */}
                Multiple users
              </div>
            </div>

            {/* Features */}
            <div className="mb-4">
              <div className="flex flex-wrap gap-2">
                {tenant.settings.features?.plugins && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                    Plugins
                  </span>
                )}
                {tenant.settings.features?.multi_currency && (
                  <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                    Multi-Currency
                  </span>
                )}
                {tenant.settings.features?.custom_branding && (
                  <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs">
                    Custom Branding
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center space-x-2">
              <button className="flex-1 flex items-center justify-center px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm">
                <Settings className="w-3 h-3 mr-1" />
                Configure
              </button>
              <button className="flex-1 flex items-center justify-center px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm">
                <Users className="w-3 h-3 mr-1" />
                Users
              </button>
              <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredTenants.length === 0 && !loading && (
        <div className="text-center py-12">
          <Building className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No tenants found</h3>
          <p className="text-gray-500 mb-6">
            {searchTerm ? 'Try adjusting your search criteria' : 'Create your first tenant to get started'}
          </p>
          <button className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200">
            Create Tenant
          </button>
        </div>
      )}

      {/* Demo Notice */}
      {isDemoMode && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-center">
            <Shield className="w-5 h-5 text-orange-600 mr-2" />
            <div>
              <h4 className="text-sm font-medium text-orange-800">Demo Mode</h4>
              <p className="text-sm text-orange-700">
                In production, this would show all tenants you have access to manage. 
                Multi-tenant features include data isolation, custom branding, and feature toggles.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}