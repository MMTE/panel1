import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { catalogApi } from '../../../../api/catalogApi';
import { AlertCircle, Loader2 } from 'lucide-react';

interface ComponentFormProps {
  componentId?: string | null;
  onClose: () => void;
}

export const ComponentForm: React.FC<ComponentFormProps> = ({ componentId, onClose }) => {
  const queryClient = useQueryClient();
  const { data: providers = [] } = useQuery({
    queryKey: ['catalog', 'providers'],
    queryFn: () => catalogApi.getProviders(),
  });
  const { data: component, isLoading: isLoadingComponent } = useQuery({
    queryKey: ['catalog', 'components', componentId],
    queryFn: () => catalogApi.getComponentDefinition(componentId!),
    enabled: !!componentId,
  });

  const createComponent = useMutation({
    mutationFn: (body: Record<string, unknown>) => catalogApi.createComponentDefinition(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog', 'components'] });
      onClose();
    },
  });

  const updateComponent = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      catalogApi.updateComponentDefinition(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog', 'components'] });
      onClose();
    },
  });

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    componentKey: '',
    configuration: {},
    isActive: true,
  });

  const [selectedProvider, setSelectedProvider] = useState<any>(null);
  const [configErrors, setConfigErrors] = useState<string[]>([]);

  useEffect(() => {
    if (component) {
      setFormData({
        name: component.name,
        description: component.description,
        componentKey: component.componentKey,
        configuration: component.configuration,
        isActive: component.isActive,
      });

      const provider = (providers as { componentKey: string }[])?.find(
        (p) => p.componentKey === (component as { componentKey: string }).componentKey,
      );
      if (provider) {
        setSelectedProvider(provider);
      }
    }
  }, [component, providers]);

  const handleProviderChange = (providerKey: string) => {
    const provider = (providers as { componentKey: string }[])?.find((p) => p.componentKey === providerKey);
    setSelectedProvider(provider);
    setFormData(prev => ({
      ...prev,
      componentKey: providerKey,
      configuration: {},
    }));
  };

  const validateConfiguration = () => {
    const errors: string[] = [];
    if (!selectedProvider?.metadata) return errors;

    const { requiredConfigFields } = selectedProvider.metadata;
    requiredConfigFields.forEach(field => {
      if (!(field in formData.configuration)) {
        errors.push(`Missing required field: ${field}`);
      }
    });

    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const errors = validateConfiguration();
    if (errors.length > 0) {
      setConfigErrors(errors);
      return;
    }

    if (componentId) {
      updateComponent.mutate({
        id: componentId,
        data: formData,
      });
    } else {
      createComponent.mutate(formData as Record<string, unknown>);
    }
  };

  if (isLoadingComponent) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Information */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            rows={3}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Provider</label>
          <select
            value={formData.componentKey}
            onChange={(e) => handleProviderChange(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            required
            disabled={!!componentId}
          >
            <option value="">Select a provider</option>
            {providers?.map((provider) => (
              <option key={provider.componentKey} value={provider.componentKey}>
                {provider.name} (v{provider.version})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={formData.isActive}
              onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700">Active</span>
          </label>
        </div>
      </div>

      {/* Provider Configuration */}
      {selectedProvider && (
        <div className="space-y-4 border-t border-gray-200 pt-6">
          <h3 className="text-lg font-medium text-gray-900">Provider Configuration</h3>
          
          {selectedProvider.metadata?.requiredConfigFields.map((field: string) => (
            <div key={field}>
              <label className="block text-sm font-medium text-gray-700">
                {field}
                <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.configuration[field] || ''}
                onChange={(e) =>
                  setFormData(prev => ({
                    ...prev,
                    configuration: {
                      ...prev.configuration,
                      [field]: e.target.value,
                    },
                  }))
                }
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>
          ))}

          {selectedProvider.metadata?.optionalConfigFields.map((field: string) => (
            <div key={field}>
              <label className="block text-sm font-medium text-gray-700">{field}</label>
              <input
                type="text"
                value={formData.configuration[field] || ''}
                onChange={(e) =>
                  setFormData(prev => ({
                    ...prev,
                    configuration: {
                      ...prev.configuration,
                      [field]: e.target.value,
                    },
                  }))
                }
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          ))}
        </div>
      )}

      {/* Validation Errors */}
      {configErrors.length > 0 && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                Configuration Errors
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <ul className="list-disc space-y-1 pl-5">
                  {configErrors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Form Actions */}
      <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={createComponent.isPending || updateComponent.isPending}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {createComponent.isPending || updateComponent.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : componentId ? (
            'Update Component'
          ) : (
            'Create Component'
          )}
        </button>
      </div>
    </form>
  );
}; 