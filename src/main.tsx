import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { TRPCProvider } from './providers/TRPCProvider';
import { AuthProvider } from './hooks/useAuth';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <TRPCProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </TRPCProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);