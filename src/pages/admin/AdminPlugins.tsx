import React, { useState, useEffect } from 'react';
import { 
  Code, 
  Search, 
  Filter, 
  Download, 
  Star,
  Shield,
  Calendar,
  Users,
  ExternalLink,
  Play,
  Pause,
  Trash2,
  Settings,
  Package,
  TrendingUp,
  Clock,
  Award
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { marketplaceManager, type MarketplacePlugin } from '../../lib/marketplace/MarketplaceManager';
import { pluginManager } from '../../lib/plugins';

export function AdminPlugins() {
  const { user, isDemoMode } = useAuth();
  const [activeTab, setActiveTab] = useState<'installed' | 'marketplace'>('installed');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [marketplacePlugins, setMarketplacePlugins] = useState<MarketplacePlugin[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeTab === 'marketplace') {
      loadMarketplacePlugins();
    }
  }, [activeTab]);

  const loadMarketplacePlugins = async () => {
    setLoading(true);
    try {
      const plugins = await marketplaceManager.fetchPlugins();
      setMarketplacePlugins(plugins);
    } catch (error) {
      console.error('Failed to load marketplace plugins:', error);
    } finally {
      setLoading(false);
    }
  };

  // Mock installed plugins for demo
  const installedPlugins = [
    {
      id: 'example-admin-ui-plugin',
      name: 'Admin UI Plugin',
      version: '1.0.0',
      description: 'Example plugin demonstrating admin UI integration',
      author: 'Panel1 Team',
      status: 'enabled',
      lastUpdated: '2024-01-20T10:30:00Z',
    },
    {
      id: 'example-analytics-plugin',
      name: 'Analytics Plugin',
      version: '1.0.0',
      description: 'Example analytics plugin for tracking user events',
      author: 'Panel1 Team',
      status: 'disabled',
      lastUpdated: '2024-01-18T14:20:00Z',
    },
  ];

  const categories = ['all', ...marketplaceManager.getCategories()];

  const filteredMarketplacePlugins = marketplacePlugins.filter(plugin => {
    const matchesSearch = plugin.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         plugin.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || plugin.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredInstalledPlugins = installedPlugins.filter(plugin => {
    return plugin.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           plugin.description.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const handleInstallPlugin = async (pluginName: string) => {
    try {
      await marketplaceManager.installPlugin(pluginName);
      // Refresh installed plugins list
    } catch (error) {
      console.error('Failed to install plugin:', error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Plugins</h1>
          <p className="text-gray-600 mt-1">
            Extend Panel1 with powerful plugins and integrations
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 flex items-center space-x-2">
            <Code className="w-4 h-4" />
            <span>Develop Plugin</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('installed')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'installed'
                  ? 'border-purple-500 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Package className="w-4 h-4" />
                <span>Installed ({installedPlugins.length})</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('marketplace')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'marketplace'
                  ? 'border-purple-500 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Award className="w-4 h-4" />
                <span>Marketplace ({marketplacePlugins.length})</span>
              </div>
            </button>
          </nav>
        </div>

        {/* Search and Filters */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
            <div className="flex flex-col sm:flex-row sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search plugins..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent w-full sm:w-64"
                />
              </div>

              {/* Category Filter (only for marketplace) */}
              {activeTab === 'marketplace' && (
                <div className="flex items-center space-x-2">
                  <Filter className="w-4 h-4 text-gray-400" />
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    {categories.map(category => (
                      <option key={category} value={category}>
                        {category === 'all' ? 'All Categories' : category}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {activeTab === 'marketplace' && (
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <TrendingUp className="w-4 h-4" />
                <span>{filteredMarketplacePlugins.length} plugins available</span>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === 'installed' ? (
            <InstalledPluginsTab 
              plugins={filteredInstalledPlugins}
              isDemoMode={isDemoMode}
            />
          ) : (
            <MarketplaceTab 
              plugins={filteredMarketplacePlugins}
              loading={loading}
              onInstall={handleInstallPlugin}
              isDemoMode={isDemoMode}
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface InstalledPluginsTabProps {
  plugins: any[];
  isDemoMode: boolean;
}

function InstalledPluginsTab({ plugins, isDemoMode }: InstalledPluginsTabProps) {
  if (plugins.length === 0) {
    return (
      <div className="text-center py-12">
        <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No plugins installed</h3>
        <p className="text-gray-500 mb-6">Get started by installing plugins from the marketplace</p>
        <button className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200">
          Browse Marketplace
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {plugins.map((plugin) => (
        <div key={plugin.id} className="bg-gray-50 rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
                <Code className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{plugin.name}</h3>
                <p className="text-sm text-gray-500">v{plugin.version}</p>
              </div>
            </div>
            <div className="flex items-center space-x-1">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                plugin.status === 'enabled' 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {plugin.status}
              </span>
            </div>
          </div>

          <p className="text-gray-600 text-sm mb-4">{plugin.description}</p>

          <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
            <span>by {plugin.author}</span>
            <div className="flex items-center space-x-1">
              <Calendar className="w-3 h-3" />
              <span>{formatDate(plugin.lastUpdated)}</span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              className={`flex-1 flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                plugin.status === 'enabled'
                  ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              {plugin.status === 'enabled' ? (
                <>
                  <Pause className="w-3 h-3 mr-1" />
                  Disable
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 mr-1" />
                  Enable
                </>
              )}
            </button>
            <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
              <Settings className="w-4 h-4" />
            </button>
            <button className="p-2 text-red-400 hover:text-red-600 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

interface MarketplaceTabProps {
  plugins: MarketplacePlugin[];
  loading: boolean;
  onInstall: (pluginName: string) => void;
  isDemoMode: boolean;
}

function MarketplaceTab({ plugins, loading, onInstall, isDemoMode }: MarketplaceTabProps) {
  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
        <p className="text-gray-500">Loading marketplace plugins...</p>
      </div>
    );
  }

  if (plugins.length === 0) {
    return (
      <div className="text-center py-12">
        <Award className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No plugins found</h3>
        <p className="text-gray-500">Try adjusting your search or filter criteria</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {plugins.map((plugin) => (
        <div key={plugin.name} className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
                <Package className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-semibold text-gray-900">{plugin.name}</h3>
                  {plugin.verified && (
                    <Shield className="w-4 h-4 text-blue-500" title="Verified plugin" />
                  )}
                </div>
                <p className="text-sm text-gray-500">v{plugin.version}</p>
              </div>
            </div>
            <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
              {plugin.category}
            </span>
          </div>

          <p className="text-gray-600 text-sm mb-4">{plugin.description}</p>

          <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
            <span>by {plugin.author}</span>
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1">
                <Star className="w-3 h-3 text-yellow-400 fill-current" />
                <span>{plugin.rating}</span>
              </div>
              <div className="flex items-center space-x-1">
                <Download className="w-3 h-3" />
                <span>{plugin.downloads}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => onInstall(plugin.name)}
              className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white px-3 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 text-sm font-medium flex items-center justify-center"
            >
              <Download className="w-3 h-3 mr-1" />
              Install
            </button>
            {plugin.homepage && (
              <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                <ExternalLink className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}