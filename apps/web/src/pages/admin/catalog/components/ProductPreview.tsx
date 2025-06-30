import React from 'react';
import { Package, CheckCircle, XCircle } from 'lucide-react';
import { ProductFormData } from './ProductBuilder';

export const ProductPreview: React.FC<{
  productData: ProductFormData;
}> = ({ productData }) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg">
            <Package className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{productData.name || 'Untitled Product'}</h3>
            <p className="text-sm text-gray-600">{productData.shortDescription}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${productData.isActive ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-xs text-gray-500">{productData.isActive ? 'Active' : 'Inactive'}</span>
        </div>
      </div>

      <div className="space-y-3 mb-4">
        <div>
          <p className="text-sm text-gray-600 mb-1">Category</p>
          <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full">
            {productData.category}
          </span>
        </div>

        <div>
          <p className="text-sm text-gray-600 mb-1">Tags</p>
          <div className="flex flex-wrap gap-1">
            {productData.tags.map((tag) => (
              <span key={tag} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm text-gray-600 mb-1">Components ({productData.components.length})</p>
          <div className="space-y-1">
            {productData.components.map((component, index) => (
              <div key={index} className="flex items-center justify-between text-xs">
                <span className="text-gray-700">{component.componentId || 'N/A'}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm text-gray-600 mb-1">Billing Plans ({productData.billingPlans.length})</p>
          <div className="space-y-1">
            {productData.billingPlans.map((plan, index) => (
              <div key={index} className="flex items-center justify-between text-xs">
                <span className="text-gray-700">{plan.name}</span>
                <span className="font-medium">${plan.basePrice}/{plan.interval.toLowerCase()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

       <div className="flex items-center justify-between pt-4 border-t border-gray-200 text-xs text-gray-500">
        <span>Public: {productData.isPublic ? <CheckCircle className="inline h-4 w-4 text-green-500" /> : <XCircle className="inline h-4 w-4 text-red-500" />}</span>
        <span>Setup Required: {productData.setupRequired ? <CheckCircle className="inline h-4 w-4 text-green-500" /> : <XCircle className="inline h-4 w-4 text-red-500" />}</span>
        <span>Trial: {productData.trialPeriodDays || 0} days</span>
      </div>
    </div>
  );
}; 