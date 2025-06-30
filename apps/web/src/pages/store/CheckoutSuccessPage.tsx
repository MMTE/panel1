import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircleIcon, EnvelopeIcon } from '@heroicons/react/24/outline';

export function CheckoutSuccessPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { clientId, email } = location.state || {};

  if (!clientId || !email) {
    navigate('/');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="text-center">
            <CheckCircleIcon className="mx-auto h-12 w-12 text-green-500" />
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              Order Confirmed!
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Thank you for your purchase. We've sent a confirmation email to:
            </p>
            <p className="mt-2 text-center text-lg font-medium text-gray-900 flex items-center justify-center">
              <EnvelopeIcon className="h-5 w-5 mr-2 text-gray-400" />
              {email}
            </p>
          </div>

          <div className="mt-6">
            <div className="rounded-md bg-green-50 p-4">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-green-800">
                    What happens next?
                  </h3>
                  <div className="mt-2 text-sm text-green-700">
                    <ul className="list-disc pl-5 space-y-1">
                      <li>You'll receive an email with your order details</li>
                      <li>Our team will process your order</li>
                      <li>You'll get access to your client portal</li>
                      <li>We'll help you get started with your new services</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <button
              onClick={() => navigate('/client/dashboard')}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 