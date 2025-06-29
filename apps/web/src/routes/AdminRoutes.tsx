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
import { routeManager } from '../lib/plugins';

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
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="clients" element={<AdminClients />} />
        
        {/* Support System Routes */}
        <Route path="support" element={<SupportDashboard />} />
        <Route path="support/tickets" element={<SupportTickets />} />
        <Route path="support/knowledge-base" element={<div className="p-6"><h1 className="text-2xl font-bold">Knowledge Base</h1><p className="text-gray-600">Coming soon...</p></div>} />
        <Route path="support/automation" element={<div className="p-6"><h1 className="text-2xl font-bold">Automation Rules</h1><p className="text-gray-600">Coming soon...</p></div>} />
        <Route path="support/agents" element={<div className="p-6"><h1 className="text-2xl font-bold">Agent Management</h1><p className="text-gray-600">Coming soon...</p></div>} />
        
        <Route path="billing" element={<AdminBilling />} />
        <Route path="invoices" element={<AdminInvoices />} />
        <Route path="plans" element={<AdminPlans />} />
        
        {/* Missing Feature Placeholders */}
        <Route path="domains" element={<AdminDomains />} />
        <Route path="ssl" element={<AdminSSL />} />
        <Route path="provisioning" element={<AdminProvisioning />} />
        <Route path="payment-gateways" element={<AdminPaymentGateways />} />
        
        <Route path="analytics" element={<AdminAnalytics />} />
        <Route path="plugins" element={<AdminPlugins />} />
        <Route path="tenants" element={<AdminTenants />} />
        <Route path="audit-logs" element={<AdminAuditLogs />} />
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