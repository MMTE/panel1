import React from 'react';
import { Bell, Search, Settings, User, LogOut, Menu } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { PluginSlot } from '../../lib/plugins';

interface AdminHeaderProps {
  onToggleSidebar?: () => void;
  sidebarOpen?: boolean;
}

export function AdminHeader({ onToggleSidebar, sidebarOpen }: AdminHeaderProps) {
  const { user, signOut, isDemoMode, switchDemoRole } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
      window.location.href = '/';
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Left Section */}
        <div className="flex items-center space-x-4">
          {/* Mobile menu button */}
          <button
            onClick={onToggleSidebar}
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Menu className="w-5 h-5 text-gray-600" />
          </button>

          {/* Search */}
          <div className="hidden md:flex items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search..."
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent w-64"
              />
            </div>
          </div>

          {/* Plugin Slot: Header Left */}
          <PluginSlot 
            slotId="admin.header.left" 
            props={{ user, isDemoMode }}
            className="flex items-center space-x-2"
          />
        </div>

        {/* Right Section */}
        <div className="flex items-center space-x-4">
          {/* Plugin Slot: Header Right */}
          <PluginSlot 
            slotId="admin.header.right" 
            props={{ user, isDemoMode }}
            className="flex items-center space-x-2"
          />

          {/* Demo Mode Role Switcher */}
          {isDemoMode && (
            <div className="flex items-center space-x-2 px-3 py-1 bg-orange-100 rounded-lg border border-orange-200">
              <span className="text-xs text-orange-700 font-medium">Demo:</span>
              <select
                value={user?.role || 'ADMIN'}
                onChange={(e) => switchDemoRole(e.target.value as any)}
                className="text-xs bg-transparent border-none focus:ring-0 text-orange-700 font-medium"
              >
                <option value="ADMIN">Admin</option>
                <option value="CLIENT">Client</option>
                <option value="RESELLER">Reseller</option>
              </select>
            </div>
          )}

          {/* Notifications */}
          <button className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <Bell className="w-5 h-5 text-gray-600" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></span>
          </button>

          {/* Settings */}
          <button className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <Settings className="w-5 h-5 text-gray-600" />
          </button>

          {/* User Menu */}
          <div className="relative group">
            <button className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
              <div className="hidden md:block text-left">
                <div className="text-sm font-medium text-gray-900">
                  {user?.first_name || user?.email?.split('@')[0] || 'User'}
                </div>
                <div className="text-xs text-gray-500 capitalize">
                  {user?.role?.toLowerCase() || 'admin'}
                </div>
              </div>
            </button>

            {/* Dropdown Menu */}
            <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
              <div className="py-2">
                <a href="#" className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                  <User className="w-4 h-4 mr-3" />
                  Profile
                </a>
                <a href="#" className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                  <Settings className="w-4 h-4 mr-3" />
                  Settings
                </a>
                <hr className="my-2" />
                <button
                  onClick={handleSignOut}
                  className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  <LogOut className="w-4 h-4 mr-3" />
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}