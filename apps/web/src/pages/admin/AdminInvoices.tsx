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
  Printer,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { PluginSlot } from '../../lib/plugins';
import { useAuth } from '../../hooks/useAuth';
import { trpc } from '../../api/trpc';
import { CreateInvoiceModal } from '../../components/admin/CreateInvoiceModal';

export function AdminInvoices() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedDateRange, setSelectedDateRange] = useState('all');
  const [currentPage, setCurrentPage] = useState(0);
  const [isCreateInvoiceModalOpen, setIsCreateInvoiceModalOpen] = useState(false);
  const pageSize = 10;

  // Real API calls replacing mock data
  const { 
    data: invoicesData, 
    isLoading: invoicesLoading, 
    error: invoicesError,
    refetch: refetchInvoices
  } = trpc.invoices.getAll.useQuery({
    limit: pageSize,
    offset: currentPage * pageSize,
    search: searchTerm || undefined,
    status: selectedStatus !== 'all' ? selectedStatus as any : undefined,
  }, {
    enabled: !!user,
    keepPreviousData: true,
  });

  const { 
    data: invoiceStats, 
    isLoading: statsLoading 
  } = trpc.invoices.getStats.useQuery(undefined, {
    enabled: !!user,
  });

  // Extract real data from API response
  const invoices = invoicesData?.invoices || [];
  const totalInvoices = invoicesData?.total || 0;
  const hasMore = invoicesData?.hasMore || false;

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

  const handleRefresh = () => {
    refetchInvoices();
  };

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    setCurrentPage(0); // Reset to first page when searching
  };

  const handleStatusChange = (status: string) => {
    setSelectedStatus(status);
    setCurrentPage(0); // Reset to first page when filtering
  };

  const handleInvoiceCreated = () => {
    refetchInvoices();
  };

  // Show loading state
  if (invoicesLoading || statsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
        <span className="ml-2 text-gray-600">Loading invoices...</span>
      </div>
    );
  }

  // Show error state
  if (invoicesError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Error Loading Invoices</h3>
          <p className="text-gray-600 mb-4">{invoicesError.message}</p>
          <button 
            onClick={handleRefresh}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors flex items-center space-x-2 mx-auto"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Retry</span>
          </button>
        </div>
      </div>
    );
  }

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
            props={{ user, stats: invoiceStats }}
            className="flex items-center space-x-2"
          />
          
          <button className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-2">
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
          
          <button 
            onClick={() => setIsCreateInvoiceModalOpen(true)}
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 flex items-center space-x-2"
          >
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
              <p className="text-3xl font-bold text-gray-900 mt-2">{invoiceStats?.totalInvoices || 0}</p>
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
              <p className="text-3xl font-bold text-gray-900 mt-2">{formatCurrency(invoiceStats?.totalAmount || 0)}</p>
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
              <p className="text-3xl font-bold text-gray-900 mt-2">{formatCurrency(invoiceStats?.paidAmount || 0)}</p>
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
              <p className="text-3xl font-bold text-gray-900 mt-2">{formatCurrency(invoiceStats?.pendingAmount || 0)}</p>
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
              <p className="text-3xl font-bold text-gray-900 mt-2">{formatCurrency(invoiceStats?.overdueAmount || 0)}</p>
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
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent w-full sm:w-64"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={selectedStatus}
                onChange={(e) => handleStatusChange(e.target.value)}
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

          <div className="flex items-center space-x-2">
            <button 
              onClick={handleRefresh}
              className="flex items-center space-x-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Refresh</span>
            </button>
            
            <PluginSlot 
              slotId="admin.page.invoices.list.actions" 
              props={{ user, invoices, searchTerm, selectedStatus }}
              className="flex items-center space-x-2"
            />
          </div>
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
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No invoices found</h3>
                    <p className="text-gray-600">
                      {searchTerm || selectedStatus !== 'all' 
                        ? 'Try adjusting your search or filters' 
                        : 'Create your first invoice to get started'
                      }
                    </p>
                  </td>
                </tr>
              ) : (
                invoices.map((invoice: any) => {
                const StatusIcon = getStatusIcon(invoice.status);
                const overdue = isOverdue(invoice.dueDate?.toISOString() || new Date().toISOString(), invoice.status);
                
                return (
                  <tr key={invoice.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-6">
                      <div>
                        <div className="font-medium text-gray-900">{invoice.invoiceNumber}</div>
                        <div className="text-sm text-gray-500">
                          Invoice #{invoice.invoiceNumber?.split('-').pop()}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div>
                        <div className="font-medium text-gray-900">
                          {invoice.clientCompanyName || `${invoice.clientUserFirstName || ''} ${invoice.clientUserLastName || ''}`.trim()}
                        </div>
                        <div className="text-sm text-gray-500">{invoice.clientUserEmail}</div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="font-medium text-gray-900">
                        {formatCurrency(parseFloat(invoice.total.toString()))}
                      </div>
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
                        {formatDate(invoice.dueDate?.toISOString() || new Date().toISOString())}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="text-gray-900">{formatDate(invoice.createdAt?.toISOString() || new Date().toISOString())}</div>
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
              }))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalInvoices > pageSize && (
          <div className="border-t border-gray-200 p-4">
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>
                Showing {currentPage * pageSize + 1}-{Math.min((currentPage + 1) * pageSize, totalInvoices)} of {totalInvoices} invoices
              </span>
              <div className="flex items-center space-x-2">
                <button 
                  onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                  disabled={currentPage === 0}
                  className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="px-3 py-1">
                  Page {currentPage + 1} of {Math.ceil(totalInvoices / pageSize)}
                </span>
                <button 
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={!hasMore}
                  className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Plugin Slot: Page Bottom */}
      <PluginSlot 
        slotId="admin.page.invoices.bottom" 
        props={{ user, invoices, stats: invoiceStats }}
        className="space-y-6"
      />

      {/* Create Invoice Modal */}
      <CreateInvoiceModal
        isOpen={isCreateInvoiceModalOpen}
        onClose={() => setIsCreateInvoiceModalOpen(false)}
        onSuccess={handleInvoiceCreated}
      />
    </div>
  );
}