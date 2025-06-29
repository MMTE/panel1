import React, { useState } from 'react';
import { 
  CreditCard, 
  Calendar, 
  Lock, 
  CheckCircle, 
  X, 
  Loader,
  DollarSign
} from 'lucide-react';
import { useClientData } from '../../hooks/useClientData';

interface PaymentModalProps {
  invoiceId: string;
  amount: number;
  invoiceNumber: string;
  onClose: () => void;
  onPaymentComplete: () => void;
}

export function PaymentModal({ invoiceId, amount, invoiceNumber, onClose, onPaymentComplete }: PaymentModalProps) {
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  
  const { payInvoice, isPaymentProcessing, paymentError } = useClientData();

  const formatCardNumber = (value: string) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, '');
    
    // Add space after every 4 digits
    const formatted = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
    
    // Limit to 19 characters (16 digits + 3 spaces)
    return formatted.slice(0, 19);
  };

  const formatExpiryDate = (value: string) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, '');
    
    // Format as MM/YY
    if (digits.length > 2) {
      return `${digits.slice(0, 2)}/${digits.slice(2, 4)}`;
    }
    
    return digits;
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCardNumber(formatCardNumber(e.target.value));
  };

  const handleExpiryDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setExpiryDate(formatExpiryDate(e.target.value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (cardNumber.replace(/\s/g, '').length !== 16) {
      return;
    }
    
    if (expiryDate.length !== 5) {
      return;
    }
    
    if (cvv.length < 3) {
      return;
    }
    
    try {
      // Create a simulated payment method ID from card details
      // In a real app, this would be handled by Stripe Elements
      const paymentMethodId = `pm_${cardNumber.replace(/\s/g, '').slice(-4)}_${Date.now()}`;
      
      const success = await payInvoice(invoiceId, paymentMethodId);
      
      if (success) {
        setIsComplete(true);
        
        // Notify parent component after a brief delay to show success message
        setTimeout(() => {
          onPaymentComplete();
        }, 1500);
      }
    } catch (err) {
      console.error('Payment failed:', err);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getErrorMessage = () => {
    if (!paymentError) return null;
    
    if (paymentError.message) {
      return paymentError.message;
    }
    
    return 'Payment processing failed. Please try again.';
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-xl font-bold text-gray-900">Payment</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {!isComplete ? (
            <>
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="flex justify-between mb-2">
                  <span className="text-gray-600">Invoice</span>
                  <span className="font-medium">{invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Amount</span>
                  <span className="font-bold text-gray-900">{formatCurrency(amount)}</span>
                </div>
              </div>

              {paymentError && (
                <div className="bg-red-100 border border-red-200 text-red-800 rounded-lg p-3 mb-4 flex items-center">
                  <X className="w-4 h-4 mr-2 text-red-600" />
                  {getErrorMessage()}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Card Number</label>
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={cardNumber}
                      onChange={handleCardNumberChange}
                      placeholder="1234 5678 9012 3456"
                      className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      maxLength={19}
                      required
                      disabled={isPaymentProcessing}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cardholder Name</label>
                  <input
                    type="text"
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    required
                    disabled={isPaymentProcessing}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        value={expiryDate}
                        onChange={handleExpiryDateChange}
                        placeholder="MM/YY"
                        className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        maxLength={5}
                        required
                        disabled={isPaymentProcessing}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">CVV</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        value={cvv}
                        onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        placeholder="123"
                        className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        maxLength={4}
                        required
                        disabled={isPaymentProcessing}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <Lock className="w-4 h-4 text-gray-400" />
                  <span>Your payment information is secure and encrypted</span>
                </div>

                <button
                  type="submit"
                  disabled={isPaymentProcessing}
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3 rounded-lg font-semibold hover:from-purple-600 hover:to-pink-600 transition-all duration-200 disabled:opacity-70 flex items-center justify-center space-x-2"
                >
                  {isPaymentProcessing ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <DollarSign className="w-5 h-5" />
                      <span>Pay {formatCurrency(amount)}</span>
                    </>
                  )}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Payment Successful!</h3>
              <p className="text-gray-600 mb-6">
                Your payment of {formatCurrency(amount)} for invoice {invoiceNumber} has been processed successfully.
              </p>
              <button
                onClick={onPaymentComplete}
                className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200"
              >
                Continue
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}