import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './public.css';
import PublicTransfer from './PublicTransfer.jsx';

// Standalone public page — intentionally NOT wrapped in AuthProvider. It is used
// by an external contact with no CRM account and talks only to /api/public-transfer.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PublicTransfer />
  </StrictMode>
);
