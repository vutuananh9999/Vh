/**
 * Service Worker Registration & PWA / Web Push Helper
 * Skips Service Worker & Web Push registration inside Capacitor native iOS/Android shell where assets load locally.
 */
import { isCapacitorNative } from './iosNativeBridge.ts';
import { apiFetch, isStandaloneMode } from './runtimeAdapter.ts';

export interface WebPushStatus {
  supported: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  requiresHomeScreenInstall: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
  subscriptionCount: number;
}

export function detectIOSDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent || '';
  return (
    /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function detectStandaloneMode(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  if (isCapacitorNative()) {
    return true;
  }
  const mediaStandalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const navigatorStandalone = (window.navigator as any)?.standalone === true;
  return Boolean(mediaStandalone || navigatorStandalone);
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

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

export async function getWebPushStatus(): Promise<WebPushStatus> {
  const isIOS = detectIOSDevice();
  const isStandalone = detectStandaloneMode();
  const hasPushAPIs =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
  const permission: NotificationPermission | 'unsupported' =
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  const requiresHomeScreenInstall = isIOS && !isStandalone && !isCapacitorNative();

  if (isCapacitorNative() || isStandaloneMode() || !hasPushAPIs) {
    return {
      supported: false,
      isIOS,
      isStandalone,
      requiresHomeScreenInstall,
      permission,
      subscribed: false,
      subscriptionCount: 0
    };
  }

  let subscribed = false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.getSubscription();
    subscribed = Boolean(sub);
  } catch {
    subscribed = false;
  }

  let subscriptionCount = 0;
  let serverSupported = true;
  try {
    const cfg = await apiFetch<{ supported?: boolean; subscriptionCount?: number }>('/api/push/config');
    serverSupported = cfg?.supported !== false;
    subscriptionCount = Number(cfg?.subscriptionCount || 0);
  } catch {
    serverSupported = false;
  }

  return {
    supported: serverSupported && hasPushAPIs,
    isIOS,
    isStandalone,
    requiresHomeScreenInstall,
    permission,
    subscribed,
    subscriptionCount
  };
}

export async function subscribeWebPush(deviceLabel?: string): Promise<WebPushStatus> {
  if (isCapacitorNative() || isStandaloneMode()) {
    throw new Error('Thông báo Web Push chỉ khả dụng ở chế độ kết nối máy chủ PWA.');
  }
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    throw new Error('Trình duyệt hiện tại không hỗ trợ Web Push.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Bạn chưa cấp quyền hiển thị thông báo cho Aetheria.');
  }

  const cfg = await apiFetch<{ publicKey?: string }>('/api/push/config');
  if (!cfg?.publicKey) {
    throw new Error('Không lấy được khóa công khai VAPID từ máy chủ.');
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(cfg.publicKey)
    });
  }

  await apiFetch('/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      deviceLabel
    })
  });

  return getWebPushStatus();
}

export async function unsubscribeWebPush(): Promise<WebPushStatus> {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        if (!isCapacitorNative() && !isStandaloneMode()) {
          await apiFetch('/api/push/unsubscribe', {
            method: 'POST',
            body: JSON.stringify({ endpoint: subscription.endpoint })
          }).catch(() => {});
        }
        await subscription.unsubscribe();
      }
    } catch {
      // Ignore cleanup errors
    }
  }
  return getWebPushStatus();
}

export async function sendTestWebPush(): Promise<{ ok?: boolean; sent: number; failed?: number }> {
  return apiFetch<{ ok?: boolean; sent: number; failed?: number }>('/api/push/test', {
    method: 'POST'
  });
}
