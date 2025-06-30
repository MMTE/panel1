import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCartStore } from '../../store/cartStore';
import { 
  TrashIcon, 
  ArrowLeftIcon,
  ShoppingCartIcon,
  CreditCardIcon
} from '@heroicons/react/24/outline';

export function CartPage() {
  const navigate = useNavigate();
  const { items, removeItem, getTotal } = useCartStore();
  const totals = getTotal();

  const formatPrice = (price: string | number) => {
    const amount = typeof price === 'string' ? parseFloat(price) : price;
    return amount.toFixed(2);
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <ShoppingCartIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h2 className="mt-2 text-lg font-medium text-gray-900">Your cart is empty</h2>
            <p className="mt-1 text-sm text-gray-500">Start adding some products to your cart!</p>
            <div className="mt-6">
              <button
                onClick={() => navigate('/')}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <ArrowLeftIcon className="mr-2 h-4 w-4" />
                Continue Shopping
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="lg:grid lg:grid-cols-12 lg:gap-x-12 lg:items-start">
          <div className="lg:col-span-7">
            <div className="bg-white shadow sm:rounded-lg overflow-hidden">
              <div className="px-4 py-5 sm:p-6">
                <h2 className="text-lg leading-6 font-medium text-gray-900">Shopping Cart</h2>
                <div className="mt-6 divide-y divide-gray-200">
                  {items.map((item) => (
                    <div key={item.productId} className="py-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-medium text-gray-900">{item.productName}</h3>
                          <div className="mt-1 flex items-center text-sm text-gray-500">
                            <span>{item.planName}</span>
                            <span className="mx-2">&middot;</span>
                            <span>Billed {item.interval.toLowerCase()}</span>
                          </div>
                        </div>
                        <div className="ml-4 flex-shrink-0">
                          <button
                            onClick={() => removeItem(item.productId)}
                            className="inline-flex items-center p-1 border border-transparent rounded-full shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 flex justify-between text-sm font-medium">
                        <p className="text-gray-600">Base Price</p>
                        <p className="text-gray-900">${formatPrice(item.basePrice)}</p>
                      </div>
                      {parseFloat(item.setupFee) > 0 && (
                        <div className="mt-1 flex justify-between text-sm font-medium">
                          <p className="text-gray-600">Setup Fee</p>
                          <p className="text-gray-900">${formatPrice(item.setupFee)}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={() => navigate('/')}
                className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <ArrowLeftIcon className="mr-2 h-4 w-4" />
                Continue Shopping
              </button>
            </div>
          </div>

          <div className="mt-10 lg:mt-0 lg:col-span-5">
            <div className="bg-white shadow sm:rounded-lg overflow-hidden">
              <div className="px-4 py-5 sm:p-6">
                <h2 className="text-lg leading-6 font-medium text-gray-900">Order Summary</h2>
                <dl className="mt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <dt className="text-sm text-gray-600">Recurring Total</dt>
                    <dd className="text-sm font-medium text-gray-900">${formatPrice(totals.baseTotal)}</dd>
                  </div>
                  {totals.setupTotal > 0 && (
                    <div className="flex items-center justify-between">
                      <dt className="text-sm text-gray-600">One-time Setup Fees</dt>
                      <dd className="text-sm font-medium text-gray-900">${formatPrice(totals.setupTotal)}</dd>
                    </div>
                  )}
                  <div className="border-t border-gray-200 pt-4 flex items-center justify-between">
                    <dt className="text-base font-medium text-gray-900">Initial Payment</dt>
                    <dd className="text-base font-medium text-gray-900">
                      ${formatPrice(totals.baseTotal + totals.setupTotal)}
                    </dd>
                  </div>
                </dl>

                <div className="mt-6">
                  <button
                    onClick={() => navigate('/checkout')}
                    className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <CreditCardIcon className="mr-2 h-4 w-4" />
                    Proceed to Checkout
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 