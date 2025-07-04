import React, { useState } from 'react';
import { 
  FileText, 
  Calendar, 
  DollarSign, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  Download,
  Printer,
  ExternalLink,
  Package
} from 'lucide-react';
import { ClientInvoice } from '../../hooks/useClientData';
import { trpc } from '../../api/trpc';

interface InvoiceDetailsProps {
  invoice: ClientInvoice;
  onClose: () => void;
  onPay: () => void;
}

export function InvoiceDetails({ invoice, onClose, onPay }: InvoiceDetailsProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  
  const formatCurrency = (amount: number | string) => {
    const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: invoice.currency || 'USD'
    }).format(numericAmount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PAID':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'PENDING':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'OVERDUE':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <FileText className="w-5 h-5 text-gray-500" />;
    }
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

  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    try {
      // In demo mode, just show a notification
      if (process.env.NODE_ENV !== 'production') {
        alert(`🎭 Demo mode: Would download PDF for invoice ${invoice.invoice_number}`);
        return;
      }

      // Call the PDF generation endpoint
      const response = await trpc.invoices.generatePDF.query({ id: invoice.id });
      
      if (response?.pdf) {
        // Convert base64 to blob and download
        const pdfBlob = new Blob([Buffer.from(response.pdf, 'base64')], {
          type: 'application/pdf'
        });
        
        const url = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = response.filename || `invoice-${invoice.invoice_number}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('PDF download failed:', error);
      alert('Failed to download PDF. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden max-w-3xl w-full">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <FileText className="w-6 h-6 text-purple-500" />
            <h2 className="text-xl font-bold text-gray-900">{invoice.invoice_number}</h2>
          </div>
          <div className="flex items-center space-x-2">
            {getStatusIcon(invoice.status)}
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(invoice.status)}`}>
              {invoice.status}
            </span>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">Invoice Details</h3>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600">Created: {formatDate(invoice.created_at)}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600">Due Date: {formatDate(invoice.due_date)}</span>
              </div>
              {invoice.paid_at && (
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-gray-600">Paid on: {formatDate(invoice.paid_at)}</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-2">Payment Summary</h3>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex justify-between mb-2">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium">{formatCurrency(invoice.subtotal)}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-gray-600">Tax</span>
                <span className="font-medium">{formatCurrency(invoice.tax)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-200">
                <span className="font-medium text-gray-900">Total</span>
                <span className="font-bold text-gray-900">{formatCurrency(invoice.total)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-8">
          <h3 className="text-sm font-medium text-gray-500 mb-4">Invoice Items</h3>
          <div className="bg-gray-50 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Component</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Unit Price</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {invoice.items.map((item, index) => (
                  <tr key={index}>
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-2">
                        <Package className="w-4 h-4 text-gray-400" />
                        <div>
                          <div className="text-gray-800 font-medium">{item.description}</div>
                          {item.details && (
                            <div className="text-sm text-gray-500">{item.details}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right text-gray-800">{item.quantity}</td>
                    <td className="py-3 px-4 text-right text-gray-800">{formatCurrency(item.unit_price)}</td>
                    <td className="py-3 px-4 text-right text-gray-800">{formatCurrency(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:justify-between space-y-3 sm:space-y-0">
          <div className="flex space-x-2">
            <button 
              onClick={handleDownloadPDF}
              disabled={isDownloading}
              className="flex items-center space-x-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className={`w-4 h-4 ${isDownloading ? 'animate-spin' : ''}`} />
              <span>{isDownloading ? 'Generating...' : 'Download PDF'}</span>
            </button>
            <button className="flex items-center space-x-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
              <Printer className="w-4 h-4" />
              <span>Print</span>
            </button>
          </div>

          <div className="flex space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
            
            {invoice.status === 'PENDING' && (
              <button
                onClick={onPay}
                className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 flex items-center space-x-1"
              >
                <DollarSign className="w-4 h-4" />
                <span>Pay Now</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}