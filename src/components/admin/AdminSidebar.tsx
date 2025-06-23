import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  FileText, 
  Settings, 
  Package,
  BarChart3,
  Code,
  X,
  Building,
  UserCheck
} from 'lucide-react';
import { PluginSlot } from '../../lib/plugins';
import { useAuth } from '../../hooks/useAuth';

interface AdminSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function AdminSidebar({ isOpen = true, onClose }: AdminSidebarProps) {
  const { user, isDemoMode } = useAuth();

  const navigationItems = [
    {
      name: 'Dashboard',
      href: '/admin',
      icon: LayoutDashboard,
      end: true
    },
    {
      name: 'Users',
      href: '/admin/users',
      icon: Users
    },
    {
      name: 'Clients',
      href: '/admin/clients',
      icon: UserCheck
    },
    {
      name: 'Billing',
      href: '/admin/billing',
      icon: CreditCard
    },
    {
      name: 'Invoices',
      href: '/admin/invoices',
      icon: FileText
    },
    {
      name: 'Plans',
      href: '/admin/plans',
      icon: Package
    },
    {
      name: 'Analytics',
      href: '/admin/analytics',
      icon: BarChart3
    },
    {
      name: 'Plugins',
      href: '/admin/plugins',
      icon: Code
    },
    {
      name: 'Tenants',
      href: '/admin/tenants',
      icon: Building
    }
  ];

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out
        lg:relative lg:translate-x-0 lg:z-auto
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <Code className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Panel1</h1>
              {isDemoMode && (
                <span className="text-xs text-orange-600 font-medium">Demo Mode</span>
              )}
            </div>
          </div>
          
          {/* Mobile close button */}
          <button
            onClick={onClose}
            className="lg:hidden p-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2">
          {navigationItems.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              end={item.end}
              onClick={onClose} // Close mobile menu on navigation
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.name}</span>
            </NavLink>
          ))}

          {/* Plugin Navigation Slot */}
          <div className="pt-4 border-t border-gray-200">
            <PluginSlot 
              slotId="admin.nav.sidebar" 
              props={{ user, isDemoMode, onNavigate: onClose }}
              className="space-y-2"
            />
          </div>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200">
          <PluginSlot 
            slotId="admin.nav.footer" 
            props={{ user, isDemoMode }}
            className="space-y-2"
          />
          
          <div className="flex items-center space-x-3 px-3 py-2">
            <Settings className="w-5 h-5 text-gray-400" />
            <NavLink
              to="/admin/settings"
              className="text-gray-700 hover:text-gray-900 font-medium"
            >
              Settings
            </NavLink>
          </div>
        </div>
      </aside>
    </>
  );
}