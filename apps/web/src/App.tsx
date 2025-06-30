import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import LandingPage from './pages/LandingPage';
import { ClientPortal } from './pages/client/ClientPortal';
import { ClientPortalRefactored } from './pages/client/ClientPortalRefactored';
import { AdminRoute } from './components/auth/AdminRoute';
import { AdminRoutes } from './routes/AdminRoutes';
import { TenantBranding } from './components/TenantBranding';
import { useAuth } from './hooks/useAuth';
import { PermissionsProvider } from './hooks/usePermissions';

import { DevBottomBar } from './components/DevBottomBar';

function App() {
  const { user } = useAuth();
  
  // Apply padding if in development mode to account for dev bottom bar
  const isDev = import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true';

  return (
    <PermissionsProvider>
    <div className={isDev ? 'pb-16' : ''}>
      <Toaster position="top-right" />
      <Router
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <TenantBranding />

      
      <Routes>
        <Route path="/" element={<LandingPage />} />
        
        {/* Client Portal Routes */}
        <Route 
          path="/portal" 
          element={
            user && user.role === 'CLIENT' ? (
              <ClientPortal />
            ) : (
              <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="text-center">
                  <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
                  <p className="text-gray-400">Client portal access required.</p>
                </div>
              </div>
            )
          } 
        />
        
        {/* New Client Portal Route */}
        <Route 
          path="/client" 
          element={
            user ? (
              <ClientPortalRefactored />
            ) : (
              <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="text-center">
                  <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
                  <p className="text-gray-400">Please sign in to access the client portal.</p>
                </div>
              </div>
            )
          } 
        />
        
        {/* Admin Routes */}
        <Route 
          path="/admin/*" 
          element={
            <AdminRoute>
              <AdminRoutes />
            </AdminRoute>
          } 
        />
      </Routes>
      
              {/* Development tools */}
        <DevBottomBar />
      </Router>
    </div>
    </PermissionsProvider>
  );
}

export default App;