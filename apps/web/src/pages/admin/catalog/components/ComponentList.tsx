import React, { useState } from 'react';
import { 
  Package, 
  Edit, 
  Trash2, 
  Plus, 
  Check, 
  X, 
  AlertCircle,
  Settings,
  RefreshCw
} from 'lucide-react';
import { trpc } from '../../../../api/trpc';
import { ComponentForm } from './ComponentForm';

export const ComponentList: React.FC = () => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);

  const utils = trpc.useContext();
  const { data: components, isLoading } = trpc.catalog.listComponents.useQuery();
  const { data: providers } = trpc.catalog.getProviders.useQuery();
  const { data: providerHealth } = trpc.catalog.getProviderHealth.useQuery();

  const deleteComponent = trpc.catalog.deleteComponent.useMutation({
    onSuccess: () => {
      utils.catalog.listComponents.invalidate();
    },
  });

  const getProviderStatus = (componentKey: string) => {
    const health = providerHealth?.results.find(r => r.componentKey === componentKey);
    if (!health) return { healthy: false, message: 'Provider not found' };
    return {
      healthy: health.healthy,
      message: health.message || (health.healthy ? 'Healthy' : 'Unhealthy')
    };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Component Definitions</h2>
          <p className="text-sm text-gray-600">
            Manage your component definitions and their configurations
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Component
        </button>
      </div>

      {/* Component Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {components?.map((component) => {
          const providerStatus = getProviderStatus(component.componentKey);
          const provider = providers?.find(p => p.componentKey === component.componentKey);

          return (
            <div
              key={component.id}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-4"
            >
              {/* Component Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Package className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">{component.name}</h3>
                    <p className="text-sm text-gray-600">{component.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedComponent(component.id)}
                    className="p-1 text-gray-500 hover:text-blue-600 transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this component?')) {
                        deleteComponent.mutate({ id: component.id });
                      }
                    }}
                    className="p-1 text-gray-500 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Component Details */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Provider</span>
                  <span className="font-medium text-gray-900">
                    {provider?.name || 'Unknown'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Version</span>
                  <span className="font-medium text-gray-900">{component.version}</span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Status</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        providerStatus.healthy ? 'bg-green-500' : 'bg-red-500'
                      }`}
                    />
                    <span
                      className={`font-medium ${
                        providerStatus.healthy ? 'text-green-700' : 'text-red-700'
                      }`}
                    >
                      {providerStatus.healthy ? 'Healthy' : 'Unhealthy'}
                    </span>
                  </div>
                </div>

                {component.metadata && (
                  <div className="pt-3 border-t border-gray-100">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">
                      Supported Features
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {component.metadata.supportedPricingModels.map((model) => (
                        <span
                          key={model}
                          className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full"
                        >
                          {model}
                        </span>
                      ))}
                      {component.metadata.usageTrackingSupported && (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                          Usage Tracking
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-gray-100">
                <button
                  onClick={() => setSelectedComponent(component.id)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Configure
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || selectedComponent) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold text-gray-900">
                  {selectedComponent ? 'Edit Component' : 'Create Component'}
                </h3>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setSelectedComponent(null);
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <ComponentForm
                componentId={selectedComponent}
                onClose={() => {
                  setShowCreateModal(false);
                  setSelectedComponent(null);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}; 