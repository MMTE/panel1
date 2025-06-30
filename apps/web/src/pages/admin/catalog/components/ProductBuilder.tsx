import React, { useState, useEffect } from 'react';
import { trpc } from '../../../../api/trpc';
import { Plus, Trash2, Loader } from 'lucide-react';
import { DynamicConfigForm } from './DynamicConfigForm';

interface BillingPlan {
  name: string;
  basePrice: string;
  interval: 'MONTHLY' | 'YEARLY' | 'QUARTERLY';
  setupFee?: string;
}

interface ComponentConfig {
  componentId: string;
  pricing: 'FIXED' | 'PER_UNIT' | 'TIERED' | 'VOLUME' | 'USAGE_BASED';
  unitPrice?: string;
  includedUnits?: number;
  configuration?: Record<string, any>;
  tiers?: Array<{
    from: number;
    to: number | null;
    price: string;
  }>;
}

export interface ProductFormData {
  name: string;
  description: string;
  shortDescription: string;
  category: string;
  tags: string[];
  isActive: boolean;
  isPublic: boolean;
  sortOrder: number;
  trialPeriodDays?: number;
  setupRequired: boolean;
  components: ComponentConfig[];
  billingPlans: BillingPlan[];
}

export const ProductBuilder: React.FC<{
  initialData?: any;
  onSave: (data: ProductFormData) => void;
  onCancel: () => void;
  onFormChange: (data: ProductFormData) => void;
  isSaving?: boolean;
}> = ({ initialData, onSave, onCancel, onFormChange, isSaving = false }) => {
  const { data: components } = trpc.catalog.listComponents.useQuery();
  
  const [formData, setFormData] = useState<ProductFormData>({
    name: '',
    description: '',
    shortDescription: '',
    category: 'hosting',
    tags: [],
    isActive: true,
    isPublic: true,
    sortOrder: 0,
    setupRequired: false,
    components: [],
    billingPlans: [
      {
        name: 'Monthly',
        basePrice: '0.00',
        interval: 'MONTHLY'
      }
    ]
  });

  // Update form data when initialData changes (for editing)
  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || '',
        description: initialData.description || '',
        shortDescription: initialData.shortDescription || '',
        category: initialData.category || 'hosting',
        tags: initialData.tags || [],
        isActive: initialData.isActive !== undefined ? initialData.isActive : true,
        isPublic: initialData.isPublic !== undefined ? initialData.isPublic : true,
        sortOrder: initialData.sortOrder || 0,
        trialPeriodDays: initialData.trialPeriodDays,
        setupRequired: initialData.setupRequired || false,
        components: initialData.components || [],
        billingPlans: initialData.billingPlans || [
          {
            name: 'Monthly',
            basePrice: '0.00',
            interval: 'MONTHLY'
          }
        ]
      });
    }
  }, [initialData]);

  useEffect(() => {
    onFormChange(formData);
  }, [formData, onFormChange]);

  const [newTag, setNewTag] = useState('');

  const handleAddComponent = () => {
    setFormData(prev => ({
      ...prev,
      components: [...prev.components, {
        componentId: '',
        pricing: 'FIXED'
      }]
    }));
  };

  const handleRemoveComponent = (index: number) => {
    setFormData(prev => ({
      ...prev,
      components: prev.components.filter((_, i) => i !== index)
    }));
  };

  const handleComponentChange = (index: number, field: keyof ComponentConfig, value: any) => {
    setFormData(prev => ({
      ...prev,
      components: prev.components.map((comp, i) => 
        i === index ? { ...comp, [field]: value } : comp
      )
    }));
  };

  const handleAddBillingPlan = () => {
    setFormData(prev => ({
      ...prev,
      billingPlans: [...prev.billingPlans, {
        name: '',
        basePrice: '0.00',
        interval: 'MONTHLY'
      }]
    }));
  };

  const handleRemoveBillingPlan = (index: number) => {
    setFormData(prev => ({
      ...prev,
      billingPlans: prev.billingPlans.filter((_, i) => i !== index)
    }));
  };

  const handleBillingPlanChange = (index: number, field: keyof BillingPlan, value: any) => {
    setFormData(prev => ({
      ...prev,
      billingPlans: prev.billingPlans.map((plan, i) => 
        i === index ? { ...plan, [field]: value } : plan
      )
    }));
  };

  const handleAddTag = () => {
    if (newTag && !formData.tags.includes(newTag)) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, newTag]
      }));
      setNewTag('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag)
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Basic Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Basic Information</h3>
        
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Category</label>
            <select
              value={formData.category}
              onChange={e => setFormData(prev => ({ ...prev, category: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="hosting">Hosting</option>
              <option value="domains">Domains</option>
              <option value="ssl">SSL Certificates</option>
              <option value="addons">Add-ons</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Short Description</label>
            <input
              type="text"
              value={formData.shortDescription}
              onChange={e => setFormData(prev => ({ ...prev, shortDescription: e.target.value }))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              required
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Full Description</label>
            <textarea
              value={formData.description}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={4}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">Tags</label>
          <div className="flex flex-wrap gap-2">
            {formData.tags.map(tag => (
              <span
                key={tag}
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="ml-1 text-blue-600 hover:text-blue-800"
                >
                  ×
                </button>
              </span>
            ))}
            <div className="flex items-center">
              <input
                type="text"
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                placeholder="Add tag..."
                className="block w-32 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="ml-2 inline-flex items-center px-2.5 py-1.5 border border-transparent text-xs font-medium rounded text-blue-700 bg-blue-100 hover:bg-blue-200"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Sort Order</label>
            <input
              type="number"
              value={formData.sortOrder}
              onChange={e => setFormData(prev => ({ ...prev, sortOrder: parseInt(e.target.value) }))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Trial Period (Days)</label>
            <input
              type="number"
              value={formData.trialPeriodDays || ''}
              onChange={e => setFormData(prev => ({ ...prev, trialPeriodDays: parseInt(e.target.value) || undefined }))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.isActive}
              onChange={e => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
              className="rounded border-gray-300 text-blue-600"
            />
            <span className="ml-2 text-sm text-gray-700">Active</span>
          </label>

          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.isPublic}
              onChange={e => setFormData(prev => ({ ...prev, isPublic: e.target.checked }))}
              className="rounded border-gray-300 text-blue-600"
            />
            <span className="ml-2 text-sm text-gray-700">Public</span>
          </label>

          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.setupRequired}
              onChange={e => setFormData(prev => ({ ...prev, setupRequired: e.target.checked }))}
              className="rounded border-gray-300 text-blue-600"
            />
            <span className="ml-2 text-sm text-gray-700">Setup Required</span>
          </label>
        </div>
      </div>

      {/* Components */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium text-gray-900">Components</h3>
          <button
            type="button"
            onClick={handleAddComponent}
            className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Component
          </button>
        </div>

        <div className="space-y-4">
          {formData.components.map((component, index) => {
            const selectedComponentDef = components?.find((comp: any) => comp.id === component.componentId);
            
            return (
              <div key={index} className="bg-gray-50 p-4 rounded-lg space-y-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Component</label>
                      <select
                        value={component.componentId}
                        onChange={e => handleComponentChange(index, 'componentId', e.target.value)}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                        required
                      >
                        <option value="">Select a component</option>
                        {components?.map((comp: any) => (
                          <option key={comp.id} value={comp.id}>
                            {comp.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">Pricing Model</label>
                      <select
                        value={component.pricing}
                        onChange={e => handleComponentChange(index, 'pricing', e.target.value)}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                        required
                      >
                        <option value="FIXED">Fixed</option>
                        <option value="PER_UNIT">Per Unit</option>
                        <option value="TIERED">Tiered</option>
                        <option value="VOLUME">Volume</option>
                        <option value="USAGE_BASED">Usage Based</option>
                      </select>
                    </div>

                    {component.pricing !== 'FIXED' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Unit Price</label>
                          <input
                            type="text"
                            value={component.unitPrice || ''}
                            onChange={e => handleComponentChange(index, 'unitPrice', e.target.value)}
                            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700">Included Units</label>
                          <input
                            type="number"
                            value={component.includedUnits || ''}
                            onChange={e => handleComponentChange(index, 'includedUnits', parseInt(e.target.value))}
                            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                          />
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveComponent(index)}
                    className="ml-4 text-gray-400 hover:text-red-600"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>

                {/* Dynamic Configuration Form */}
                {selectedComponentDef && (
                  <div className="mt-4 border-t border-gray-200 pt-4">
                    <DynamicConfigForm
                      componentDefinition={selectedComponentDef}
                      configuration={component.configuration || {}}
                      onChange={(config) => handleComponentChange(index, 'configuration', config)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Billing Plans */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium text-gray-900">Billing Plans</h3>
          <button
            type="button"
            onClick={handleAddBillingPlan}
            className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Plan
          </button>
        </div>

        <div className="space-y-4">
          {formData.billingPlans.map((plan, index) => (
            <div key={index} className="bg-gray-50 p-4 rounded-lg">
              <div className="flex justify-between items-start">
                <div className="flex-1 grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Name</label>
                    <input
                      type="text"
                      value={plan.name}
                      onChange={e => handleBillingPlanChange(index, 'name', e.target.value)}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Base Price</label>
                    <input
                      type="text"
                      value={plan.basePrice}
                      onChange={e => handleBillingPlanChange(index, 'basePrice', e.target.value)}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Interval</label>
                    <select
                      value={plan.interval}
                      onChange={e => handleBillingPlanChange(index, 'interval', e.target.value)}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                      required
                    >
                      <option value="MONTHLY">Monthly</option>
                      <option value="QUARTERLY">Quarterly</option>
                      <option value="YEARLY">Yearly</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Setup Fee</label>
                    <input
                      type="text"
                      value={plan.setupFee || ''}
                      onChange={e => handleBillingPlanChange(index, 'setupFee', e.target.value)}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveBillingPlan(index)}
                  className="ml-4 text-gray-400 hover:text-red-600"
                  disabled={formData.billingPlans.length === 1}
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
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
          {isSaving ? 'Saving...' : 'Save Product'}
        </button>
      </div>
    </form>
  );
};
