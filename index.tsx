
import React from 'react';
import * as ReactDOMClient from 'react-dom/client';
import App from './App.tsx';
import { registerServiceWorker } from './services/serviceWorkerRegistration.ts';

// Initialize Service Worker
registerServiceWorker();

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
