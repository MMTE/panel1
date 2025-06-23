import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { TRPCProvider } from './providers/TRPCProvider.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TRPCProvider>
      <App />
    </TRPCProvider>
  </React.StrictMode>,
);