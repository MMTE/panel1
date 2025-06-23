import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AdminHeader } from '../../components/admin/AdminHeader';
import { AdminSidebar } from '../../components/admin/AdminSidebar';
import { PluginSlot } from '../../lib/plugins';
import { useAuth } from '../../hooks/useAuth';

export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, isDemoMode } = useAuth();

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const closeSidebar = () => setSidebarOpen(false);

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