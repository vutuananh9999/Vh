
import React from 'react';
import * as ReactDOMClient from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { registerServiceWorker } from './services/serviceWorkerRegistration.ts';
import { providerManagerService } from './services/providerManagerService.ts';
import { initCapacitorNativeShell } from './services/iosNativeBridge.ts';
import { isStandaloneMode } from './services/runtimeAdapter.ts';
import { registerStandaloneRuntime } from './services/localJobRunner.ts';

if (isStandaloneMode()) {
  registerStandaloneRuntime();
}

// Initialize Capacitor Native Shell, Service Worker & Secure AI Provider Vault
void initCapacitorNativeShell();
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
