import React, { useState, useEffect } from 'react';
import { trpc } from '../../../../api/trpc';
import { Plus, Trash2, Loader, CheckCircle, AlertCircle } from 'lucide-react';

interface ComponentRegistrationFormProps {
  initialData?: any;
  onSave: (data: ComponentRegistrationData) => void;
  onCancel: () => void;
  isSaving?: boolean;
}

interface ComponentRegistrationData {
  componentKey: string;
  name: string;
  description: string;
  type: 'HOSTING' | 'DOMAIN' | 'SSL' | 'EMAIL' | 'DATABASE' | 'STORAGE' | 'BANDWIDTH' | 'CPU' | 'RAM' | 'BACKUP' | 'OTHER';
  provisioningRequired: boolean;
  provisioningProvider?: string;
  supportedPricingModels: ('FIXED' | 'PER_UNIT' | 'TIERED' | 'VOLUME' | 'USAGE_BASED')[];
  usageTrackingSupported: boolean;
  requiredConfigFields: string[];
  optionalConfigFields: string[];
  configFieldTypes: Record<string, 'string' | 'number' | 'boolean' | 'select' | 'array'>;
  configFieldOptions: Record<string, Array<{value: string, label: string}>>;
  defaultConfiguration: Record<string, any>;
  tags: string[];
  icon?: string;
  isActive: boolean;
}

export const ComponentRegistrationForm: React.FC<ComponentRegistrationFormProps> = ({
  initialData,
  onSave,
  onCancel,
  isSaving = false
}) => {
  const [formData, setFormData] = useState<ComponentRegistrationData>(initialData || {
    componentKey: '',
    name: '',
    description: '',
    type: 'HOSTING',
    provisioningRequired: true,
    provisioningProvider: '',
    supportedPricingModels: ['FIXED'],
    usageTrackingSupported: false,
    requiredConfigFields: [],
    optionalConfigFields: [],
    configFieldTypes: {},
    configFieldOptions: {},
    defaultConfiguration: {},
    tags: [],
    icon: '',
    isActive: true,
  });

  const [newRequiredField, setNewRequiredField] = useState('');
  const [newOptionalField, setNewOptionalField] = useState('');
  const [newTag, setNewTag] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const addRequiredField = () => {
    if (newRequiredField && !formData.requiredConfigFields.includes(newRequiredField)) {
      setFormData(prev => ({
        ...prev,
        requiredConfigFields: [...prev.requiredConfigFields, newRequiredField]
      }));
      setNewRequiredField('');
    }
  };

  const removeRequiredField = (field: string) => {
    setFormData(prev => ({
      ...prev,
      requiredConfigFields: prev.requiredConfigFields.filter(f => f !== field)
    }));
  };

  const addOptionalField = () => {
    if (newOptionalField && !formData.optionalConfigFields.includes(newOptionalField)) {
      setFormData(prev => ({
        ...prev,
        optionalConfigFields: [...prev.optionalConfigFields, newOptionalField]
      }));
      setNewOptionalField('');
    }
  };

  const removeOptionalField = (field: string) => {
    setFormData(prev => ({
      ...prev,
      optionalConfigFields: prev.optionalConfigFields.filter(f => f !== field)
    }));
  };

  const addTag = () => {
    if (newTag && !formData.tags.includes(newTag)) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, newTag]
      }));
      setNewTag('');
    }
  };

  const removeTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag)
    }));
  };

  const togglePricingModel = (model: 'FIXED' | 'PER_UNIT' | 'TIERED' | 'VOLUME' | 'USAGE_BASED') => {
    setFormData(prev => ({
      ...prev,
      supportedPricingModels: prev.supportedPricingModels.includes(model)
        ? prev.supportedPricingModels.filter(m => m !== model)
        : [...prev.supportedPricingModels, model]
    }));
  };

  const setFieldType = (fieldName: string, type: 'string' | 'number' | 'boolean' | 'select' | 'array') => {
    setFormData(prev => ({
      ...prev,
      configFieldTypes: {
        ...prev.configFieldTypes,
        [fieldName]: type
      }
    }));
  };

  const allConfigFields = [...formData.requiredConfigFields, ...formData.optionalConfigFields];

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Basic Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Basic Information</h3>
        
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Component Key *
            </label>
            <input
              type="text"
              value={formData.componentKey}
              onChange={e => setFormData(prev => ({ ...prev, componentKey: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') }))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
              placeholder="hosting_cpanel"
              required
              disabled={!!initialData}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
              placeholder="cPanel Hosting"
              required
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Description *</label>
            <textarea
              value={formData.description}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={3}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
              placeholder="Describe what this component provides..."
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Type *</label>
            <select
              value={formData.type}
              onChange={e => setFormData(prev => ({ ...prev, type: e.target.value as any }))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
              required
            >
              <option value="HOSTING">Hosting</option>
              <option value="DOMAIN">Domain</option>
              <option value="SSL">SSL Certificate</option>
              <option value="EMAIL">Email</option>
              <option value="DATABASE">Database</option>
              <option value="STORAGE">Storage</option>
              <option value="BANDWIDTH">Bandwidth</option>
              <option value="CPU">CPU</option>
              <option value="RAM">RAM</option>
              <option value="BACKUP">Backup</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Icon URL</label>
            <input
              type="url"
              value={formData.icon || ''}
              onChange={e => setFormData(prev => ({ ...prev, icon: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
              placeholder="https://example.com/icon.svg"
            />
          </div>
        </div>
      </div>

      {/* Provisioning Settings */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Provisioning Settings</h3>
        
        <div className="space-y-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.provisioningRequired}
              onChange={e => setFormData(prev => ({ ...prev, provisioningRequired: e.target.checked }))}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="ml-2 text-sm text-gray-700">Provisioning Required</span>
          </label>

          {formData.provisioningRequired && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Provisioning Provider</label>
              <input
                type="text"
                value={formData.provisioningProvider || ''}
                onChange={e => setFormData(prev => ({ ...prev, provisioningProvider: e.target.value }))}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
                placeholder="cpanel, plesk, custom_provider"
              />
            </div>
          )}

          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.usageTrackingSupported}
              onChange={e => setFormData(prev => ({ ...prev, usageTrackingSupported: e.target.checked }))}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="ml-2 text-sm text-gray-700">Usage Tracking Supported</span>
          </label>
        </div>
      </div>

      {/* Supported Pricing Models */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Supported Pricing Models</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {['FIXED', 'PER_UNIT', 'TIERED', 'VOLUME', 'USAGE_BASED'].map(model => (
            <label key={model} className="flex items-center">
              <input
                type="checkbox"
                checked={formData.supportedPricingModels.includes(model as any)}
                onChange={() => togglePricingModel(model as any)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">{model.replace('_', ' ')}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Configuration Fields */}
      <div className="space-y-6">
        <h3 className="text-lg font-medium text-gray-900">Configuration Fields</h3>
        
        {/* Required Fields */}
        <div className="space-y-4">
          <h4 className="text-md font-medium text-gray-800">Required Fields</h4>
          <div className="flex space-x-2">
            <input
              type="text"
              value={newRequiredField}
              onChange={e => setNewRequiredField(e.target.value)}
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
              placeholder="domain, diskSpace, bandwidth..."
            />
            <button
              type="button"
              onClick={addRequiredField}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {formData.requiredConfigFields.map(field => (
              <span key={field} className="inline-flex items-center px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm">
                {field}
                <button
                  type="button"
                  onClick={() => removeRequiredField(field)}
                  className="ml-2 hover:text-red-600"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Optional Fields */}
        <div className="space-y-4">
          <h4 className="text-md font-medium text-gray-800">Optional Fields</h4>
          <div className="flex space-x-2">
            <input
              type="text"
              value={newOptionalField}
              onChange={e => setNewOptionalField(e.target.value)}
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
              placeholder="autoRenew, privacyProtection..."
            />
            <button
              type="button"
              onClick={addOptionalField}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {formData.optionalConfigFields.map(field => (
              <span key={field} className="inline-flex items-center px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm">
                {field}
                <button
                  type="button"
                  onClick={() => removeOptionalField(field)}
                  className="ml-2 hover:text-gray-600"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Field Types */}
        {allConfigFields.length > 0 && (
          <div className="space-y-4">
            <h4 className="text-md font-medium text-gray-800">Field Types</h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {allConfigFields.map(field => (
                <div key={field} className="flex items-center space-x-3">
                  <span className="text-sm text-gray-700 min-w-0 flex-1">{field}</span>
                  <select
                    value={formData.configFieldTypes[field] || 'string'}
                    onChange={e => setFieldType(field, e.target.value as any)}
                    className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="string">String</option>
                    <option value="number">Number</option>
                    <option value="boolean">Boolean</option>
                    <option value="select">Select</option>
                    <option value="array">Array</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tags */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Tags</h3>
        <div className="flex space-x-2">
          <input
            type="text"
            value={newTag}
            onChange={e => setNewTag(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500"
            placeholder="hosting, cpanel, linux..."
          />
          <button
            type="button"
            onClick={addTag}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {formData.tags.map(tag => (
            <span key={tag} className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="ml-2 hover:text-blue-600"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Status */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Status</h3>
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={formData.isActive}
            onChange={e => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="ml-2 text-sm text-gray-700">Active</span>
        </label>
      </div>

      {/* Form Actions */}
      <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
        >
          {isSaving && <Loader className="w-4 h-4 mr-2 animate-spin" />}
          {isSaving ? 'Saving...' : (initialData ? 'Update Component' : 'Register Component')}
        </button>
      </div>
    </form>
  );
}; 