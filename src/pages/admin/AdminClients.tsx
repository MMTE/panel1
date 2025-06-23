import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Search, 
  Filter, 
  Plus, 
  MoreHorizontal,
  Edit,
  Trash2,
  Building,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Activity,
  CreditCard,
  FileText,
  Eye,
  UserCheck,
  UserX
} from 'lucide-react';
import { PluginSlot } from '../../lib/plugins';
import { useAuth } from '../../hooks/useAuth';
// import { supabase } from '../../lib/supabase'; // TODO: Replace with tRPC

export function AdminClients() {
  const { user, isDemoMode } = useAuth();
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Mock client data for demo
  const mockClients = [
    {
      id: '1',
      company_name: 'Acme Corporation',
      user: {
        email: 'john@acme.com',
        first_name: 'John',
        last_name: 'Doe'
      },
      phone: '+1 (555) 123-4567',
      city: 'New York',
      country: 'United States',
      status: 'ACTIVE',
      created_at: '2024-01-15T10:30:00Z',
      _count: {
        invoices: 12,
        subscriptions: 3
      },
      total_revenue: 2450.00
    },
    {
      id: '2',
      company_name: 'Tech Startup Inc',
      user: {
        email: 'jane@techstartup.com',
        first_name: 'Jane',
        last_name: 'Smith'
      },
      phone: '+1 (555) 987-6543',
      city: 'San Francisco',
      country: 'United States',
      status: 'ACTIVE',
      created_at: '2024-01-10T09:15:00Z',
      _count: {
        invoices: 8,
        subscriptions: 2
      },
      total_revenue: 1890.00
    },
    {
      id: '3',
      company_name: 'Global Solutions Ltd',
      user: {
        email: 'mike@globalsolutions.com',
        first_name: 'Mike',
        last_name: 'Johnson'
      },
      phone: '+44 20 7123 4567',
      city: 'London',
      country: 'United Kingdom',
      status: 'INACTIVE',
      created_at: '2024-01-05T14:20:00Z',
      _count: {
        invoices: 5,
        subscriptions: 1
      },
      total_revenue: 750.00
    }
  ];

  useEffect(() => {
    if (isDemoMode) {
      setClients(mockClients);
      setLoading(false);
    } else {
      fetchClients();
    }
  }, [isDemoMode]);

  const fetchClients = async () => {
    try {
      setLoading(true);
      // TODO: Replace with tRPC call
      console.log('TODO: Fetch clients from tRPC');
      setClients([]); // Use empty array for now
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-800';
      case 'INACTIVE':
        return 'bg-gray-100 text-gray-800';
      case 'SUSPENDED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const filteredClients = clients.filter(client => {
    const matchesSearch = 
      client.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.user?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${client.user?.first_name} ${client.user?.last_name}`.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = selectedStatus === 'all' || client.status === selectedStatus;
    
    return matchesSearch && matchesStatus;
  });

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
          <h1 className="text-3xl font-bold text-gray-900">Clients</h1>
          <p className="text-gray-600 mt-1">
            Manage your client accounts and relationships
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <PluginSlot 
            slotId="admin.page.clients.header.actions" 
            props={{ user, isDemoMode, clients: filteredClients }}
            className="flex items-center space-x-2"
          />
          
          <button 
            onClick={() => setShowCreateModal(true)}
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Client</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Clients</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{clients.length}</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Clients</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {clients.filter(c => c.status === 'ACTIVE').length}
              </p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg flex items-center justify-center">
              <UserCheck className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Revenue</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {formatCurrency(clients.reduce((sum, c) => sum + (c.total_revenue || 0), 0))}
              </p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Avg Revenue</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {formatCurrency(clients.length > 0 ? clients.reduce((sum, c) => sum + (c.total_revenue || 0), 0) / clients.length : 0)}
              </p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-red-500 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-white" />
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
                placeholder="Search clients..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent w-full sm:w-64"
              />
            </div>

            {/* Status Filter */}
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
                <option value="SUSPENDED">Suspended</option>
              </select>
            </div>
          </div>

          <PluginSlot 
            slotId="admin.page.clients.list.actions" 
            props={{ user, isDemoMode, clients: filteredClients, searchTerm, selectedStatus }}
            className="flex items-center space-x-2"
          />
        </div>
      </div>

      {/* Clients Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredClients.map((client) => (
          <div key={client.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                  <Building className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{client.company_name || 'Individual Client'}</h3>
                  <p className="text-sm text-gray-500">{client.user?.first_name} {client.user?.last_name}</p>
                </div>
              </div>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(client.status)}`}>
                {client.status}
              </span>
            </div>

            <div className="space-y-3 mb-4">
              <div className="flex items-center text-sm text-gray-600">
                <Mail className="w-4 h-4 mr-2" />
                {client.user?.email}
              </div>
              
              {client.phone && (
                <div className="flex items-center text-sm text-gray-600">
                  <Phone className="w-4 h-4 mr-2" />
                  {client.phone}
                </div>
              )}
              
              {(client.city || client.country) && (
                <div className="flex items-center text-sm text-gray-600">
                  <MapPin className="w-4 h-4 mr-2" />
                  {[client.city, client.country].filter(Boolean).join(', ')}
                </div>
              )}
              
              <div className="flex items-center text-sm text-gray-600">
                <Calendar className="w-4 h-4 mr-2" />
                Joined {formatDate(client.created_at)}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="text-center">
                <div className="text-lg font-bold text-gray-900">{client._count?.invoices || 0}</div>
                <div className="text-xs text-gray-500">Invoices</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-gray-900">{client._count?.subscriptions || 0}</div>
                <div className="text-xs text-gray-500">Subscriptions</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-gray-900">{formatCurrency(client.total_revenue || 0)}</div>
                <div className="text-xs text-gray-500">Revenue</div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center space-x-2">
              <button className="flex-1 flex items-center justify-center px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm">
                <Eye className="w-3 h-3 mr-1" />
                View
              </button>
              <button className="flex-1 flex items-center justify-center px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm">
                <Edit className="w-3 h-3 mr-1" />
                Edit
              </button>
              <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredClients.length === 0 && !loading && (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No clients found</h3>
          <p className="text-gray-500 mb-6">
            {searchTerm || selectedStatus !== 'all' 
              ? 'Try adjusting your search or filter criteria' 
              : 'Create your first client to get started'
            }
          </p>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200"
          >
            Add Client
          </button>
        </div>
      )}

      {/* Plugin Slot: Page Bottom */}
      <PluginSlot 
        slotId="admin.page.clients.bottom" 
        props={{ user, isDemoMode, clients: filteredClients }}
        className="space-y-6"
      />
    </div>
  );
}