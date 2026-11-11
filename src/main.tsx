import React from 'react';
import { createRoot } from 'react-dom/client';
import CompanyGate from './CompanyGate';
import PwaUpdate from './PwaUpdate';
import WorkspaceErrorBoundary from './WorkspaceErrorBoundary';
import './styles.css';
if (import.meta.env.DEV) void import('./devDiagnostics');
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WorkspaceErrorBoundary>
      <CompanyGate />
    </WorkspaceErrorBoundary>
    <PwaUpdate />
  </React.StrictMode>,
);
if (import.meta.env.PROD && 'serviceWorker' in navigator)
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(console.error);
