import React, { useState } from 'react';
import { Plus, Edit, Trash2, Package, Eye, Settings, X, Loader, AlertCircle, CheckCircle } from 'lucide-react';
import { trpc as api } from '../../../api/trpc';
import { ProductBuilder, ProductFormData } from './components/ProductBuilder';
import { ProductPreview } from './components/ProductPreview';

// Notification component
interface NotificationProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
}

const Notification: React.FC<NotificationProps> = ({ message, type, onClose }) => {
  const bgColor = {
    success: 'bg-green-50 border-green-200',
    error: 'bg-red-50 border-red-200',
    info: 'bg-blue-50 border-blue-200'
  }[type];

  const textColor = {
    success: 'text-green-800',
    error: 'text-red-800',
    info: 'text-blue-800'
  }[type];

  const Icon = {
    success: CheckCircle,
    error: AlertCircle,
    info: AlertCircle
  }[type];

  return (
    <div className={`fixed top-4 right-4 z-50 p-4 border rounded-lg shadow-lg ${bgColor} ${textColor} max-w-md`}>
      <div className="flex items-center">
        <Icon className="w-5 h-5 mr-2" />
        <span className="flex-1">{message}</span>
        <button onClick={onClose} className="ml-2 hover:opacity-75">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

const ProductsManagement: React.FC = () => {
  // Fetch products from the API
  const { 
    data: products, 
    isLoading, 
    error,
    refetch 
  } = api.catalog.listProducts.useQuery({
    isActive: true
  });

  // Get tRPC utils for cache invalidation
  const utils = api.useUtils();

  // Delete product mutation
  const deleteProduct = api.catalog.deleteProduct.useMutation({
    onSuccess: () => {
      utils.catalog.listProducts.invalidate();
      showNotification('Product deleted successfully', 'success');
    },
    onError: (error) => {
      console.error('Failed to delete product:', error);
      showNotification('Failed to delete product: ' + error.message, 'error');
    }
  });

  // Create product mutation
  const createProduct = api.catalog.createProduct.useMutation({
    onSuccess: () => {
      utils.catalog.listProducts.invalidate();
      setShowCreateModal(false);
      setEditingProduct(null);
      showNotification('Product created successfully', 'success');
    },
    onError: (error) => {
      console.error('Failed to create product:', error);
      showNotification('Failed to create product: ' + error.message, 'error');
    }
  });

  // Update product mutation
  const updateProduct = api.catalog.updateProduct.useMutation({
    onSuccess: () => {
      utils.catalog.listProducts.invalidate();
      setShowCreateModal(false);
      setEditingProduct(null);
      showNotification('Product updated successfully', 'success');
    },
    onError: (error) => {
      console.error('Failed to update product:', error);
      showNotification('Failed to update product: ' + error.message, 'error');
    }
  });

  // State management
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [previewData, setPreviewData] = useState<ProductFormData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  const filteredProducts = products ? (selectedCategory === 'all' 
    ? products 
    : products.filter(product => product.category === selectedCategory)) : [];

  const categories = ['all', 'hosting', 'addons', 'domains', 'ssl'];

  // Notification helper
  const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  // Form validation
  const validateFormData = (data: ProductFormData): string[] => {
    const errors: string[] = [];
    
    if (!data.name.trim()) errors.push('Product name is required');
    if (!data.category) errors.push('Category is required');
    if (!data.shortDescription?.trim()) errors.push('Short description is required');
    if (data.components.length === 0) errors.push('At least one component is required');
    if (data.billingPlans.length === 0) errors.push('At least one billing plan is required');
    
    // Validate component configurations
    data.components.forEach((component, index) => {
      if (!component.componentId) {
        errors.push(`Component ${index + 1}: Component selection is required`);
      }
      if (!component.pricing) {
        errors.push(`Component ${index + 1}: Pricing model is required`);
      }
      if (!component.unitPrice || parseFloat(component.unitPrice) <= 0) {
        errors.push(`Component ${index + 1}: Valid unit price is required`);
      }
    });
    
    // Validate billing plans
    data.billingPlans.forEach((plan, index) => {
      if (!plan.name.trim()) {
        errors.push(`Billing plan ${index + 1}: Name is required`);
      }
      if (!plan.basePrice || parseFloat(plan.basePrice) < 0) {
        errors.push(`Billing plan ${index + 1}: Valid base price is required`);
      }
      if (!plan.interval) {
        errors.push(`Billing plan ${index + 1}: Billing interval is required`);
      }
    });
    
    return errors;
  };

  const handleSaveProduct = async (data: ProductFormData) => {
    try {
      setIsSaving(true);
      
      // Validate form data
      const validationErrors = validateFormData(data);
      if (validationErrors.length > 0) {
        showNotification(validationErrors[0], 'error');
        return;
      }

      // Format the product data to match the API schema
      const productData = {
        name: data.name,
        description: data.description,
        shortDescription: data.shortDescription,
        category: data.category,
        tags: data.tags,
        isActive: data.isActive,
        isPublic: data.isPublic,
        sortOrder: data.sortOrder,
        trialPeriodDays: data.trialPeriodDays,
        setupRequired: data.setupRequired,
        components: data.components.map(component => ({
          componentId: component.componentId,
          pricing: component.pricing,
          unitPrice: component.unitPrice || '0.00',
          includedUnits: component.includedUnits || 0,
          configuration: component.configuration || {},
          tiers: component.tiers || []
        })),
        billingPlans: data.billingPlans.map(plan => ({
          name: plan.name,
          basePrice: plan.basePrice,
          interval: plan.interval,
          setupFee: plan.setupFee || '0.00'
        }))
      };

      if (editingProduct) {
        // Update existing product
        await api.catalog.updateProduct.mutate({
          id: editingProduct.id,
          data: productData
        });
      } else {
        // Create new product
        await api.catalog.createProduct.mutate(productData);
      }

      // Refresh the products list
      await utils.catalog.listProducts.invalidate();
      
      // Close the modal and show success message
      setShowCreateModal(false);
      setEditingProduct(null);
      showNotification(
        editingProduct ? 'Product updated successfully' : 'Product created successfully',
        'success'
      );
    } catch (error) {
      console.error('Failed to save product:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save product';
      showNotification(errorMessage, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProduct = (productId: string) => {
    if (window.confirm('Are you sure you want to archive this product? Archived products will no longer be available for purchase but existing subscriptions will remain active.')) {
      // Instead of deleting, we'll set isActive to false (soft delete)
      updateProduct.mutate({ 
        id: productId, 
        data: { isActive: false } 
      });
    }
  };

  const getPricingModelBadge = (pricing: string) => {
    const colors = {
      FIXED: 'bg-blue-100 text-blue-800',
      PER_UNIT: 'bg-green-100 text-green-800',
      TIERED: 'bg-purple-100 text-purple-800',
      VOLUME: 'bg-orange-100 text-orange-800',
      USAGE_BASED: 'bg-red-100 text-red-800'
    };
    
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[pricing as keyof typeof colors] || 'bg-gray-100 text-gray-800'}`}>
        {pricing.replace('_', ' ')}
      </span>
    );
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Products</h1>
            <p className="text-gray-600 mt-1">
              Manage your marketable product packages
            </p>
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader className="w-8 h-8 text-blue-600 animate-spin" />
          <span className="ml-3 text-gray-600">Loading products...</span>
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
            <h1 className="text-2xl font-bold text-gray-900">Products</h1>
            <p className="text-gray-600 mt-1">
              Manage your marketable product packages
            </p>
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Products</h3>
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
      {/* Notification */}
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-gray-600 mt-1">
            Manage your marketable product packages
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Product
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-700">Filter by category:</span>
          <div className="flex gap-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                  selectedCategory === category
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredProducts.map((product) => (
          <div key={product.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            {/* Product Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Package className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{product.name}</h3>
                  <p className="text-sm text-gray-600">{product.shortDescription}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${product.isActive ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-xs text-gray-500">{product.isActive ? 'Active' : 'Inactive'}</span>
              </div>
            </div>

            {/* Product Details */}
            <div className="space-y-3 mb-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Category</p>
                <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full">
                  {product.category}
                </span>
              </div>

              <div>
                <p className="text-sm text-gray-600 mb-1">Tags</p>
                <div className="flex flex-wrap gap-1">
                  {product.tags.map((tag) => (
                    <span key={tag} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-600 mb-1">Components ({product.components.length})</p>
                <div className="space-y-1">
                  {product.components.map((component, index) => (
                    <div key={index} className="flex items-center justify-between text-xs">
                      <span className="text-gray-700">{component.name}</span>
                      {getPricingModelBadge(component.pricing)}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-600 mb-1">Billing Plans ({product.billingPlans.length})</p>
                <div className="space-y-1">
                  {product.billingPlans.map((plan, index) => (
                    <div key={index} className="flex items-center justify-between text-xs">
                      <span className="text-gray-700">{plan.name}</span>
                      <span className="font-medium">${plan.basePrice}/{plan.interval.toLowerCase()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <div className="flex items-center gap-2">
                <button className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                  <Eye className="h-4 w-4" />
                </button>
                <button 
                  onClick={() => {
                    setEditingProduct(product);
                    setShowCreateModal(true);
                  }}
                  className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                >
                  <Edit className="h-4 w-4" />
                </button>
                <button className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors">
                  <Settings className="h-4 w-4" />
                </button>
                <button 
                  onClick={() => handleDeleteProduct(product.id)}
                  disabled={deleteProduct.isLoading}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="text-xs text-gray-500">
                Sort: {product.sortOrder}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredProducts.length === 0 && (
        <div className="text-center py-12">
          <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No products found</h3>
          <p className="text-gray-600 mb-4">
            {selectedCategory === 'all' 
              ? "You haven't created any products yet." 
              : `No products found in the "${selectedCategory}" category.`
            }
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Create Your First Product
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
                  {editingProduct ? 'Edit Product' : 'Create New Product'}
                </h2>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingProduct(null);
                    setPreviewData(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6">
              <ProductBuilder
                initialData={editingProduct}
                onSave={handleSaveProduct}
                onCancel={() => {
                  setShowCreateModal(false);
                  setEditingProduct(null);
                  setPreviewData(null);
                }}
                onFormChange={setPreviewData}
                isSaving={isSaving}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductsManagement; 