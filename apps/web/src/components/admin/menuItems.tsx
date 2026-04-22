import React from 'react';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Package,
  LifeBuoy,
  Settings,
} from 'lucide-react';

export const menuItems = [
  {
    label: 'Dashboard',
    icon: <LayoutDashboard className="w-5 h-5" />,
    href: '/admin',
    permission: 'core.dashboard.view'
  },
  {
    label: 'Clients',
    icon: <Users className="w-5 h-5" />,
    href: '/admin/clients',
    permission: 'clients.clients.view'
  },
  {
    label: 'Billing',
    icon: <CreditCard className="w-5 h-5" />,
    items: [
      {
        label: 'Invoices',
        href: '/admin/invoices',
        permission: 'billing.invoices.view'
      },
      {
        label: 'Plans',
        href: '/admin/plans',
        permission: 'catalog.plans.view'
      },
      {
        label: 'Payment Gateways',
        href: '/admin/payment-gateways',
        permission: 'billing.payment_gateways.view'
      }
    ]
  },
  {
    label: 'Catalog',
    icon: <Package className="w-5 h-5" />,
    items: [
      {
        label: 'Dashboard',
        href: '/admin/catalog',
        permission: 'catalog.dashboard.view'
      },
      {
        label: 'Products',
        href: '/admin/catalog/products',
        permission: 'catalog.products.manage'
      },
      {
        label: 'Components',
        href: '/admin/catalog/components',
        permission: 'catalog.components.manage'
      }
    ]
  },
  {
    label: 'Support',
    icon: <LifeBuoy className="w-5 h-5" />,
    items: [
      {
        label: 'Dashboard',
        href: '/admin/support',
        permission: 'support.dashboard.view'
      },
      {
        label: 'Tickets',
        href: '/admin/support/tickets',
        permission: 'support.tickets.view'
      },
      {
        label: 'Categories',
        href: '/admin/support/categories',
        permission: 'support.tickets.manage'
      }
    ]
  },
  {
    label: 'System',
    icon: <Settings className="w-5 h-5" />,
    items: [
      {
        label: 'Roles & Permissions',
        href: '/admin/roles',
        permission: 'core.roles.manage'
      },
      {
        label: 'Permission Groups',
        href: '/admin/permission-groups',
        permission: 'core.roles.manage_permissions'
      },
      {
        label: 'Plugins',
        href: '/admin/plugins',
        permission: 'core.plugins.view'
      },
      {
        label: 'Audit Logs',
        href: '/admin/audit-logs',
        permission: 'audit.logs.view'
      },
      {
        label: 'Analytics',
        href: '/admin/analytics',
        permission: 'reporting.analytics.view'
      }
    ]
  }
]; 