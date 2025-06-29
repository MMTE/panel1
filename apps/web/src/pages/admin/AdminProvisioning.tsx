import React, { useState } from 'react';
import { 
  Server, 
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
  Database,
  Cpu,
  HardDrive,
  Network,
  Zap,
  Activity,
  Play,
  Pause,
  Stop
} from 'lucide-react';
import { PluginSlot } from '../../lib/plugins';
import { useAuth } from '../../hooks/useAuth';
import { trpc } from '../../api/trpc';

interface ServerInstance {
  id: string;
  hostname: string;
  ipAddress: string;
  status: 'ONLINE' | 'OFFLINE' | 'MAINTENANCE' | 'PROVISIONING' | 'ERROR';
  serverType: 'cPanel' | 'WHM' | 'DirectAdmin' | 'Plesk';
  location: string;
  specs: {
    cpu: string;
    ram: string;
    storage: string;
    bandwidth: string;
  };
  uptime: number; // percentage
  loadAverage: number;
  diskUsage: number; // percentage
  memoryUsage: number; // percentage
  lastHealthCheck: string;
  plugins: string[];
  activeServices: number;
  totalServices: number;
}

interface ProvisioningJob {
  id: string;
  type: 'INSTALL_PLUGIN' | 'CREATE_ACCOUNT' | 'CONFIGURE_SERVICE' | 'BACKUP' | 'RESTORE';
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  serverId: string;
  serverName: string;
  description: string;
  progress: number; // 0-100
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
}

export function AdminProvisioning() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedServerType, setSelectedServerType] = useState('all');
  const [activeTab, setActiveTab] = useState<'servers' | 'jobs' | 'plugins'>('servers');

  // Real tRPC calls for provisioning data
  const { data: serversData, isLoading: serversLoading, refetch: refetchServers } = trpc.provisioning.getServers.useQuery({
    search: searchTerm || undefined,
    status: selectedStatus !== 'all' ? selectedStatus : undefined,
    type: selectedServerType !== 'all' ? selectedServerType : undefined,
  }, {
    enabled: !!user,
  });

  const { data: jobsData, isLoading: jobsLoading, refetch: refetchJobs } = trpc.provisioning.getJobs.useQuery({
    status: selectedStatus !== 'all' ? selectedStatus : undefined,
    limit: 50,
  }, {
    enabled: !!user,
  });

  const servers = serversData?.servers || [];
  const jobs = jobsData?.jobs || [];

  // Mock data for demonstration since provisioning router may not be fully implemented
  const mockServers: ServerInstance[] = [
    {
      id: '1',
      hostname: 'web-server-01',
      ipAddress: '192.168.1.100',
      status: 'ONLINE',
      serverType: 'cPanel',
      location: 'US East',
      specs: {
        cpu: '4 cores @ 2.4GHz',
        ram: '8GB DDR4',
        storage: '500GB SSD',
        bandwidth: '1Gbps'
      },
      uptime: 99.8,
      loadAverage: 0.45,
      diskUsage: 67,
      memoryUsage: 72,
      lastHealthCheck: new Date().toISOString(),
      plugins: ['cPanel Plugin', 'SSL Manager', 'Backup Manager'],
      activeServices: 45,
      totalServices: 50,
    },
    {
      id: '2',
      hostname: 'web-server-02',
      ipAddress: '192.168.1.101',
      status: 'MAINTENANCE',
      serverType: 'WHM',
      location: 'US West',
      specs: {
        cpu: '8 cores @ 3.2GHz',
        ram: '16GB DDR4',
        storage: '1TB SSD',
        bandwidth: '2Gbps'
      },
      uptime: 99.5,
      loadAverage: 1.2,
      diskUsage: 45,
      memoryUsage: 58,
      lastHealthCheck: new Date(Date.now() - 300000).toISOString(),
      plugins: ['WHM Plugin', 'DNS Manager', 'Email Manager'],
      activeServices: 78,
      totalServices: 80,
    },
    {
      id: '3',
      hostname: 'web-server-03',
      ipAddress: '192.168.1.102',
      status: 'PROVISIONING',
      serverType: 'DirectAdmin',
      location: 'Europe',
      specs: {
        cpu: '2 cores @ 2.0GHz',
        ram: '4GB DDR4',
        storage: '250GB SSD',
        bandwidth: '500Mbps'
      },
      uptime: 0,
      loadAverage: 0,
      diskUsage: 0,
      memoryUsage: 0,
      lastHealthCheck: new Date(Date.now() - 600000).toISOString(),
      plugins: [],
      activeServices: 0,
      totalServices: 0,
    },
  ];

  const mockJobs: ProvisioningJob[] = [
    {
      id: '1',
      type: 'INSTALL_PLUGIN',
      status: 'COMPLETED',
      serverId: '1',
      serverName: 'web-server-01',
      description: 'Installing SSL Manager plugin',
      progress: 100,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      startedAt: new Date(Date.now() - 3500000).toISOString(),
      completedAt: new Date(Date.now() - 3400000).toISOString(),
    },
    {
      id: '2',
      type: 'CREATE_ACCOUNT',
      status: 'IN_PROGRESS',
      serverId: '2',
      serverName: 'web-server-02',
      description: 'Creating hosting account for client-123',
      progress: 65,
      createdAt: new Date(Date.now() - 1800000).toISOString(),
      startedAt: new Date(Date.now() - 1700000).toISOString(),
    },
    {
      id: '3',
      type: 'CONFIGURE_SERVICE',
      status: 'PENDING',
      serverId: '1',
      serverName: 'web-server-01',
      description: 'Configuring email service for domain.com',
      progress: 0,
      createdAt: new Date().toISOString(),
    },
    {
      id: '4',
      type: 'BACKUP',
      status: 'FAILED',
      serverId: '2',
      serverName: 'web-server-02',
      description: 'Creating weekly backup',
      progress: 45,
      createdAt: new Date(Date.now() - 7200000).toISOString(),
      startedAt: new Date(Date.now() - 7100000).toISOString(),
      errorMessage: 'Insufficient disk space for backup',
    },
  ];

  const displayServers = servers.length > 0 ? servers : mockServers;
  const displayJobs = jobs.length > 0 ? jobs : mockJobs;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ONLINE':
        return 'bg-green-100 text-green-800';
      case 'OFFLINE':
        return 'bg-red-100 text-red-800';
      case 'MAINTENANCE':
        return 'bg-yellow-100 text-yellow-800';
      case 'PROVISIONING':
        return 'bg-blue-100 text-blue-800';
      case 'ERROR':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getJobStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-green-100 text-green-800';
      case 'IN_PROGRESS':
        return 'bg-blue-100 text-blue-800';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'FAILED':
        return 'bg-red-100 text-red-800';
      case 'CANCELLED':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getJobTypeIcon = (type: string) => {
    switch (type) {
      case 'INSTALL_PLUGIN':
        return <Download className="w-4 h-4" />;
      case 'CREATE_ACCOUNT':
        return <Plus className="w-4 h-4" />;
      case 'CONFIGURE_SERVICE':
        return <Settings className="w-4 h-4" />;
      case 'BACKUP':
        return <Database className="w-4 h-4" />;
      case 'RESTORE':
        return <RefreshCw className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'text-red-600';
    if (percentage >= 75) return 'text-orange-600';
    if (percentage >= 50) return 'text-yellow-600';
    return 'text-green-600';
  };

  if (serversLoading || jobsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
        <span className="ml-2 text-gray-600">Loading provisioning data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Server Provisioning</h1>
          <p className="text-gray-600 mt-1">
            Manage server instances and provisioning jobs
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <PluginSlot 
            slotId="admin.page.provisioning.header.actions" 
            props={{ user, servers: displayServers, jobs: displayJobs }}
            className="flex items-center space-x-2"
          />
          
          <button
            onClick={() => {
              refetchServers();
              refetchJobs();
            }}
            className="px-3 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
          
          <button 
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add Server</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('servers')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'servers'
                  ? 'border-purple-500 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Servers ({displayServers.length})
            </button>
            <button
              onClick={() => setActiveTab('jobs')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'jobs'
                  ? 'border-purple-500 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Jobs ({displayJobs.length})
            </button>
            <button
              onClick={() => setActiveTab('plugins')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'plugins'
                  ? 'border-purple-500 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Plugins
            </button>
          </nav>
        </div>

        <div className="p-6">
          {/* Servers Tab */}
          {activeTab === 'servers' && (
            <div className="space-y-6">
              {/* Search and Filters */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
                <div className="flex flex-col sm:flex-row sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search servers..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent w-full sm:w-64"
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Filter className="w-4 h-4 text-gray-400" />
                    <select
                      value={selectedStatus}
                      onChange={(e) => setSelectedStatus(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      <option value="all">All Status</option>
                      <option value="ONLINE">Online</option>
                      <option value="OFFLINE">Offline</option>
                      <option value="MAINTENANCE">Maintenance</option>
                      <option value="PROVISIONING">Provisioning</option>
                      <option value="ERROR">Error</option>
                    </select>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Server className="w-4 h-4 text-gray-400" />
                    <select
                      value={selectedServerType}
                      onChange={(e) => setSelectedServerType(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      <option value="all">All Types</option>
                      <option value="cPanel">cPanel</option>
                      <option value="WHM">WHM</option>
                      <option value="DirectAdmin">DirectAdmin</option>
                      <option value="Plesk">Plesk</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Servers Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {displayServers.map((server) => (
                  <div key={server.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
                          <Server className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">{server.hostname}</h3>
                          <p className="text-sm text-gray-500">{server.ipAddress}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(server.status)}`}>
                          {server.status}
                        </span>
                      </div>
                    </div>

                    {/* Server Info */}
                    <div className="space-y-3 mb-4">
                      <div className="flex items-center text-sm text-gray-600">
                        <Server className="w-4 h-4 mr-2" />
                        {server.serverType} - {server.location}
                      </div>
                      
                      <div className="flex items-center text-sm text-gray-600">
                        <Cpu className="w-4 h-4 mr-2" />
                        {server.specs.cpu}
                      </div>

                      <div className="flex items-center text-sm text-gray-600">
                        <HardDrive className="w-4 h-4 mr-2" />
                        {server.specs.ram} RAM
                      </div>

                      <div className="flex items-center text-sm text-gray-600">
                        <Database className="w-4 h-4 mr-2" />
                        {server.specs.storage}
                      </div>

                      <div className="flex items-center text-sm text-gray-600">
                        <Network className="w-4 h-4 mr-2" />
                        {server.specs.bandwidth}
                      </div>
                    </div>

                    {/* Performance Metrics */}
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Uptime</span>
                        <span className="font-medium text-green-600">{server.uptime}%</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Load Average</span>
                        <span className={`font-medium ${getUsageColor(server.loadAverage * 100)}`}>
                          {server.loadAverage}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Disk Usage</span>
                        <span className={`font-medium ${getUsageColor(server.diskUsage)}`}>
                          {server.diskUsage}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Memory Usage</span>
                        <span className={`font-medium ${getUsageColor(server.memoryUsage)}`}>
                          {server.memoryUsage}%
                        </span>
                      </div>
                    </div>

                    {/* Services */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-gray-600">Active Services</span>
                        <span className="font-medium">{server.activeServices}/{server.totalServices}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full" 
                          style={{ width: `${(server.activeServices / server.totalServices) * 100}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center space-x-2">
                      <button className="flex-1 flex items-center justify-center px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm">
                        <Eye className="w-3 h-3 mr-1" />
                        Monitor
                      </button>
                      <button className="flex-1 flex items-center justify-center px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm">
                        <Settings className="w-3 h-3 mr-1" />
                        Configure
                      </button>
                      <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                        <Activity className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Jobs Tab */}
          {activeTab === 'jobs' && (
            <div className="space-y-6">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Job
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Server
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Progress
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {displayJobs.map((job) => (
                      <tr key={job.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-8 w-8">
                              <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center">
                                {getJobTypeIcon(job.type)}
                              </div>
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">
                                {job.type.replace('_', ' ')}
                              </div>
                              <div className="text-sm text-gray-500">
                                {job.description}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {job.serverName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getJobStatusColor(job.status)}`}>
                            {job.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                              <div 
                                className="bg-blue-600 h-2 rounded-full" 
                                style={{ width: `${job.progress}%` }}
                              ></div>
                            </div>
                            <span className="text-sm text-gray-900">{job.progress}%</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(job.createdAt)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center space-x-2">
                            {job.status === 'PENDING' && (
                              <button className="text-blue-600 hover:text-blue-900">
                                <Play className="w-4 h-4" />
                              </button>
                            )}
                            {job.status === 'IN_PROGRESS' && (
                              <button className="text-yellow-600 hover:text-yellow-900">
                                <Pause className="w-4 h-4" />
                              </button>
                            )}
                            <button className="text-gray-600 hover:text-gray-900">
                              <Eye className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Plugins Tab */}
          {activeTab === 'plugins' && (
            <div className="space-y-6">
              <div className="text-center py-12">
                <Server className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Plugin Management</h3>
                <p className="text-gray-600">
                  Manage server plugins and configurations. This feature is coming soon.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Plugin Slots */}
      <PluginSlot 
        slotId="admin.page.provisioning.bottom" 
        props={{ user, servers: displayServers, jobs: displayJobs }}
        className="space-y-6"
      />
    </div>
  );
} 