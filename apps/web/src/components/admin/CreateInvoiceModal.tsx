import React, { useState } from 'react';
import { 
  X, 
  FileText, 
  Plus,
  Trash2,
  Calendar,
  DollarSign,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { trpc } from '../../api/trpc';
import { useClients } from '../../hooks/useClients';
import { TRPCClientError } from '@trpc/client';

interface CreateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

interface InvoiceFormData {
  clientId: string;
  items: InvoiceItem[];
  tax: number;
  dueDate: string;
  notes?: string;
}

const initialFormData: InvoiceFormData = {
  clientId: '',
  items: [{ description: '', quantity: 1, unitPrice: 0 }],
  tax: 0,
  dueDate: new Date().toISOString().split('T')[0],
  notes: '',
};

type FieldErrors = { [key: string]: string | undefined };

export function CreateInvoiceModal({ isOpen, onClose, onSuccess }: CreateInvoiceModalProps) {
  const [formData, setFormData] = useState<InvoiceFormData>(initialFormData);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { clients } = useClients();
  const createInvoice = trpc.invoices.create.useMutation({
    onSuccess: () => {
      onSuccess();
      handleClose();
    },
    onError: (error) => {
      if (error instanceof TRPCClientError && error.data?.code === 'BAD_REQUEST' && error.data.zodError) {
        const fieldErrors = error.data.zodError as { [key: string]: string[] };
        const newErrors: FieldErrors = {};
        for (const [key, value] of Object.entries(fieldErrors)) {
          newErrors[key] = value[0];
        }
        setErrors(newErrors);
        setSubmitError('Please correct the errors below.');
      } else {
        setSubmitError(error.message || 'An unexpected error occurred.');
      }
    },
  });

  const resetForm = () => {
    setFormData(initialFormData);
    setErrors({});
    setSubmitError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setErrors({});

    try {
      await createInvoice.mutateAsync({
        clientId: formData.clientId,
        items: formData.items.map(item => ({
          ...item,
          unitPrice: item.unitPrice.toFixed(2),
        })),
        tax: formData.tax.toFixed(2),
        dueDate: new Date(formData.dueDate),
        notes: formData.notes?.trim() || undefined,
      });
    } catch (err) {
      // Errors are handled by the onError callback of useMutation
    }
  };

  const getFieldError = (field: string) => errors[field];
  
  const getItemError = (index: number, field: keyof InvoiceItem) => {
    const key = `items[${index}].${field}`;
    // This is a simplification. For more complex item errors, a better mapping would be needed.
    return Object.entries(errors).find(([k,v]) => k.startsWith(`items.${index}`))?.[1];
  };

  // Format date string to YYYY-MM-DD for input type="date"
  const formatDateForInput = (dateString: string) => {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    
    return date.toISOString().split('T')[0];
  };

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { description: '', quantity: 1, unitPrice: 0 }]
    }));
  };

  const removeItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }));
  };

  const calculateTotal = () => {
    const subtotal = formData.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    const tax = subtotal * (formData.tax / 100);
    return subtotal + tax;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-xl font-bold text-gray-900 flex items-center space-x-2">
            <FileText className="w-5 h-5 text-blue-600" />
            <span>Create New Invoice</span>
          </h3>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {submitError && (
            <div className="bg-red-100 border border-red-200 text-red-800 rounded-lg p-3 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Client Selection and Due Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Client *
              </label>
              <select
                value={formData.clientId}
                onChange={(e) => setFormData(prev => ({ ...prev, clientId: e.target.value }))}
                className={`w-full border ${getFieldError('clientId') ? 'border-red-300' : 'border-gray-300'} rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                required
              >
                <option value="">Select a client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.firstName} {client.lastName} - {client.email}
                  </option>
                ))}
              </select>
              {getFieldError('clientId') && (
                <p className="mt-1 text-sm text-red-600">{getFieldError('clientId')}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Due Date *
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="date"
                  value={formatDateForInput(formData.dueDate)}
                  onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                  className={`w-full border ${getFieldError('dueDate') ? 'border-red-300' : 'border-gray-300'} rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  required
                />
              </div>
              {getFieldError('dueDate') && (
                <p className="mt-1 text-sm text-red-600">{getFieldError('dueDate')}</p>
              )}
            </div>
          </div>

          {/* Invoice Items */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-gray-900">Invoice Items</h4>
              <button
                type="button"
                onClick={addItem}
                className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add Item</span>
              </button>
            </div>

            <div className="space-y-4">
              {formData.items.map((item, index) => (
                <div key={index} className={`p-4 border ${getItemError(index, 'description') ? 'border-red-200 bg-red-50' : 'border-gray-200'} rounded-lg`}>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
                    <div className="md:col-span-2">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateItem(index, 'description', e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Item description"
                        required
                      />
                    </div>

                    <div>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      />
                    </div>

                    <div>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="0.00"
                        required
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        ${(item.quantity * item.unitPrice).toFixed(2)}
                      </span>
                      {formData.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="p-1 text-red-500 hover:text-red-700 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  {getItemError(index, 'description') && (
                    <p className="mt-2 text-sm text-red-600">{getItemError(index, 'description')}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Tax and Total */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tax Rate (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={formData.tax}
                onChange={(e) => setFormData(prev => ({ ...prev, tax: parseFloat(e.target.value) || 0 }))}
                className={`w-full border ${getFieldError('tax') ? 'border-red-300' : 'border-gray-300'} rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                placeholder="0.00"
              />
              {getFieldError('tax') && (
                <p className="mt-1 text-sm text-red-600">{getFieldError('tax')}</p>
              )}
            </div>

            <div className="flex items-end">
              <div className="text-right">
                <p className="text-sm text-gray-600">Total Amount</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${calculateTotal().toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createInvoice.isLoading}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center space-x-2 disabled:opacity-50"
            >
              {createInvoice.isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  <span>Create Invoice</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 