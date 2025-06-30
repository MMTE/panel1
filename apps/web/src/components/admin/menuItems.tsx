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
    permission: 'admin.dashboard.view'
  },
  {
    label: 'Clients',
    icon: <Users className="w-5 h-5" />,
    href: '/admin/clients',
    permission: 'admin.clients.view'
  },
  {
    label: 'Billing',
    icon: <CreditCard className="w-5 h-5" />,
    items: [
      {
        label: 'Invoices',
        href: '/admin/invoices',
        permission: 'admin.invoices.view'
      },
      {
        label: 'Plans',
        href: '/admin/plans',
        permission: 'admin.plans.view'
      },
      {
        label: 'Payment Gateways',
        href: '/admin/payment-gateways',
        permission: 'admin.payment_gateways.view'
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
        permission: 'admin.catalog.view'
      },
      {
        label: 'Products',
        href: '/admin/catalog/products',
        permission: 'admin.catalog.products.manage'
      },
      {
        label: 'Components',
        href: '/admin/catalog/components',
        permission: 'admin.catalog.components.manage'
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
        permission: 'admin.support.view'
      },
      {
        label: 'Tickets',
        href: '/admin/support/tickets',
        permission: 'admin.support.tickets.view'
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
        permission: 'admin.roles.manage'
      },
      {
        label: 'Permission Groups',
        href: '/admin/permission-groups',
        permission: 'admin.roles.manage_permissions'
      },
      {
        label: 'Plugins',
        href: '/admin/plugins',
        permission: 'admin.plugins.view'
      },
      {
        label: 'Audit Logs',
        href: '/admin/audit-logs',
        permission: 'admin.audit_logs.view'
      },
      {
        label: 'Analytics',
        href: '/admin/analytics',
        permission: 'admin.analytics.view'
      }
    ]
  }
]; 