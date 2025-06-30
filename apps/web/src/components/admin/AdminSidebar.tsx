import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FileText,
  CreditCard,
  Settings,
  Box,
  Globe,
  Shield,
  Server,
  BarChart,
  MessageSquare,
  Building,
  History,
  Code,
  X,
  Package,
  LifeBuoy,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useNavigation } from '../../hooks/useNavigation';
import { PluginSlot } from '../../lib/plugins';
import { useAuth } from '../../hooks/useAuth';
import { Can } from '../auth/Can';

const defaultNavigation = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    path: '/admin',
    icon: LayoutDashboard,
    requiredPermission: 'analytics.read',
  },
  {
    id: 'clients',
    label: 'Clients',
    path: '/admin/clients',
    icon: Users,
    requiredPermission: 'client.read',
  },
  {
    id: 'invoices',
    label: 'Invoices',
    path: '/admin/invoices',
    icon: FileText,
    requiredPermission: 'invoice.read',
  },
  {
    id: 'subscriptions',
    label: 'Subscriptions',
    path: '/admin/subscriptions',
    icon: CreditCard,
    requiredPermission: 'subscription.read',
  },
  {
    id: 'catalog',
    label: 'Product Catalog',
    path: '/admin/catalog',
    icon: Box,
    requiredPermission: 'plan.read',
  },
  {
    id: 'domains',
    label: 'Domains',
    path: '/admin/domains',
    icon: Globe,
    requiredPermission: 'domain.read',
  },
  {
    id: 'ssl',
    label: 'SSL Certificates',
    path: '/admin/ssl',
    icon: Shield,
    requiredPermission: 'ssl_certificate.read',
  },
  {
    id: 'servers',
    label: 'Servers',
    path: '/admin/servers',
    icon: Server,
    requiredPermission: 'server.read',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    path: '/admin/analytics',
    icon: BarChart,
    requiredPermission: 'analytics.read',
  },
  {
    id: 'support',
    label: 'Support',
    path: '/admin/support',
    icon: MessageSquare,
    requiredPermission: 'support_ticket.read',
  },
  {
    id: 'tenants',
    label: 'Tenants',
    path: '/admin/tenants',
    icon: Building,
    requiredPermission: 'tenant.read',
  },
  {
    id: 'audit-logs',
    label: 'Audit Logs',
    path: '/admin/audit-logs',
    icon: History,
    requiredPermission: 'audit_log.read',
  },
  {
    id: 'settings',
    label: 'Settings',
    path: '/admin/settings',
    icon: Settings,
    requiredPermission: 'system_settings.read',
  },
];

interface MenuItem {
  id: string;
  label: string;
  path?: string;
  icon?: React.ComponentType<{ className?: string }>;
  items?: MenuItem[];
  requiredPermission?: string;
}

interface AdminSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function AdminSidebar({ isOpen = true, onClose }: AdminSidebarProps) {
  const location = useLocation();
  const { filteredNavigation } = useNavigation({ navigation: defaultNavigation });
  const { user } = useAuth();
  const [navigation, setNavigation] = useState<MenuItem[]>([]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Load and set the filtered navigation
    const loadNavigation = async () => {
      const filtered = await filteredNavigation;
      setNavigation(filtered);
    };
    loadNavigation();
  }, [filteredNavigation]);

  const toggleExpanded = (label: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(label)) {
      newExpanded.delete(label);
    } else {
      newExpanded.add(label);
    }
    setExpandedItems(newExpanded);
  };

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  const renderMenuItem = (item: MenuItem) => {
    const hasSubItems = item.items && item.items.length > 0;
    const isExpanded = expandedItems.has(item.label);
    const active = item.path ? isActive(item.path) : false;
    const Icon = item.icon;

    return (
      <div key={item.id} className="space-y-1">
        {item.path ? (
          <Link
            to={item.path}
            className={`flex items-center px-4 py-2 text-sm rounded-md transition-colors ${
              active
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            {Icon && <Icon className="w-5 h-5 mr-3" />}
            {item.label}
          </Link>
        ) : (
          <button
            onClick={() => toggleExpanded(item.label)}
            className={`flex items-center justify-between w-full px-4 py-2 text-sm rounded-md transition-colors ${
              active ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <div className="flex items-center">
              {Icon && <Icon className="w-5 h-5 mr-3" />}
              {item.label}
            </div>
            {hasSubItems && (
              <span className="ml-auto">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </span>
            )}
          </button>
        )}

        {hasSubItems && isExpanded && (
          <div className="ml-4 pl-4 border-l border-gray-200 space-y-1">
            {item.items.map(subItem => renderMenuItem(subItem))}
          </div>
        )}
      </div>
    );
  };

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
        fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out flex flex-col
        lg:relative lg:translate-x-0 lg:z-auto
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Header */}
        <div className="flex-none flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <Code className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Panel1</h1>
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

        {/* Navigation - Using flex-1 to fill available space */}
        <nav className="flex-1 flex flex-col overflow-y-auto">
          {/* Main navigation items */}
          <div className="flex-1 px-4 py-6 space-y-2">
            {navigation.map(item => renderMenuItem(item))}
          </div>

          {/* Plugin Navigation Slot */}
          <div className="flex-none px-4 pt-4 border-t border-gray-200">
            <PluginSlot 
              slotId="admin.nav.sidebar" 
              props={{ user, onNavigate: onClose }}
              className="space-y-2"
            />
          </div>
        </nav>

        {/* Footer */}
        <div className="flex-none p-4 border-t border-gray-200">
          <PluginSlot 
            slotId="admin.nav.footer" 
            props={{ user }}
            className="space-y-2"
          />
        </div>
      </aside>
    </>
  );
}