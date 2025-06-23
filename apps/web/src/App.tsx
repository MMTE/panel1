import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import { ClientPortal } from './pages/client/ClientPortal';
import { AdminRoute } from './components/auth/AdminRoute';
import { AdminRoutes } from './routes/AdminRoutes';
import { TenantBranding } from './components/TenantBranding';
import { useAuth } from './hooks/useAuth';
import { DemoModeIndicator } from './components/DemoModeIndicator';

function App() {
  const { user } = useAuth();

  return (
    <Router>
      <TenantBranding />
      {import.meta.env.VITE_DEMO_MODE === 'true' && <DemoModeIndicator />}
      
      <Routes>
        <Route path="/" element={<LandingPage />} />
        
        {/* Client Portal Route */}
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
    </Router>
  );
}

export default App;