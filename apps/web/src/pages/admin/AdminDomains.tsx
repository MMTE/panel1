import React, { useState } from 'react';
import { 
  Globe, 
  Search, 
  Filter,
  Plus,
  ChevronDown,
  Clock,
  Calendar,
  ExternalLink,
  Loader2,
  Shield,
  Settings,
  CheckCircle,
  AlertTriangle,
  XCircle,
  DollarSign,
  RefreshCw,
  Lock,
  Unlock,
  Server,
  FileText
} from 'lucide-react';
import { PluginSlot } from '../../lib/plugins';
import { useAuth } from '../../hooks/useAuth';
import { trpc } from '../../api/trpc';
import type { Client, User } from '@panel1/shared-types';

// Define domain types based on the schema
type DomainStatus = 'active' | 'expired' | 'pending_transfer' | 'pending_renewal' | 'suspended' | 'cancelled';

// Extended client type with user relation
interface ClientWithUser extends Client {
  user: User;
}

interface DomainWithClient {
  id: string;
  domainName: string;
  status: DomainStatus;
  clientId: string;
  client: {
    user: {
      firstName: string;
      lastName: string;
      email: string;
    };
  };
  registrar: string;
  registeredAt: string;
  expiresAt: string;
  autoRenew: boolean;
  privacyEnabled: boolean;
  transferLock: boolean;
  nameservers: string[];
  registrationCost: string;
  renewalCost: string;
}

export function AdminDomains() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [selectedClient, setSelectedClient] = useState('all');
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  // tRPC queries - with fallbacks for when routers may not be available
  const { data: domains, isLoading: domainsLoading, refetch: refetchDomains } = trpc.domains?.listDomains?.useQuery({
    page: 1,
    limit: 50,
    clientId: selectedClient !== 'all' ? selectedClient : undefined,
  }) || { data: null, isLoading: false, refetch: () => Promise.resolve() };

  const { data: clients } = trpc.clients?.list?.useQuery() || { data: null };

  // Mock data for demonstration since we may not have all endpoints implemented
  const mockDomains: DomainWithClient[] = [
    {
      id: '1',
      domainName: 'example.com',
      status: 'active',
      clientId: '1',
      client: { user: { firstName: 'John', lastName: 'Doe', email: 'john@example.com' } },
      registrar: 'namecheap',
      registeredAt: new Date(Date.now() - 86400000 * 365).toISOString(),
      expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
      autoRenew: true,
      privacyEnabled: true,
      transferLock: true,
      nameservers: ['ns1.example.com', 'ns2.example.com'],
      registrationCost: '12.99',
      renewalCost: '12.99'
    },
    {
      id: '2',
      domainName: 'testsite.org',
      status: 'pending_renewal',
      clientId: '2',
      client: { user: { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' } },
      registrar: 'godaddy',
      registeredAt: new Date(Date.now() - 86400000 * 728).toISOString(),
      expiresAt: new Date(Date.now() + 86400000 * 7).toISOString(),
      autoRenew: false,
      privacyEnabled: false,
      transferLock: false,
      nameservers: ['ns1.godaddy.com', 'ns2.godaddy.com'],
      registrationCost: '15.99',
      renewalCost: '15.99'
    },
    {
      id: '3',
      domainName: 'mycompany.net',
      status: 'expired',
      clientId: '3',
      client: { user: { firstName: 'Mike', lastName: 'Wilson', email: 'mike@example.com' } },
      registrar: 'namecheap',
      registeredAt: new Date(Date.now() - 86400000 * 1095).toISOString(),
      expiresAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      autoRenew: false,
      privacyEnabled: true,
      transferLock: true,
      nameservers: ['ns1.example.com', 'ns2.example.com'],
      registrationCost: '10.99',
      renewalCost: '10.99'
    },
    {
      id: '4',
      domainName: 'newdomain.io',
      status: 'pending_transfer',
      clientId: '1',
      client: { user: { firstName: 'John', lastName: 'Doe', email: 'john@example.com' } },
      registrar: 'namecheap',
      registeredAt: new Date(Date.now() - 86400000 * 180).toISOString(),
      expiresAt: new Date(Date.now() + 86400000 * 200).toISOString(),
      autoRenew: true,
      privacyEnabled: false,
      transferLock: false,
      nameservers: ['ns1.transferhost.com', 'ns2.transferhost.com'],
      registrationCost: '25.99',
      renewalCost: '25.99'
    },
    {
      id: '5',
      domainName: 'webapp.dev',
      status: 'active',
      clientId: '4',
      client: { user: { firstName: 'Lisa', lastName: 'Chen', email: 'lisa@example.com' } },
      registrar: 'cloudflare',
      registeredAt: new Date(Date.now() - 86400000 * 60).toISOString(),
      expiresAt: new Date(Date.now() + 86400000 * 305).toISOString(),
      autoRenew: true,
      privacyEnabled: true,
      transferLock: true,
      nameservers: ['ns1.cloudflare.com', 'ns2.cloudflare.com'],
      registrationCost: '9.99',
      renewalCost: '9.99'
    }
  ];

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric',
      month: 'short', 
      day: 'numeric'
    });
  };

  const getDaysUntilExpiry = (expiryDate: string) => {
    const expiry = new Date(expiryDate);
    const now = new Date();
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'pending_renewal':
        return 'bg-yellow-100 text-yellow-800';
      case 'pending_transfer':
        return 'bg-blue-100 text-blue-800';
      case 'expired':
        return 'bg-red-100 text-red-800';
      case 'suspended':
        return 'bg-orange-100 text-orange-800';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-4 h-4" />;
      case 'pending_renewal':
      case 'pending_transfer':
        return <Clock className="w-4 h-4" />;
      case 'expired':
      case 'suspended':
        return <XCircle className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const getExpiryColor = (daysUntilExpiry: number) => {
    if (daysUntilExpiry < 0) return 'text-red-600 font-semibold';
    if (daysUntilExpiry <= 7) return 'text-red-500 font-medium';
    if (daysUntilExpiry <= 30) return 'text-yellow-600 font-medium';
    return 'text-gray-600';
  };

  const filteredDomains = (domains?.domains || mockDomains).filter((domain: DomainWithClient) => {
    const matchesSearch = domain.domainName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         `${domain.client.user.firstName} ${domain.client.user.lastName}`.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = selectedFilter === 'all' || domain.status === selectedFilter;
    const matchesClient = selectedClient === 'all' || domain.clientId === selectedClient;
    
    return matchesSearch && matchesStatus && matchesClient;
  });

  // Domain statistics
  const totalDomains = filteredDomains.length;
  const activeDomains = filteredDomains.filter((d: DomainWithClient) => d.status === 'active').length;
  const expiringDomains = filteredDomains.filter((d: DomainWithClient) => {
    const days = getDaysUntilExpiry(d.expiresAt);
    return days > 0 && days <= 30;
  }).length;
  const expiredDomains = filteredDomains.filter((d: DomainWithClient) => getDaysUntilExpiry(d.expiresAt) < 0).length;

  if (domainsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
        <span className="ml-2 text-gray-600">Loading domains...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Domain Management</h1>
          <p className="text-gray-600 mt-1">
            Manage domain registrations, DNS settings, and renewals
          </p>
        </div>

        <PluginSlot 
          slotId="admin.domains.header.actions" 
          props={{ user }}
          className="flex items-center space-x-2"
        />
      </div>

      {/* Domain Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Domains</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{totalDomains}</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
              <Globe className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Domains</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{activeDomains}</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Expiring Soon</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{expiringDomains}</p>
              <p className="text-xs text-yellow-600 mt-1">Within 30 days</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Expired</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{expiredDomains}</p>
              <p className="text-xs text-red-600 mt-1">Needs attention</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-red-500 to-pink-500 rounded-lg flex items-center justify-center">
              <XCircle className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search domains by name or client..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <select
              value={selectedFilter}
              onChange={(e) => setSelectedFilter(e.target.value)}
              className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-8 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="pending_renewal">Pending Renewal</option>
              <option value="pending_transfer">Pending Transfer</option>
              <option value="expired">Expired</option>
              <option value="suspended">Suspended</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
          </div>

          {/* Client Filter */}
          <div className="relative">
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-8 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="all">All Clients</option>
              {(clients || []).map((client: Client) => (
                <option key={client.id} value={client.id}>
                  {client.user.firstName} {client.user.lastName}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
          </div>

          {/* Register Domain Button */}
          <button 
            onClick={() => setShowRegisterModal(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Register Domain</span>
          </button>
        </div>
      </div>

      {/* Domains List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Domains ({filteredDomains.length})
            </h2>
            <PluginSlot 
              slotId="admin.domains.list.actions" 
              props={{ user, domains: filteredDomains }}
            />
          </div>
        </div>

        <div className="divide-y divide-gray-200">
          {filteredDomains.length > 0 ? (
            filteredDomains.map((domain) => {
              const daysUntilExpiry = getDaysUntilExpiry(domain.expiresAt);
              
              return (
                <div key={domain.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                          <Globe className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <h3 className="text-lg font-semibold text-gray-900">{domain.domainName}</h3>
                            <span className={`px-2 py-1 text-xs rounded-full flex items-center space-x-1 ${getStatusColor(domain.status)}`}>
                              {getStatusIcon(domain.status)}
                              <span>{domain.status.replace('_', ' ').toUpperCase()}</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                        <div className="text-sm">
                          <span className="text-gray-500">Client:</span>
                          <div className="font-medium text-gray-900">
                            {domain.client.user.firstName} {domain.client.user.lastName}
                          </div>
                        </div>
                        <div className="text-sm">
                          <span className="text-gray-500">Registrar:</span>
                          <div className="font-medium text-gray-900 capitalize">{domain.registrar}</div>
                        </div>
                        <div className="text-sm">
                          <span className="text-gray-500">Registered:</span>
                          <div className="font-medium text-gray-900">{formatDate(domain.registeredAt)}</div>
                        </div>
                        <div className="text-sm">
                          <span className="text-gray-500">Expires:</span>
                          <div className={`font-medium ${getExpiryColor(daysUntilExpiry)}`}>
                            {formatDate(domain.expiresAt)}
                            {daysUntilExpiry < 0 ? ' (EXPIRED)' : 
                             daysUntilExpiry <= 30 ? ` (${daysUntilExpiry} days)` : ''}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-6 text-sm text-gray-500">
                        <div className="flex items-center space-x-1">
                          {domain.autoRenew ? (
                            <RefreshCw className="w-4 h-4 text-green-500" />
                          ) : (
                            <XCircle className="w-4 h-4 text-gray-400" />
                          )}
                          <span>Auto-renew {domain.autoRenew ? 'ON' : 'OFF'}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          {domain.privacyEnabled ? (
                            <Shield className="w-4 h-4 text-blue-500" />
                          ) : (
                            <Shield className="w-4 h-4 text-gray-400" />
                          )}
                          <span>Privacy {domain.privacyEnabled ? 'ON' : 'OFF'}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          {domain.transferLock ? (
                            <Lock className="w-4 h-4 text-green-500" />
                          ) : (
                            <Unlock className="w-4 h-4 text-red-500" />
                          )}
                          <span>Transfer {domain.transferLock ? 'LOCKED' : 'UNLOCKED'}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <DollarSign className="w-4 h-4" />
                          <span>Renewal: ${domain.renewalCost}</span>
                        </div>
                      </div>

                      <div className="mt-2 text-sm text-gray-500">
                        <div className="flex items-center space-x-1">
                          <Server className="w-4 h-4" />
                          <span>Nameservers: {domain.nameservers.join(', ')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 ml-4">
                      <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="DNS Management">
                        <Server className="w-4 h-4" />
                      </button>
                      <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="Domain Settings">
                        <Settings className="w-4 h-4" />
                      </button>
                      <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="View Details">
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-12 text-center">
              <Globe className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No domains found</h3>
              <p className="text-gray-500 mb-4">
                {searchTerm || selectedFilter !== 'all' || selectedClient !== 'all' 
                  ? 'Try adjusting your search or filters'
                  : 'No domains have been registered yet'
                }
              </p>
              {!searchTerm && selectedFilter === 'all' && selectedClient === 'all' && (
                <button 
                  onClick={() => setShowRegisterModal(true)}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 mx-auto transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Register First Domain</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Plugin slots for additional content */}
      <PluginSlot 
        slotId="admin.domains.footer" 
        props={{ user, domains: filteredDomains }}
      />

      {/* Register Domain Modal would go here */}
      {showRegisterModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Register New Domain</h3>
            <p className="text-gray-600 mb-4">Domain registration modal would be implemented here with full form validation and tRPC integration.</p>
            <div className="flex justify-end space-x-2">
              <button 
                onClick={() => setShowRegisterModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => setShowRegisterModal(false)}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                Register
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 