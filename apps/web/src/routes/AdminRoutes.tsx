import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AdminLayout } from '../pages/admin/AdminLayout';
import { AdminDashboard } from '../pages/admin/AdminDashboard';
import { AdminUsers } from '../pages/admin/AdminUsers';
import { AdminClients } from '../pages/admin/AdminClients';
import { AdminBilling } from '../pages/admin/AdminBilling';
import { AdminInvoices } from '../pages/admin/AdminInvoices';
import { AdminPlans } from '../pages/admin/AdminPlans';
import { AdminAnalytics } from '../pages/admin/AdminAnalytics';
import { AdminPlugins } from '../pages/admin/AdminPlugins';
import { AdminTenants } from '../pages/admin/AdminTenants';
import { SupportDashboard } from '../pages/admin/support/SupportDashboard';
import { SupportTickets } from '../pages/admin/support/SupportTickets';
import { AdminDomains } from '../pages/admin/AdminDomains';
import { AdminSSL } from '../pages/admin/AdminSSL';
import { AdminProvisioning } from '../pages/admin/AdminProvisioning';
import { AdminPaymentGateways } from '../pages/admin/AdminPaymentGateways';
import { AdminAuditLogs } from '../pages/admin/AdminAuditLogs';
import { AdminSubscriptions } from '../pages/admin/AdminSubscriptions';
import AdminRoles from '../pages/admin/AdminRoles';
import CatalogDashboard from '../pages/admin/catalog/CatalogDashboard';
import ProductsManagement from '../pages/admin/catalog/ProductsManagement';
import { routeManager } from '../lib/plugins';
import { ProductStorePage } from '../pages/store/ProductStorePage';
import { CartPage } from '../pages/store/CartPage';
import { CheckoutPage } from '../pages/store/CheckoutPage';
import { CheckoutSuccessPage } from '../pages/store/CheckoutSuccessPage';
import { withPermission } from '../components/auth/withPermission';
import AdminRolesAndPermissions from '../pages/admin/AdminRolesAndPermissions';
import ComponentRegistrationManagement from '../pages/admin/catalog/ComponentRegistrationManagement';
import AdminPermissionGroups from '../pages/admin/AdminPermissionGroups';

// Protect routes with permissions
const ProtectedAdminDashboard = withPermission(AdminDashboard, {
  permissionId: 'admin.dashboard.view'
});

const ProtectedAdminClients = withPermission(AdminClients, {
  permissionId: 'admin.clients.view'
});

const ProtectedAdminInvoices = withPermission(AdminInvoices, {
  permissionId: 'admin.invoices.view'
});

const ProtectedAdminPlans = withPermission(AdminPlans, {
  permissionId: 'admin.plans.view'
});

const ProtectedAdminPaymentGateways = withPermission(AdminPaymentGateways, {
  permissionId: 'admin.payment_gateways.view'
});

const ProtectedAdminPlugins = withPermission(AdminPlugins, {
  permissionId: 'admin.plugins.view'
});

const ProtectedAdminRolesAndPermissions = withPermission(AdminRolesAndPermissions, {
  permissionId: 'admin.roles.manage'
});

const ProtectedAdminAuditLogs = withPermission(AdminAuditLogs, {
  permissionId: 'admin.audit_logs.view'
});

const ProtectedAdminAnalytics = withPermission(AdminAnalytics, {
  permissionId: 'admin.analytics.view'
});

const ProtectedAdminDomains = withPermission(AdminDomains, {
  permissionId: 'admin.domains.view'
});

const ProtectedAdminBilling = withPermission(AdminBilling, {
  permissionId: 'admin.billing.view'
});

const ProtectedCatalogDashboard = withPermission(CatalogDashboard, {
  permissionId: 'admin.catalog.view'
});

const ProtectedProductsManagement = withPermission(ProductsManagement, {
  permissionId: 'admin.catalog.products.manage'
});

const ProtectedComponentRegistrationManagement = withPermission(ComponentRegistrationManagement, {
  permissionId: 'admin.catalog.components.manage'
});

const ProtectedSupportDashboard = withPermission(SupportDashboard, {
  permissionId: 'admin.support.view'
});

const ProtectedSupportTickets = withPermission(SupportTickets, {
  permissionId: 'admin.support.tickets.view'
});

export function AdminRoutes() {
  // Get dynamic plugin routes
  const pluginRoutes = routeManager.getAllRoutes()
    .filter(route => route.route.includes('/admin/'))
    .map(route => ({
      path: route.route.replace(/^[A-Z]+\s+/, ''), // Remove HTTP method
      pluginId: route.pluginId
    }));

  return (
    <Routes>
      <Route path="/" element={<AdminLayout />}>
        {/* Core Admin Routes */}
        <Route index element={<ProtectedAdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="roles" element={<ProtectedAdminRolesAndPermissions />} />
        <Route path="clients" element={<ProtectedAdminClients />} />
        
        {/* Support System Routes */}
        <Route path="support" element={<ProtectedSupportDashboard />} />
        <Route path="support/tickets" element={<ProtectedSupportTickets />} />
        <Route path="support/knowledge-base" element={<div className="p-6"><h1 className="text-2xl font-bold">Knowledge Base</h1><p className="text-gray-600">Coming soon...</p></div>} />
        <Route path="support/automation" element={<div className="p-6"><h1 className="text-2xl font-bold">Automation Rules</h1><p className="text-gray-600">Coming soon...</p></div>} />
        <Route path="support/agents" element={<div className="p-6"><h1 className="text-2xl font-bold">Agent Management</h1><p className="text-gray-600">Coming soon...</p></div>} />
        
        <Route path="billing" element={<ProtectedAdminBilling />} />
        <Route path="subscriptions" element={<AdminSubscriptions />} />
        <Route path="invoices" element={<ProtectedAdminInvoices />} />
        <Route path="plans" element={<ProtectedAdminPlans />} />
        
        {/* Catalog Management Routes */}
        <Route path="catalog">
          <Route index element={<ProtectedCatalogDashboard />} />
          <Route path="products" element={<ProtectedProductsManagement />} />
          <Route path="components" element={<ProtectedComponentRegistrationManagement />} />
        </Route>
        
        {/* Missing Feature Placeholders */}
        <Route path="domains" element={<ProtectedAdminDomains />} />
        <Route path="ssl" element={<AdminSSL />} />
        <Route path="provisioning" element={<AdminProvisioning />} />
        <Route path="payment-gateways" element={<ProtectedAdminPaymentGateways />} />
        
        <Route path="analytics" element={<ProtectedAdminAnalytics />} />
        <Route path="plugins" element={<ProtectedAdminPlugins />} />
        <Route path="tenants" element={<AdminTenants />} />
        <Route path="audit-logs" element={<ProtectedAdminAuditLogs />} />
        <Route path="settings" element={<div className="p-6"><h1 className="text-2xl font-bold">Settings</h1><p className="text-gray-600">Coming soon...</p></div>} />

        {/* Dynamic Plugin Routes */}
        {pluginRoutes.map((route, index) => (
          <Route
            key={index}
            path={route.path.replace('/admin/', '')}
            element={
              <div className="p-6">
                <h1 className="text-2xl font-bold">Plugin Route</h1>
                <p className="text-gray-600">
                  This route is provided by plugin: {route.pluginId}
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Path: {route.path}
                </p>
              </div>
            }
          />
        ))}

        {/* Store Routes */}
        <Route path="/store" element={<ProductStorePage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/checkout/success" element={<CheckoutSuccessPage />} />

        {/* Permission Groups Route */}
        <Route path="permission-groups" element={<AdminPermissionGroups />} />

        {/* 404 Route */}
        <Route 
          path="*" 
          element={
            <div className="p-6 text-center">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Page Not Found</h1>
              <p className="text-gray-600">The requested admin page could not be found.</p>
            </div>
          } 
        />
      </Route>
    </Routes>
  );
}