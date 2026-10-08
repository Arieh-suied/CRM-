import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { ToastProvider, DialogProvider } from './components/ui';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <DialogProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </DialogProvider>
    </ToastProvider>
  </StrictMode>
);
