import React, { useState } from 'react';
import { trpc } from '../../api/trpc';
import { useNavigate } from 'react-router-dom';
import { 
  ShoppingCartIcon, 
  CheckIcon, 
  CurrencyDollarIcon,
  ClockIcon,
  TagIcon
} from '@heroicons/react/24/outline';
import { useCartStore } from '../../store/cartStore';

interface Product {
  id: string;
  name: string;
  description?: string;
  shortDescription?: string;
  category?: string;
  tags?: string[];
  productComponents: Array<{
    id: string;
    pricingModel: string;
    pricingDetails: any;
    componentDefinition: {
      id: string;
      name: string;
      description?: string;
      type: string;
    };
  }>;
  billingPlans: Array<{
    id: string;
    name: string;
    description?: string;
    interval: string;
    basePrice: string;
    setupFee: string;
    isDefault: boolean;
  }>;
}

export function ProductStorePage() {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const addToCart = useCartStore((state) => state.addItem);
  const cartItems = useCartStore((state) => state.items);
  
  const { data: products, isLoading, error } = trpc.catalog.listPublicProducts.useQuery();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Error Loading Products</h2>
          <p className="text-gray-600">{error.message}</p>
        </div>
      </div>
    );
  }

  const categories = ['all', ...new Set(products?.map(p => p.category).filter(Boolean) || [])];

  const filteredProducts = products?.filter(product => 
    selectedCategory === 'all' || product.category === selectedCategory
  ) || [];

  const formatPrice = (price: string, interval: string) => {
    const amount = parseFloat(price);
    const intervalText = interval.toLowerCase().replace('ly', '');
    return `$${amount.toFixed(2)}/${intervalText}`;
  };

  const handleOrderProduct = (product: Product, billingPlan: any) => {
    addToCart({
      productId: product.id,
      productName: product.name,
      planId: billingPlan.id,
      planName: billingPlan.name,
      basePrice: billingPlan.basePrice,
      setupFee: billingPlan.setupFee,
      interval: billingPlan.interval,
    });
    navigate('/cart');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-gray-900">Our Products</h1>
            <p className="mt-2 text-gray-600">Choose the perfect solution for your needs</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Category Filter */}
        <div className="mb-8">
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  selectedCategory === category
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
                }`}
              >
                {category === 'all' ? 'All Products' : category.charAt(0).toUpperCase() + category.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredProducts.map((product) => (
            <div key={product.id} className="bg-white rounded-lg shadow-lg overflow-hidden">
              {/* Product Header */}
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-bold text-gray-900">{product.name}</h3>
                  {product.category && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      <TagIcon className="w-3 h-3 mr-1" />
                      {product.category}
                    </span>
                  )}
                </div>
                
                {product.shortDescription && (
                  <p className="text-gray-600 text-sm mb-3">{product.shortDescription}</p>
                )}

                {product.description && (
                  <p className="text-gray-700 text-sm">{product.description}</p>
                )}
              </div>

              {/* Features/Components */}
              <div className="p-6 border-b border-gray-200">
                <h4 className="text-sm font-medium text-gray-900 mb-3">Included Features</h4>
                <ul className="space-y-2">
                  {product.productComponents.map((component) => (
                    <li key={component.id} className="flex items-start">
                      <CheckIcon className="w-4 h-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                      <div>
                        <span className="text-sm text-gray-900">{component.componentDefinition.name}</span>
                        {component.componentDefinition.description && (
                          <p className="text-xs text-gray-500 mt-1">{component.componentDefinition.description}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Billing Plans */}
              <div className="p-6">
                <h4 className="text-sm font-medium text-gray-900 mb-3">Pricing Options</h4>
                <div className="space-y-3">
                  {product.billingPlans.map((plan) => (
                    <div
                      key={plan.id}
                      className={`border rounded-lg p-4 ${
                        plan.isDefault ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h5 className="font-medium text-gray-900">{plan.name}</h5>
                          {plan.description && (
                            <p className="text-xs text-gray-500">{plan.description}</p>
                          )}
                        </div>
                        {plan.isDefault && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            Popular
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center">
                            <CurrencyDollarIcon className="w-4 h-4 text-gray-400 mr-1" />
                            <span className="text-lg font-bold text-gray-900">
                              {formatPrice(plan.basePrice, plan.interval)}
                            </span>
                          </div>
                          {parseFloat(plan.setupFee) > 0 && (
                            <p className="text-xs text-gray-500 mt-1">
                              + ${parseFloat(plan.setupFee).toFixed(2)} setup fee
                            </p>
                          )}
                        </div>
                        
                        <button
                          onClick={() => handleOrderProduct(product, plan)}
                          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                        >
                          <ShoppingCartIcon className="w-4 h-4 mr-2" />
                          Order Now
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredProducts.length === 0 && (
          <div className="text-center py-12">
            <h3 className="text-lg font-medium text-gray-900 mb-2">No products found</h3>
            <p className="text-gray-600">Try selecting a different category or check back later.</p>
          </div>
        )}
      </div>
    </div>
  );
}