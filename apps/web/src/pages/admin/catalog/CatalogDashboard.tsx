import React from 'react';
import { Link, Routes, Route, useLocation } from 'react-router-dom';
import { 
  Package, 
  Layers, 
  CreditCard, 
  TrendingUp,
  Database,
  ShieldCheck,
  Activity
} from 'lucide-react';
import { trpc } from '../../../api/trpc';
import { ComponentList } from './components/ComponentList';
import ProductsManagement from './ProductsManagement';

const CatalogDashboardContent: React.FC = () => {
  const { data: components } = trpc.catalog.listComponents.useQuery();
  const { data: providers } = trpc.catalog.getProviders.useQuery();
  const { data: providerHealth } = trpc.catalog.getProviderHealth.useQuery();

  const healthyProviders = providerHealth?.results.filter(r => r.healthy).length ?? 0;
  const totalProviders = providers?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Product Catalog</h1>
        <p className="text-gray-600 mt-1">
          Manage your component-based product catalog, pricing, and billing plans
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Layers className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Components</p>
              <p className="text-2xl font-bold text-gray-900">{components?.length ?? 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <ShieldCheck className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Healthy Providers</p>
              <p className="text-2xl font-bold text-gray-900">
                {healthyProviders}/{totalProviders}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Package className="h-6 w-6 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Products</p>
              <p className="text-2xl font-bold text-gray-900">3</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-orange-100 rounded-lg">
              <CreditCard className="h-6 w-6 text-orange-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Billing Plans</p>
              <p className="text-2xl font-bold text-gray-900">5</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Navigation Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Component Definitions */}
        <Link 
          to="components" 
          className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow group"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="p-3 bg-blue-100 rounded-lg w-fit mb-4 group-hover:bg-blue-200 transition-colors">
                <Database className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Component Definitions</h3>
              <p className="text-gray-600 text-sm">
                Manage the raw, provisionable resources that make up your products
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center text-blue-600 text-sm font-medium">
            Manage Components
            <svg className="ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>

        {/* Products */}
        <Link 
          to="products" 
          className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow group"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="p-3 bg-green-100 rounded-lg w-fit mb-4 group-hover:bg-green-200 transition-colors">
                <Package className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Products</h3>
              <p className="text-gray-600 text-sm">
                Create marketable packages by combining components with pricing
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center text-green-600 text-sm font-medium">
            Manage Products
            <svg className="ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>
      </div>

      {/* Provider Status */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Provider Status</h2>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {providerHealth?.results.map((health, index) => (
              <div key={index} className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${health.healthy ? 'bg-green-100' : 'bg-red-100'}`}>
                  <Activity className={`h-4 w-4 ${health.healthy ? 'text-green-600' : 'text-red-600'}`} />
                </div>
                <div>
                  <p className="text-sm text-gray-900">
                    Provider <span className="font-medium">{health.componentKey}</span> is {health.healthy ? 'healthy' : 'unhealthy'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {health.message || `Response time: ${health.responseTime}ms`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const CatalogDashboard: React.FC = () => {
  const location = useLocation();

  const getTitle = () => {
    const path = location.pathname.split('/').pop();
    switch(path) {
      case 'components':
        return 'Component Definitions';
      case 'products':
        return 'Products';
      default:
        return 'Catalog Dashboard';
    }
  };

  return (
    <div>
      <Routes>
        <Route path="/" element={<CatalogDashboardContent />} />
        <Route path="/components" element={<ComponentList />} />
        <Route path="/products" element={<ProductsManagement />} />
      </Routes>
    </div>
  );
}

export default CatalogDashboard; 