import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Search, 
  Filter, 
  Plus, 
  Download,
  Eye,
  Edit,
  Send,
  MoreHorizontal,
  Calendar,
  DollarSign,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  Printer
} from 'lucide-react';
import { PluginSlot } from '../../lib/plugins';
import { useAuth } from '../../hooks/useAuth';

export function AdminInvoices() {
  const { user, isDemoMode } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedDateRange, setSelectedDateRange] = useState('all');

  // Mock invoice data for demo
  const invoiceStats = {
    totalInvoices: 1247,
    totalAmount: 125430.50,
    paidAmount: 118650.25,
    pendingAmount: 4320.75,
    overdueAmount: 2459.50
  };

  const mockInvoices = [
    {
      id: 'inv_001',
      invoice_number: 'INV-2024-001',
      client: {
        company_name: 'Acme Corporation',
        user: { first_name: 'John', last_name: 'Doe', email: 'john@acme.com' }
      },
      status: 'PAID',
      total: 299.99,
      currency: 'USD',
      due_date: '2024-01-15T00:00:00Z',
      paid_at: '2024-01-14T10:30:00Z',
      created_at: '2024-01-01T09:00:00Z',
      items: [
        { description: 'Professional Hosting Plan', quantity: 1, unit_price: 299.99 }
      ]
    },
    {
      id: 'inv_002',
      invoice_number: 'INV-2024-002',
      client: {
        company_name: 'Tech Startup Inc',
        user: { first_name: 'Jane', last_name: 'Smith', email: 'jane@techstartup.com' }
      },
      status: 'PENDING',
      total: 99.99,
      currency: 'USD',
      due_date: '2024-01-25T00:00:00Z',
      paid_at: null,
      created_at: '2024-01-10T14:20:00Z',
      items: [
        { description: 'Basic Hosting Plan', quantity: 1, unit_price: 99.99 }
      ]
    },
    {
      id: 'inv_003',
      invoice_number: 'INV-2024-003',
      client: {
        company_name: 'Global Solutions Ltd',
        user: { first_name: 'Mike', last_name: 'Johnson', email: 'mike@globalsolutions.com' }
      },
      status: 'OVERDUE',
      total: 199.99,
      currency: 'USD',
      due_date: '2024-01-10T00:00:00Z',
      paid_at: null,
      created_at: '2023-12-25T11:15:00Z',
      items: [
        { description: 'Enterprise Hosting Plan', quantity: 1, unit_price: 199.99 }
      ]
    },
    {
      id: 'inv_004',
      invoice_number: 'INV-2024-004',
      client: {
        company_name: 'Small Business LLC',
        user: { first_name: 'Sarah', last_name: 'Wilson', email: 'sarah@smallbiz.com' }
      },
      status: 'DRAFT',
      total: 49.99,
      currency: 'USD',
      due_date: '2024-02-01T00:00:00Z',
      paid_at: null,
      created_at: '2024-01-20T16:45:00Z',
      items: [
        { description: 'Starter Hosting Plan', quantity: 1, unit_price: 49.99 }
      ]
    }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PAID':
        return 'bg-green-100 text-green-800';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'OVERDUE':
        return 'bg-red-100 text-red-800';
      case 'DRAFT':
        return 'bg-gray-100 text-gray-800';
      case 'CANCELLED':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PAID':
        return CheckCircle;
      case 'PENDING':
        return Clock;
      case 'OVERDUE':
        return AlertCircle;
      case 'DRAFT':
        return Edit;
      case 'CANCELLED':
        return XCircle;
      default:
        return FileText;
    }
  };

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

  const isOverdue = (dueDate: string, status: string) => {
    return status !== 'PAID' && new Date(dueDate) < new Date();
  };

  const filteredInvoices = mockInvoices.filter(invoice => {
    const matchesSearch = 
      invoice.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.client.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.client.user.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = selectedStatus === 'all' || invoice.status === selectedStatus;
    
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Invoices</h1>
          <p className="text-gray-600 mt-1">
            Manage and track all your invoices and billing
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <PluginSlot 
            slotId="admin.page.invoices.header.actions" 
            props={{ user, isDemoMode, stats: invoiceStats }}
            className="flex items-center space-x-2"
          />
          
          <button className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-2">
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
          
          <button className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 flex items-center space-x-2">
            <Plus className="w-4 h-4" />
            <span>Create Invoice</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Invoices</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{invoiceStats.totalInvoices}</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
              <FileText className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Amount</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{formatCurrency(invoiceStats.totalAmount)}</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Paid Amount</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{formatCurrency(invoiceStats.paidAmount)}</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{formatCurrency(invoiceStats.pendingAmount)}</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Overdue</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{formatCurrency(invoiceStats.overdueAmount)}</p>
            </div>
            <div className="w-12 h-12 bg-gradient-to-r from-red-500 to-pink-500 rounded-lg flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
          <div className="flex flex-col sm:flex-row sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search invoices..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent w-full sm:w-64"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="DRAFT">Draft</option>
                <option value="PENDING">Pending</option>
                <option value="PAID">Paid</option>
                <option value="OVERDUE">Overdue</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            {/* Date Range Filter */}
            <select
              value={selectedDateRange}
              onChange={(e) => setSelectedDateRange(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="quarter">This Quarter</option>
              <option value="year">This Year</option>
            </select>
          </div>

          <PluginSlot 
            slotId="admin.page.invoices.list.actions" 
            props={{ user, isDemoMode, invoices: filteredInvoices, searchTerm, selectedStatus }}
            className="flex items-center space-x-2"
          />
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left py-3 px-6 font-medium text-gray-900">Invoice</th>
                <th className="text-left py-3 px-6 font-medium text-gray-900">Client</th>
                <th className="text-left py-3 px-6 font-medium text-gray-900">Amount</th>
                <th className="text-left py-3 px-6 font-medium text-gray-900">Status</th>
                <th className="text-left py-3 px-6 font-medium text-gray-900">Due Date</th>
                <th className="text-left py-3 px-6 font-medium text-gray-900">Created</th>
                <th className="text-right py-3 px-6 font-medium text-gray-900">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredInvoices.map((invoice) => {
                const StatusIcon = getStatusIcon(invoice.status);
                const overdue = isOverdue(invoice.due_date, invoice.status);
                
                return (
                  <tr key={invoice.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-6">
                      <div>
                        <div className="font-medium text-gray-900">{invoice.invoice_number}</div>
                        <div className="text-sm text-gray-500">
                          {invoice.items[0]?.description}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div>
                        <div className="font-medium text-gray-900">
                          {invoice.client.company_name || `${invoice.client.user.first_name} ${invoice.client.user.last_name}`}
                        </div>
                        <div className="text-sm text-gray-500">{invoice.client.user.email}</div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="font-medium text-gray-900">{formatCurrency(invoice.total)}</div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center space-x-2">
                        <StatusIcon className={`w-4 h-4 ${
                          invoice.status === 'PAID' ? 'text-green-500' :
                          invoice.status === 'PENDING' ? 'text-yellow-500' :
                          invoice.status === 'OVERDUE' || overdue ? 'text-red-500' :
                          invoice.status === 'DRAFT' ? 'text-gray-500' : 'text-gray-500'
                        }`} />
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          overdue && invoice.status !== 'PAID' ? 'bg-red-100 text-red-800' : getStatusColor(invoice.status)
                        }`}>
                          {overdue && invoice.status !== 'PAID' ? 'OVERDUE' : invoice.status}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className={`text-gray-900 ${overdue && invoice.status !== 'PAID' ? 'text-red-600 font-medium' : ''}`}>
                        {formatDate(invoice.due_date)}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="text-gray-900">{formatDate(invoice.created_at)}</div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-end space-x-2">
                        <button className="p-1 rounded-lg hover:bg-gray-100 transition-colors" title="View">
                          <Eye className="w-4 h-4 text-gray-600" />
                        </button>
                        <button className="p-1 rounded-lg hover:bg-gray-100 transition-colors" title="Edit">
                          <Edit className="w-4 h-4 text-gray-600" />
                        </button>
                        <button className="p-1 rounded-lg hover:bg-gray-100 transition-colors" title="Print">
                          <Printer className="w-4 h-4 text-gray-600" />
                        </button>
                        {invoice.status === 'DRAFT' && (
                          <button className="p-1 rounded-lg hover:bg-gray-100 transition-colors" title="Send">
                            <Send className="w-4 h-4 text-blue-600" />
                          </button>
                        )}
                        <button className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
                          <MoreHorizontal className="w-4 h-4 text-gray-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="border-t border-gray-200 p-4">
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>Showing {filteredInvoices.length} of {mockInvoices.length} invoices</span>
            <div className="flex items-center space-x-2">
              <button className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                Previous
              </button>
              <button className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Plugin Slot: Page Bottom */}
      <PluginSlot 
        slotId="admin.page.invoices.bottom" 
        props={{ user, isDemoMode, invoices: filteredInvoices, stats: invoiceStats }}
        className="space-y-6"
      />
    </div>
  );
}