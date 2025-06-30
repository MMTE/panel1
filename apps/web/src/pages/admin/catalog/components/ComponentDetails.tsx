import React, { useState } from 'react';
import { trpc } from '../../../../api/trpc';
import { 
  Package, 
  Settings, 
  Activity, 
  CheckCircle, 
  XCircle, 
  Edit, 
  Trash2, 
  AlertTriangle,
  Calendar,
  DollarSign,
  Shield
} from 'lucide-react';

interface ComponentDetailsProps {
  componentId: string;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export const ComponentDetails: React.FC<ComponentDetailsProps> = ({
  componentId,
  onEdit,
  onDelete,
  onClose
}) => {
  const { data: component, isLoading, error } = trpc.catalog.getComponent.useQuery(
    { id: componentId }
  );
  const [showConfiguration, setShowConfiguration] = useState(false);

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
          <p className="text-center text-gray-600 mt-4">Loading component details...</p>
        </div>
      </div>
    );
  }

  if (error || !component) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="h-6 w-6 text-red-500" />
            <h3 className="text-lg font-semibold text-gray-900">Error</h3>
          </div>
          <p className="text-gray-600 mb-4">
            {error?.message || 'Component not found'}
          </p>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${component.isActive ? 'bg-green-100' : 'bg-gray-100'}`}>
              <Package className={`h-6 w-6 ${component.isActive ? 'text-green-600' : 'text-gray-600'}`} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{component.name}</h2>
              <p className="text-sm text-gray-600">{component.componentKey}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onEdit}
              className="px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md"
            >
              <Edit className="h-4 w-4 mr-1 inline" />
              Edit
            </button>
            <button
              onClick={onDelete}
              className="px-3 py-2 text-sm font-medium text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md"
            >
              <Trash2 className="h-4 w-4 mr-1 inline" />
              Delete
            </button>
            <button
              onClick={onClose}
              className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-md"
            >
              Close
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Status & Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Status</span>
              </div>
              <div className="flex items-center gap-2">
                {component.isActive ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-green-700">Active</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span className="text-sm text-red-700">Inactive</span>
                  </>
                )}
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Version</span>
              </div>
              <span className="text-sm text-gray-900">{component.version}</span>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Created</span>
              </div>
              <span className="text-sm text-gray-900">
                {new Date(component.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Description */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-3">Description</h3>
            <p className="text-gray-700 leading-relaxed">{component.description}</p>
          </div>

          {/* Metadata */}
          {component.metadata && (
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-3">Capabilities</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-medium text-blue-700">Pricing Models</span>
                  </div>
                  <div className="space-y-1">
                    {component.metadata.supportedPricingModels?.map((model: string) => (
                      <span
                        key={model}
                        className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full mr-1"
                      >
                        {model}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="bg-green-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium text-green-700">Usage Tracking</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {component.metadata.usageTrackingSupported ? (
                      <>
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="text-sm text-green-700">Supported</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 text-red-500" />
                        <span className="text-sm text-red-700">Not Supported</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Configuration Fields */}
              <div className="mt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Configuration Requirements</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Required Fields</span>
                    <div className="mt-1 space-y-1">
                      {component.metadata.requiredConfigFields?.map((field: string) => (
                        <span
                          key={field}
                          className="inline-block px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full mr-1"
                        >
                          {field}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Optional Fields</span>
                    <div className="mt-1 space-y-1">
                      {component.metadata.optionalConfigFields?.map((field: string) => (
                        <span
                          key={field}
                          className="inline-block px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full mr-1"
                        >
                          {field}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Configuration */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-medium text-gray-900">Configuration</h3>
              <button
                onClick={() => setShowConfiguration(!showConfiguration)}
                className="px-3 py-1 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md"
              >
                <Settings className="h-4 w-4 mr-1 inline" />
                {showConfiguration ? 'Hide' : 'Show'}
              </button>
            </div>
            {showConfiguration && (
              <div className="bg-gray-50 rounded-lg p-4">
                <pre className="text-sm text-gray-800 whitespace-pre-wrap overflow-x-auto">
                  {JSON.stringify(component.configuration, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Timestamps */}
          <div className="border-t border-gray-200 pt-4">
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>Created: {new Date(component.createdAt).toLocaleString()}</span>
              <span>Updated: {new Date(component.updatedAt).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}; 