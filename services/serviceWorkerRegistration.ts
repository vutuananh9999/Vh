/**
 * Service Worker Registration Helper
 * Skips registration inside Capacitor native iOS/Android shell where assets load locally.
 */
import { isCapacitorNative } from './iosNativeBridge.ts';

export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  if (isCapacitorNative()) {
    return;
  }

  // Register only when page is loaded
  window.addEventListener('load', () => {
    try {
      navigator.serviceWorker
        .register('./sw.js')
        .then((registration) => {
          console.log('[Service Worker] Registered successfully with scope:', registration.scope);
        })
        .catch((error) => {
          console.info('[Service Worker] Registration skipped or failed:', error?.message || error);
        });
    } catch {
      console.info('[Service Worker] Registration not supported in current environment.');
    }
  });
}
