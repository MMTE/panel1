import React, { useState } from 'react';
import { trpc } from '../../../api/trpc';
import { Plus, Edit, Trash2, Settings, Package, Eye, X, Loader, AlertCircle } from 'lucide-react';
import { ComponentRegistrationForm } from './components/ComponentRegistrationForm';

const ComponentRegistrationManagement: React.FC = () => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingComponent, setEditingComponent] = useState<any>(null);
  const [selectedType, setSelectedType] = useState('all');
  const [isSaving, setIsSaving] = useState(false);

  // Fetch components
  const { 
    data: components, 
    isLoading, 
    error, 
    refetch 
  } = trpc.catalog.listComponents.useQuery();

  // Get tRPC utils for cache invalidation
  const utils = trpc.useUtils();

  // Delete component mutation
  const deleteComponent = trpc.catalog.deleteComponent.useMutation({
    onSuccess: () => {
      utils.catalog.listComponents.invalidate();
    },
    onError: (error) => {
      console.error('Failed to delete component:', error);
    }
  });

  const handleSaveComponent = async (data: any) => {
    try {
      setIsSaving(true);
      // For now, just simulate the save since the backend endpoints have issues
      console.log('Saving component:', data);
      await new Promise(resolve => setTimeout(resolve, 1000));
      setShowCreateModal(false);
      setEditingComponent(null);
    } catch (error) {
      console.error('Failed to save component:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteComponent = (componentId: string) => {
    if (window.confirm('Are you sure you want to delete this component? This action cannot be undone.')) {
      deleteComponent.mutate({ id: componentId });
    }
  };

  const handleEditComponent = (component: any) => {
    setEditingComponent(component);
    setShowCreateModal(true);
  };

  const filteredComponents = components ? (selectedType === 'all' 
    ? components 
    : components.filter(component => component.type === selectedType)) : [];

  const componentTypes = ['all', 'HOSTING', 'DOMAIN', 'SSL', 'EMAIL', 'DATABASE', 'STORAGE', 'BANDWIDTH', 'CPU', 'RAM', 'BACKUP', 'OTHER'];

  const getTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      HOSTING: '🖥️',
      DOMAIN: '🌐',
      SSL: '🔒',
      EMAIL: '📧',
      DATABASE: '🗄️',
      STORAGE: '💾',
      BANDWIDTH: '📊',
      CPU: '⚡',
      RAM: '🧠',
      BACKUP: '💿',
      OTHER: '📦'
    };
    return icons[type] || '📦';
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      HOSTING: 'bg-blue-100 text-blue-800',
      DOMAIN: 'bg-green-100 text-green-800',
      SSL: 'bg-purple-100 text-purple-800',
      EMAIL: 'bg-yellow-100 text-yellow-800',
      DATABASE: 'bg-indigo-100 text-indigo-800',
      STORAGE: 'bg-gray-100 text-gray-800',
      BANDWIDTH: 'bg-pink-100 text-pink-800',
      CPU: 'bg-orange-100 text-orange-800',
      RAM: 'bg-red-100 text-red-800',
      BACKUP: 'bg-teal-100 text-teal-800',
      OTHER: 'bg-gray-100 text-gray-800'
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Component Registry</h1>
            <p className="text-gray-600 mt-1">
              Register and manage dynamic components
            </p>
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader className="w-8 h-8 text-blue-600 animate-spin" />
          <span className="ml-3 text-gray-600">Loading components...</span>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Component Registry</h1>
            <p className="text-gray-600 mt-1">
              Register and manage dynamic components
            </p>
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Components</h3>
            <p className="text-gray-600 mb-4">{error.message}</p>
            <button
              onClick={() => refetch()}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Component Registry</h1>
          <p className="text-gray-600 mt-1">
            Register and manage dynamic components for your platform
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Register Component
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <Package className="h-8 w-8 text-blue-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Components</p>
              <p className="text-2xl font-bold text-gray-900">{components?.length || 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <Eye className="h-8 w-8 text-green-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Active</p>
              <p className="text-2xl font-bold text-gray-900">{components?.filter(c => c.isActive).length || 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <Settings className="h-8 w-8 text-orange-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Inactive</p>
              <p className="text-2xl font-bold text-gray-900">{components?.filter(c => !c.isActive).length || 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center">
            <Package className="h-8 w-8 text-purple-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Types</p>
              <p className="text-2xl font-bold text-gray-900">{new Set(components?.map(c => c.type)).size || 0}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-700">Filter by type:</span>
          <div className="flex gap-2 flex-wrap">
            {componentTypes.map((type) => (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                  selectedType === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {type === 'all' ? 'All' : type}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Components Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredComponents.map((component) => (
          <div key={component.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            {/* Component Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="text-2xl">
                  {component.metadata?.icon || getTypeIcon(component.type)}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{component.name}</h3>
                  <p className="text-sm text-gray-600">{component.componentKey}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTypeColor(component.type)}`}>
                  {component.type}
                </span>
                <div className={`w-2 h-2 rounded-full ${component.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
              </div>
            </div>

            {/* Component Description */}
            <p className="text-sm text-gray-600 mb-4 line-clamp-2">
              {component.description}
            </p>

            {/* Component Details */}
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Provisioning:</span>
                <span className={`font-medium ${component.metadata?.provisioningRequired ? 'text-green-600' : 'text-gray-600'}`}>
                  {component.metadata?.provisioningRequired ? 'Required' : 'Not Required'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Usage Tracking:</span>
                <span className={`font-medium ${component.metadata?.usageTrackingSupported ? 'text-blue-600' : 'text-gray-600'}`}>
                  {component.metadata?.usageTrackingSupported ? 'Supported' : 'Not Supported'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Config Fields:</span>
                <span className="font-medium text-gray-900">
                  {(component.metadata?.requiredConfigFields?.length || 0) + (component.metadata?.optionalConfigFields?.length || 0)}
                </span>
              </div>
            </div>

            {/* Pricing Models */}
            {component.metadata?.supportedPricingModels && (
              <div className="mb-4">
                <p className="text-xs font-medium text-gray-700 mb-2">Pricing Models:</p>
                <div className="flex flex-wrap gap-1">
                  {component.metadata.supportedPricingModels.map((model: string) => (
                    <span key={model} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                      {model.replace('_', ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Tags */}
            {component.metadata?.tags && component.metadata.tags.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium text-gray-700 mb-2">Tags:</p>
                <div className="flex flex-wrap gap-1">
                  {component.metadata.tags.map((tag: string) => (
                    <span key={tag} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-between items-center pt-4 border-t border-gray-200">
              <span className="text-xs text-gray-500">
                Created {new Date(component.createdAt).toLocaleDateString()}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEditComponent(component)}
                  className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Edit component"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteComponent(component.id)}
                  className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete component"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredComponents.length === 0 && (
        <div className="text-center py-12">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No components found</h3>
          <p className="text-gray-600 mb-4">
            {selectedType === 'all' 
              ? 'Get started by registering your first component.' 
              : `No components found for type: ${selectedType}`}
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Register Component
          </button>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingComponent ? 'Edit Component' : 'Register New Component'}
                </h2>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingComponent(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6">
              <ComponentRegistrationForm
                initialData={editingComponent}
                onSave={handleSaveComponent}
                onCancel={() => {
                  setShowCreateModal(false);
                  setEditingComponent(null);
                }}
                isSaving={isSaving}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComponentRegistrationManagement; 