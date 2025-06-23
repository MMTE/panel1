import React from 'react';
import { Bell, Package, LogOut } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

interface ClientHeaderProps {
  firstName?: string;
  email?: string;
  onSignOut: () => void;
}

export function ClientHeader({ firstName, email, onSignOut }: ClientHeaderProps) {
  const { isDemoMode } = useAuth();
  
  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Client Portal</h1>
            <p className="text-sm text-gray-500">Welcome back, {firstName || email?.split('@')[0]}</p>
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
            onClick={onSignOut}
            className="flex items-center space-x-2 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </div>
    </header>
  );
}