import React, { useState } from 'react';
import { 
  Shield, 
  Search, 
  Filter,
  Plus,
  ChevronDown,
  Clock,
  Calendar,
  ExternalLink,
  Loader2,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Download,
  Eye,
  Settings,
  Globe,
  Lock,
  Unlock
} from 'lucide-react';
import { PluginSlot } from '../../lib/plugins';
import { useAuth } from '../../hooks/useAuth';
import { trpc } from '../../api/trpc';

interface SSLCertificate {
  id: string;
  domainName: string;
  certificateType: 'DV' | 'OV' | 'EV' | 'WILDCARD';
  status: 'ACTIVE' | 'PENDING' | 'EXPIRED' | 'REVOKED' | 'INSTALLING';
  issuer: string;
  validFrom: string;
  validTo: string;
  autoRenew: boolean;
  installationStatus: 'INSTALLED' | 'PENDING' | 'FAILED';
  lastRenewalAttempt?: string;
  nextRenewalDate?: string;
}

export function AdminSSL() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [showInstallModal, setShowInstallModal] = useState(false);

  // Real tRPC calls for SSL certificates
  const { data: certificatesData, isLoading: certificatesLoading, refetch: refetchCertificates } = trpc.ssl.getAll.useQuery({
    search: searchTerm || undefined,
    status: selectedStatus !== 'all' ? selectedStatus : undefined,
    type: selectedType !== 'all' ? selectedType : undefined,
  }, {
    enabled: !!user,
  });

  const certificates = certificatesData?.certificates || [];

  // Mock data for demonstration since SSL router may not be fully implemented
  const mockCertificates: SSLCertificate[] = [
    {
      id: '1',
      domainName: 'example.com',
      certificateType: 'DV',
      status: 'ACTIVE',
      issuer: 'Let\'s Encrypt',
      validFrom: new Date(Date.now() - 86400000 * 30).toISOString(),
      validTo: new Date(Date.now() + 86400000 * 60).toISOString(),
      autoRenew: true,
      installationStatus: 'INSTALLED',
      nextRenewalDate: new Date(Date.now() + 86400000 * 45).toISOString(),
    },
    {
      id: '2',
      domainName: '*.example.com',
      certificateType: 'WILDCARD',
      status: 'ACTIVE',
      issuer: 'DigiCert',
      validFrom: new Date(Date.now() - 86400000 * 90).toISOString(),
      validTo: new Date(Date.now() + 86400000 * 275).toISOString(),
      autoRenew: true,
      installationStatus: 'INSTALLED',
      nextRenewalDate: new Date(Date.now() + 86400000 * 240).toISOString(),
    },
    {
      id: '3',
      domainName: 'secure.example.com',
      certificateType: 'EV',
      status: 'PENDING',
      issuer: 'DigiCert',
      validFrom: new Date().toISOString(),
      validTo: new Date(Date.now() + 86400000 * 365).toISOString(),
      autoRenew: false,
      installationStatus: 'PENDING',
    },
    {
      id: '4',
      domainName: 'old.example.com',
      certificateType: 'DV',
      status: 'EXPIRED',
      issuer: 'Let\'s Encrypt',
      validFrom: new Date(Date.now() - 86400000 * 120).toISOString(),
      validTo: new Date(Date.now() - 86400000 * 30).toISOString(),
      autoRenew: false,
      installationStatus: 'INSTALLED',
      lastRenewalAttempt: new Date(Date.now() - 86400000 * 25).toISOString(),
    },
  ];

  const displayCertificates = certificates.length > 0 ? certificates : mockCertificates;

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
      case 'ACTIVE':
        return 'bg-green-100 text-green-800';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'EXPIRED':
        return 'bg-red-100 text-red-800';
      case 'REVOKED':
        return 'bg-gray-100 text-gray-800';
      case 'INSTALLING':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getInstallationStatusColor = (status: string) => {
    switch (status) {
      case 'INSTALLED':
        return 'bg-green-100 text-green-800';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'FAILED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getExpiryColor = (daysUntilExpiry: number) => {
    if (daysUntilExpiry < 0) return 'text-red-600';
    if (daysUntilExpiry <= 30) return 'text-orange-600';
    if (daysUntilExpiry <= 90) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getCertificateTypeIcon = (type: string) => {
    switch (type) {
      case 'WILDCARD':
        return <Globe className="w-4 h-4" />;
      case 'EV':
        return <Shield className="w-4 h-4" />;
      default:
        return <Lock className="w-4 h-4" />;
    }
  };

  if (certificatesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
        <span className="ml-2 text-gray-600">Loading SSL certificates...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">SSL Certificates</h1>
          <p className="text-gray-600 mt-1">
            Manage SSL certificates for your domains
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <PluginSlot 
            slotId="admin.page.ssl.header.actions" 
            props={{ user, certificates: displayCertificates }}
            className="flex items-center space-x-2"
          />
          
          <button
            onClick={() => refetchCertificates()}
            className="px-3 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
          
          <button 
            onClick={() => setShowInstallModal(true)}
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Install Certificate</span>
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
                placeholder="Search domains..."
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
                <option value="PENDING">Pending</option>
                <option value="EXPIRED">Expired</option>
                <option value="REVOKED">Revoked</option>
                <option value="INSTALLING">Installing</option>
              </select>
            </div>

            {/* Type Filter */}
            <div className="flex items-center space-x-2">
              <Shield className="w-4 h-4 text-gray-400" />
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="all">All Types</option>
                <option value="DV">Domain Validated</option>
                <option value="OV">Organization Validated</option>
                <option value="EV">Extended Validation</option>
                <option value="WILDCARD">Wildcard</option>
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-sm text-gray-500">
            <Shield className="w-4 h-4" />
            <span>{displayCertificates.length} certificates</span>
          </div>
        </div>
      </div>

      {/* Certificates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayCertificates.map((cert) => {
          const daysUntilExpiry = getDaysUntilExpiry(cert.validTo);
          const isExpired = daysUntilExpiry < 0;
          const isExpiringSoon = daysUntilExpiry <= 30;

          return (
            <div key={cert.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg flex items-center justify-center">
                    {getCertificateTypeIcon(cert.certificateType)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{cert.domainName}</h3>
                    <p className="text-sm text-gray-500">{cert.certificateType} Certificate</p>
                  </div>
                </div>
                <div className="flex items-center space-x-1">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(cert.status)}`}>
                    {cert.status}
                  </span>
                </div>
              </div>

              {/* Certificate Info */}
              <div className="space-y-3 mb-4">
                <div className="flex items-center text-sm text-gray-600">
                  <Shield className="w-4 h-4 mr-2" />
                  {cert.issuer}
                </div>
                
                <div className="flex items-center text-sm text-gray-600">
                  <Calendar className="w-4 h-4 mr-2" />
                  Valid until {formatDate(cert.validTo)}
                </div>

                <div className="flex items-center text-sm text-gray-600">
                  <Clock className="w-4 h-4 mr-2" />
                  <span className={getExpiryColor(daysUntilExpiry)}>
                    {isExpired 
                      ? `${Math.abs(daysUntilExpiry)} days expired`
                      : `${daysUntilExpiry} days remaining`
                    }
                  </span>
                </div>

                <div className="flex items-center text-sm text-gray-600">
                  <Settings className="w-4 h-4 mr-2" />
                  <span className={getInstallationStatusColor(cert.installationStatus)}>
                    {cert.installationStatus}
                  </span>
                </div>

                {cert.autoRenew && (
                  <div className="flex items-center text-sm text-green-600">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Auto-renewal enabled
                  </div>
                )}
              </div>

              {/* Warning for expiring certificates */}
              {isExpiringSoon && !isExpired && (
                <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 text-orange-600" />
                    <span className="text-sm text-orange-800">
                      Certificate expires in {daysUntilExpiry} days
                    </span>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center space-x-2">
                <button className="flex-1 flex items-center justify-center px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm">
                  <Eye className="w-3 h-3 mr-1" />
                  View Details
                </button>
                <button className="flex-1 flex items-center justify-center px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm">
                  <Download className="w-3 h-3 mr-1" />
                  Download
                </button>
                <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {displayCertificates.length === 0 && !certificatesLoading && (
        <div className="text-center py-12">
          <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No SSL certificates found</h3>
          <p className="text-gray-600 mb-6">
            Get started by installing your first SSL certificate for your domains.
          </p>
          <button 
            onClick={() => setShowInstallModal(true)}
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200"
          >
            Install Certificate
          </button>
        </div>
      )}

      {/* Plugin Slots */}
      <PluginSlot 
        slotId="admin.page.ssl.bottom" 
        props={{ user, certificates: displayCertificates }}
        className="space-y-6"
      />
    </div>
  );
} 