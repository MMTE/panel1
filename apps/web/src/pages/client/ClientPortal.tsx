import React, { useState } from 'react';
import { 
  User, 
  CreditCard, 
  FileText, 
  Settings, 
  Bell,
  Download,
  Eye,
  Calendar,
  DollarSign,
  Clock,
  CheckCircle,
  AlertCircle,
  Package,
  Activity,
  LogOut,
  Loader,
  ExternalLink,
  Save,
  Server,
  Settings as SettingsIcon,
  ArrowUpDown
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { PluginSlot } from '../../lib/plugins';
import { useClientData } from '../../hooks/useClientData';
import type { SubscribedComponent } from '../../hooks/useClientData';
import { useComponentManagement } from '../../hooks/useComponentManagement';

export function ClientPortal() {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'invoices' | 'subscriptions' | 'profile'>('overview');
  const { 
    clientData, 
    loading, 
    error, 
    updateProfile,
    payInvoice,
    cancelSubscription
  } = useClientData();
  
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    company_name: '',
    address: '',
    city: '',
    state: '',
    zip_code: '',
    country: ''
  });
  
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [subscriptionToCancel, setSubscriptionToCancel] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showComponentModal, setShowComponentModal] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState<SubscribedComponent | null>(null);
  const {
    restartComponent,
    updateConfiguration,
    scaleComponent,
    getComponentStatus,
    isRestarting,
    isScaling,
    error: componentError
  } = useComponentManagement();

  // Initialize form data when client data is loaded
  React.useEffect(() => {
    if (clientData) {
      setFormData({
        first_name: clientData.profile.first_name || '',
        last_name: clientData.profile.last_name || '',
        email: clientData.profile.email || '',
        phone: clientData.profile.phone || '',
        company_name: clientData.profile.company_name || '',
        address: clientData.profile.address || '',
        city: clientData.profile.city || '',
        state: clientData.profile.state || '',
        zip_code: clientData.profile.zip_code || '',
        country: clientData.profile.country || ''
      });
    }
  }, [clientData]);

  const handleSignOut = async () => {
    try {
      await signOut();
      window.location.href = '/';
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    setUpdateSuccess(false);
    setUpdateError(null);

    try {
      const success = await updateProfile(formData);
      if (success) {
        setUpdateSuccess(true);
        setTimeout(() => setUpdateSuccess(false), 3000);
      } else {
        setUpdateError('Failed to update profile. Please try again.');
      }
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePayInvoice = async (invoiceId: string) => {
    try {
      await payInvoice(invoiceId);
    } catch (error) {
      console.error('Error paying invoice:', error);
    }
  };

  const handleCancelSubscription = async () => {
    if (!subscriptionToCancel) return;
    
    setIsCancelling(true);
    try {
      const success = await cancelSubscription(subscriptionToCancel);
      if (success) {
        setShowCancelModal(false);
        setSubscriptionToCancel(null);
      }
    } catch (error) {
      console.error('Error cancelling subscription:', error);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleManageComponent = (subscriptionId: string, componentId: string) => {
    const subscription = clientData?.subscriptions.find(s => s.id === subscriptionId);
    const component = subscription?.subscribedComponents.find(c => c.id === componentId);
    if (component) {
      setSelectedComponent(component);
      setShowComponentModal(true);
    }
  };

  const handleComponentAction = async (action: string) => {
    if (!selectedComponent) return;

    try {
      switch (action) {
        case 'restart':
          await restartComponent(selectedComponent.id);
          break;
        case 'scale':
          const newQuantity = selectedComponent.quantity + 1; // For demo purposes
          await scaleComponent(selectedComponent.id, newQuantity);
          break;
        case 'configure':
          // Example configuration update
          await updateConfiguration(selectedComponent.id, {
            // Add configuration options based on component type
            memory: '2GB',
            cpu: '2',
          });
          break;
        default:
          console.warn('Unknown component action:', action);
      }
      setShowComponentModal(false);
      setSelectedComponent(null);
    } catch (error) {
      console.error('Error performing component action:', error);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
      case 'PAID':
        return 'bg-green-100 text-green-800';
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'OVERDUE':
      case 'CANCELLED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ACTIVE':
      case 'PAID':
        return CheckCircle;
      case 'PENDING':
        return Clock;
      case 'OVERDUE':
      case 'CANCELLED':
        return AlertCircle;
      default:
        return Activity;
    }
  };

  const getProvisioningStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 text-purple-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading your account information...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Data</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!clientData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <User className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">No Client Profile Found</h2>
          <p className="text-gray-600 mb-6">
            We couldn't find a client profile associated with your account. Please contact support for assistance.
          </p>
          <button
            onClick={handleSignOut}
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // Component Management Modal
  const ComponentModal = () => {
    if (!selectedComponent) return null;

    // Get real-time status
    const { data: componentStatus } = getComponentStatus(selectedComponent.id);

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Server className="w-5 h-5 text-gray-500" />
              <h3 className="text-lg font-semibold text-gray-900">{selectedComponent.name}</h3>
            </div>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getProvisioningStatusColor(componentStatus?.status || selectedComponent.provisioningStatus)}`}>
              {componentStatus?.status || selectedComponent.provisioningStatus}
            </span>
          </div>

          <div className="space-y-4 mb-6">
            <p className="text-gray-600">{selectedComponent.description || selectedComponent.definition.description}</p>
            
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Type</span>
                <span className="font-medium">{selectedComponent.definition.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Provider</span>
                <span className="font-medium">{selectedComponent.definition.provider}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Quantity</span>
                <span className="font-medium">{selectedComponent.quantity}</span>
              </div>
              {selectedComponent.unitPrice && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Unit Price</span>
                  <span className="font-medium">{formatCurrency(parseFloat(selectedComponent.unitPrice))}</span>
                </div>
              )}
            </div>

            {componentStatus?.metrics && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Current Metrics</h4>
                <ul className="bg-gray-50 rounded-lg p-4 space-y-2">
                  {Object.entries(componentStatus.metrics).map(([key, value]) => (
                    <li key={key} className="flex justify-between text-sm">
                      <span className="text-gray-600">{key}</span>
                      <span className="font-medium">{String(value)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {selectedComponent.definition.features && Object.keys(selectedComponent.definition.features).length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Features</h4>
                <ul className="bg-gray-50 rounded-lg p-4 space-y-2">
                  {Object.entries(selectedComponent.definition.features).map(([key, value]) => (
                    <li key={key} className="flex justify-between text-sm">
                      <span className="text-gray-600">{key}</span>
                      <span className="font-medium">{String(value)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {componentError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
                {componentError}
              </div>
            )}
          </div>

          <div className="flex space-x-2">
            {selectedComponent.definition.options?.controlPanelUrl && (
              <a
                href={selectedComponent.definition.options.controlPanelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center space-x-1"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Control Panel</span>
              </a>
            )}
            <button
              onClick={() => handleComponentAction('restart')}
              disabled={isRestarting}
              className="flex-1 bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center space-x-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <SettingsIcon className="w-4 h-4" />
              <span>{isRestarting ? 'Restarting...' : 'Restart'}</span>
            </button>
            <button
              onClick={() => handleComponentAction('scale')}
              disabled={isScaling}
              className="flex-1 bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center space-x-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowUpDown className="w-4 h-4" />
              <span>{isScaling ? 'Scaling...' : 'Scale'}</span>
            </button>
            <button
              onClick={() => setShowComponentModal(false)}
              className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Client Portal</h1>
              <p className="text-sm text-gray-500">Welcome back, {clientData.profile.first_name || clientData.profile.email.split('@')[0]}</p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {isDemoMode && (
              <span className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full border border-orange-200">
                Demo Mode
              </span>
            )}
            
            <button className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <Bell className="w-5 h-5 text-gray-600" />
            </button>
            
            <button
              onClick={handleSignOut}
              className="flex items-center space-x-2 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Navigation Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-8">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6 overflow-x-auto">
              {[
                { id: 'overview', name: 'Overview', icon: Activity },
                { id: 'subscriptions', name: 'Subscriptions', icon: Package },
                { id: 'invoices', name: 'Invoices', icon: FileText },
                { id: 'profile', name: 'Profile', icon: User }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors flex items-center space-x-2 whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-purple-500 text-purple-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  <span>{tab.name}</span>
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl p-6 text-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-blue-100">Total Spent</p>
                        <p className="text-3xl font-bold mt-2">{formatCurrency(clientData.stats.totalSpent)}</p>
                      </div>
                      <DollarSign className="w-8 h-8 text-blue-200" />
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl p-6 text-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-green-100">Active Services</p>
                        <p className="text-3xl font-bold mt-2">{clientData.stats.activeSubscriptions}</p>
                      </div>
                      <Package className="w-8 h-8 text-green-200" />
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-yellow-500 to-orange-500 rounded-xl p-6 text-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-yellow-100">Pending Invoices</p>
                        <p className="text-3xl font-bold mt-2">{clientData.stats.pendingInvoices}</p>
                      </div>
                      <FileText className="w-8 h-8 text-yellow-200" />
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl p-6 text-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-purple-100">Next Billing</p>
                        <p className="text-lg font-bold mt-2">{formatDate(clientData.stats.nextBilling)}</p>
                      </div>
                      <Calendar className="w-8 h-8 text-purple-200" />
                    </div>
                  </div>
                </div>

                {/* Plugin Slot: Client Dashboard Widgets */}
                <PluginSlot 
                  slotId="client.dashboard.widgets" 
                  props={{ user, isDemoMode, clientData }}
                  className="grid grid-cols-1 lg:grid-cols-2 gap-6"
                />

                {/* Recent Activity */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-gray-50 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Invoices</h3>
                    {clientData.invoices.length > 0 ? (
                      <div className="space-y-3">
                        {clientData.invoices.slice(0, 3).map((invoice) => {
                          const StatusIcon = getStatusIcon(invoice.status);
                          return (
                            <div key={invoice.id} className="flex items-center justify-between p-3 bg-white rounded-lg">
                              <div className="flex items-center space-x-3">
                                <StatusIcon className={`w-5 h-5 ${
                                  invoice.status === 'PAID' ? 'text-green-500' : 
                                  invoice.status === 'PENDING' ? 'text-yellow-500' : 'text-red-500'
                                }`} />
                                <div>
                                  <p className="font-medium text-gray-900">{invoice.invoice_number}</p>
                                  <p className="text-sm text-gray-500">{formatDate(invoice.created_at)}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-medium text-gray-900">{formatCurrency(invoice.total)}</p>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(invoice.status)}`}>
                                  {invoice.status}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-8 bg-white rounded-lg">
                        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500">No invoices found</p>
                      </div>
                    )}
                    {clientData.invoices.length > 3 && (
                      <div className="mt-4 text-center">
                        <button 
                          onClick={() => setActiveTab('invoices')}
                          className="text-purple-600 hover:text-purple-800 text-sm font-medium"
                        >
                          View all invoices
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="bg-gray-50 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Active Subscriptions</h3>
                    {clientData.subscriptions.length > 0 ? (
                      <div className="space-y-3">
                        {clientData.subscriptions.map((subscription) => (
                          <div key={subscription.id} className="flex items-center justify-between p-3 bg-white rounded-lg">
                            <div className="flex items-center space-x-3">
                              <Package className="w-5 h-5 text-blue-500" />
                              <div>
                                <p className="font-medium text-gray-900">{subscription.plan.name}</p>
                                <p className="text-sm text-gray-500">
                                  Next billing: {formatDate(subscription.next_billing_date)}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-medium text-gray-900">
                                {formatCurrency(subscription.plan.price)}/{subscription.plan.interval.toLowerCase()}
                              </p>
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                {subscription.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 bg-white rounded-lg">
                        <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500">No active subscriptions</p>
                      </div>
                    )}
                    {clientData.subscriptions.length > 0 && (
                      <div className="mt-4 text-center">
                        <button 
                          onClick={() => setActiveTab('subscriptions')}
                          className="text-purple-600 hover:text-purple-800 text-sm font-medium"
                        >
                          Manage subscriptions
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'subscriptions' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-gray-900">Your Subscriptions</h2>
                  <button className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200">
                    Browse Plans
                  </button>
                </div>

                {clientData.subscriptions.length > 0 ? (
                  <div className="grid grid-cols-1 gap-8">
                    {clientData.subscriptions.map((subscription) => (
                      <div key={subscription.id} className="bg-white border border-gray-200 rounded-xl p-6">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-semibold text-gray-900">{subscription.planName}</h3>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(subscription.status)}`}>
                            {subscription.status}
                          </span>
                        </div>

                        <div className="space-y-3 mb-6">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Current Period</span>
                            <span className="font-medium">
                              {formatDate(subscription.currentPeriodStart)} - {formatDate(subscription.currentPeriodEnd)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Next Billing</span>
                            <span className="font-medium">{formatDate(subscription.nextBillingDate)}</span>
                          </div>
                        </div>

                        {subscription.subscribedComponents?.length > 0 && (
                          <div className="mt-6">
                            <h4 className="text-sm font-medium text-gray-700 mb-3">Subscribed Components</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {subscription.subscribedComponents.map(component => (
                                <div key={component.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                  <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center space-x-2">
                                      <Server className="w-4 h-4 text-gray-500" />
                                      <h4 className="font-medium text-gray-900">{component.name}</h4>
                                    </div>
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getProvisioningStatusColor(component.provisioningStatus)}`}>
                                      {component.provisioningStatus}
                                    </span>
                                  </div>
                                  
                                  <p className="text-sm text-gray-600 mb-3">{component.description || component.definition.description}</p>
                                  
                                  <div className="space-y-2 mb-4">
                                    <div className="flex justify-between text-sm">
                                      <span className="text-gray-600">Quantity</span>
                                      <span className="font-medium">{component.quantity}</span>
                                    </div>
                                    {component.unitPrice && (
                                      <div className="flex justify-between text-sm">
                                        <span className="text-gray-600">Unit Price</span>
                                        <span className="font-medium">{formatCurrency(parseFloat(component.unitPrice))}</span>
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex space-x-2">
                                    <button
                                      onClick={() => handleManageComponent(subscription.id, component.id)}
                                      className="flex-1 bg-white border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center space-x-1 text-sm"
                                    >
                                      <SettingsIcon className="w-4 h-4" />
                                      <span>Manage</span>
                                    </button>
                                    {component.definition.options?.controlPanelUrl && (
                                      <a
                                        href={component.definition.options.controlPanelUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-1 bg-white border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center space-x-1 text-sm"
                                      >
                                        <ExternalLink className="w-4 h-4" />
                                        <span>Control Panel</span>
                                      </a>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex space-x-2 mt-6">
                          <button 
                            onClick={() => {
                              setSubscriptionToCancel(subscription.id);
                              setShowCancelModal(true);
                            }}
                            className="flex-1 border border-red-300 text-red-700 px-4 py-2 rounded-lg hover:bg-red-50 transition-colors flex items-center justify-center space-x-1"
                          >
                            <AlertCircle className="w-4 h-4" />
                            <span>Cancel</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                    <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Subscriptions</h3>
                    <p className="text-gray-500 mb-6 max-w-md mx-auto">
                      You don't have any active subscriptions. Browse our plans to get started with our services.
                    </p>
                    <button className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200">
                      Browse Plans
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'invoices' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-gray-900">Your Invoices</h2>
                  <button className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-2">
                    <Download className="w-4 h-4" />
                    <span>Download All</span>
                  </button>
                </div>

                {clientData.invoices.length > 0 ? (
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
                          {clientData.invoices.map((invoice) => {
                            const StatusIcon = getStatusIcon(invoice.status);
                            return (
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
                                  <div className="flex items-center space-x-2">
                                    <StatusIcon className={`w-4 h-4 ${
                                      invoice.status === 'PAID' ? 'text-green-500' : 
                                      invoice.status === 'PENDING' ? 'text-yellow-500' : 'text-red-500'
                                    }`} />
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(invoice.status)}`}>
                                      {invoice.status}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-4 px-6">
                                  <div className="text-gray-900">{formatDate(invoice.due_date)}</div>
                                </td>
                                <td className="py-4 px-6">
                                  <div className="flex items-center justify-end space-x-2">
                                    <button className="p-1 rounded-lg hover:bg-gray-100 transition-colors" title="View">
                                      <Eye className="w-4 h-4 text-gray-600" />
                                    </button>
                                    <button className="p-1 rounded-lg hover:bg-gray-100 transition-colors" title="Download">
                                      <Download className="w-4 h-4 text-gray-600" />
                                    </button>
                                    {invoice.status === 'PENDING' && (
                                      <button 
                                        onClick={() => handlePayInvoice(invoice.id)}
                                        className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-3 py-1 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 text-sm"
                                      >
                                        Pay Now
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
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
            )}

            {activeTab === 'profile' && (
              <div className="space-y-6">
                <h2 className="text-xl font-semibold text-gray-900">Profile Settings</h2>

                <form onSubmit={handleProfileSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white border border-gray-200 rounded-xl p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Personal Information</h3>
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                            <input
                              type="text"
                              name="first_name"
                              value={formData.first_name}
                              onChange={handleInputChange}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                            <input
                              type="text"
                              name="last_name"
                              value={formData.last_name}
                              onChange={handleInputChange}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                          <input
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleInputChange}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                          <input
                            type="tel"
                            name="phone"
                            value={formData.phone}
                            onChange={handleInputChange}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-xl p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Company Information</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                          <input
                            type="text"
                            name="company_name"
                            value={formData.company_name}
                            onChange={handleInputChange}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                          <input
                            type="text"
                            name="address"
                            value={formData.address}
                            onChange={handleInputChange}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                            <input
                              type="text"
                              name="city"
                              value={formData.city}
                              onChange={handleInputChange}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                            <input
                              type="text"
                              name="state"
                              value={formData.state}
                              onChange={handleInputChange}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Zip Code</label>
                            <input
                              type="text"
                              name="zip_code"
                              value={formData.zip_code}
                              onChange={handleInputChange}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                            <input
                              type="text"
                              name="country"
                              value={formData.country}
                              onChange={handleInputChange}
                              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {updateSuccess && (
                    <div className="bg-green-100 border border-green-200 text-green-800 rounded-lg p-4 flex items-center">
                      <CheckCircle className="w-5 h-5 mr-2" />
                      Profile updated successfully!
                    </div>
                  )}

                  {updateError && (
                    <div className="bg-red-100 border border-red-200 text-red-800 rounded-lg p-4 flex items-center">
                      <AlertCircle className="w-5 h-5 mr-2" />
                      {updateError}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button 
                      type="submit"
                      disabled={isUpdating}
                      className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-2 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 flex items-center space-x-2 disabled:opacity-70"
                    >
                      {isUpdating ? (
                        <>
                          <Loader className="w-4 h-4 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          <span>Save Changes</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cancel Subscription Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Cancel Subscription</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to cancel this subscription? You will still have access until the end of your current billing period.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Keep Subscription
              </button>
              <button
                onClick={handleCancelSubscription}
                disabled={isCancelling}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-70 flex items-center justify-center space-x-1"
              >
                {isCancelling ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4" />
                    <span>Cancel</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showComponentModal && <ComponentModal />}
    </div>
  );
}