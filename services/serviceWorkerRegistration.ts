/**
 * Service Worker Registration Helper
 */

export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  // Register only when page is loaded
  window.addEventListener('load', () => {
    // Avoid registering in restrictive iframe sandboxes if serviceWorker is blocked
    try {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('[Service Worker] Registered successfully with scope:', registration.scope);
        })
        .catch((error) => {
          console.info('[Service Worker] Registration skipped or failed (benign in some iframe sandboxes):', error?.message || error);
        });
    } catch (e) {
      console.info('[Service Worker] Registration not supported in current environment.');
    }
  });
}
