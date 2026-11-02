import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
if (import.meta.env.DEV) void import('./devDiagnostics');
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
if (import.meta.env.PROD && 'serviceWorker' in navigator)
  navigator.serviceWorker.register('/sw.js').catch(console.error);
