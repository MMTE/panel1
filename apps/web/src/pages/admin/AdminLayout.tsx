import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AdminHeader } from '../../components/admin/AdminHeader';
import { AdminSidebar } from '../../components/admin/AdminSidebar';
import { PluginSlot } from '../../lib/plugins';
import { useAuth } from '../../hooks/useAuth';
import { useTenant } from '../../hooks/useTenant';
import { Loader2, AlertCircle } from 'lucide-react';

export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, isDemoMode } = useAuth();
  const { loading: tenantLoading, error: tenantError } = useTenant();

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const closeSidebar = () => setSidebarOpen(false);

  if (tenantLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-purple-500 animate-spin mx-auto" />
          <p className="mt-2 text-gray-600">Loading tenant data...</p>
        </div>
      </div>
    );
  }

  if (tenantError && !isDemoMode) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
          <h2 className="mt-2 text-lg font-semibold text-gray-900">Tenant Error</h2>
          <p className="mt-1 text-gray-600">{tenantError}</p>
          <p className="mt-4 text-sm text-gray-500">
            Please try refreshing the page or contact support if the issue persists.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <AdminSidebar isOpen={sidebarOpen} onClose={closeSidebar} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:ml-0">
        {/* Header */}
        <AdminHeader 
          onToggleSidebar={toggleSidebar}
          sidebarOpen={sidebarOpen}
        />

        {/* Page Content */}
        <main className="flex-1 p-6">
          {/* Global Page Top Slot */}
          <PluginSlot 
            slotId="admin.page.top" 
            props={{ user, isDemoMode }}
            className="mb-6"
          />

          {/* Page Content */}
          <Outlet />

          {/* Global Page Bottom Slot */}
          <PluginSlot 
            slotId="admin.page.bottom" 
            props={{ user, isDemoMode }}
            className="mt-6"
          />
        </main>
      </div>
    </div>
  );
}