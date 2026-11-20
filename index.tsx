
import React from 'react';
import * as ReactDOMClient from 'react-dom/client';
import App from './App.tsx';
import { registerServiceWorker } from './services/serviceWorkerRegistration.ts';
import { providerManagerService } from './services/providerManagerService.ts';

// Initialize Service Worker & Secure AI Provider Vault
registerServiceWorker();
void providerManagerService.initialize();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOMClient.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
