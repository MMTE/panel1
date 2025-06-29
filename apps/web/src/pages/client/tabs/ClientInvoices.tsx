import React from 'react';
import { Download, Eye, FileText } from 'lucide-react';
import { ClientInvoice } from '../../../hooks/useClientData';

interface ClientInvoicesProps {
  invoices: ClientInvoice[];
  onViewInvoice: (invoice: ClientInvoice) => void;
  onPayInvoice: (invoiceId: string) => void;
}

export function ClientInvoices({ invoices, onViewInvoice, onPayInvoice }: ClientInvoicesProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PAID':
        return 'bg-green-100 text-green-800';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'OVERDUE':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Your Invoices</h2>
        <button className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-2">
          <Download className="w-4 h-4" />
          <span>Download All</span>
        </button>
      </div>

      {invoices.length > 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-3 px-6 font-medium text-gray-900">Invoice</th>
                  <th className="text-left py-3 px-6 font-medium text-gray-900">Amount</th>
                  <th className="text-left py-3 px-6 font-medium text-gray-900">Status</th>
                  <th className="text-left py-3 px-6 font-medium text-gray-900">Due Date</th>
                  <th className="text-right py-3 px-6 font-medium text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-6">
                      <div>
                        <div className="font-medium text-gray-900">{invoice.invoice_number}</div>
                        <div className="text-sm text-gray-500">{invoice.items[0]?.description}</div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="font-medium text-gray-900">{formatCurrency(invoice.total)}</div>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(invoice.status)}`}>
                        {invoice.status}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="text-gray-900">{formatDate(invoice.due_date)}</div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-end space-x-2">
                        <button 
                          onClick={() => onViewInvoice(invoice)}
                          className="p-1 rounded-lg hover:bg-gray-100 transition-colors" 
                          title="View"
                        >
                          <Eye className="w-4 h-4 text-gray-600" />
                        </button>
                        <button 
                          className="p-1 rounded-lg hover:bg-gray-100 transition-colors" 
                          title="Download"
                        >
                          <Download className="w-4 h-4 text-gray-600" />
                        </button>
                        {invoice.status === 'PENDING' && (
                          <button 
                            onClick={() => onPayInvoice(invoice.id)}
                            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-3 py-1 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 text-sm"
                          >
                            Pay Now
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Invoices Found</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            You don't have any invoices yet. They will appear here once you subscribe to a plan or make a purchase.
          </p>
        </div>
      )}
    </div>
  );
}