import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';

let nativeShellInitialized = false;

export function isCapacitorNative(): boolean {
  try {
    return typeof window !== 'undefined' && Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function getCapacitorPlatform(): 'ios' | 'android' | 'web' {
  try {
    if (typeof window === 'undefined') return 'web';
    const platform = Capacitor.getPlatform();
    if (platform === 'ios' || platform === 'android') return platform;
    return 'web';
  } catch {
    return 'web';
  }
}

export function isStandaloneBuildFlag(): boolean {
  try {
    return (import.meta as any)?.env?.VITE_STANDALONE === '1';
  } catch {
    return false;
  }
}

export async function initCapacitorNativeShell(): Promise<void> {
  if (nativeShellInitialized || !isCapacitorNative()) return;
  nativeShellInitialized = true;

  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setOverlaysWebView({ overlay: true });
    if (getCapacitorPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#030712' });
    }
  } catch {
    // StatusBar optional on simulator/older targets
  }

  try {
    await Keyboard.setResizeMode({ mode: KeyboardResize.Native });
  } catch {
    // Keyboard plugin optional
  }

  try {
    await SplashScreen.hide();
  } catch {
    // SplashScreen optional
  }

  try {
    void CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aetheria_app_resumed'));
      }
    });
  } catch {
    // Ignore listener errors
  }
}

export async function mirrorPreferenceSet(key: string, value: string): Promise<void> {
  if (!isCapacitorNative()) return;
  try {
    await Preferences.set({ key: `aetheria:${key}`, value });
  } catch {
    // Non-fatal fallback
  }
}

export async function mirrorPreferenceRemove(key: string): Promise<void> {
  if (!isCapacitorNative()) return;
  try {
    await Preferences.remove({ key: `aetheria:${key}` });
  } catch {
    // Non-fatal
  }
}

export async function loadAllNativePreferences(): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  if (!isCapacitorNative()) return result;
  try {
    const { keys } = await Preferences.keys();
    for (const fullKey of keys || []) {
      if (!fullKey.startsWith('aetheria:')) continue;
      const item = await Preferences.get({ key: fullKey });
      if (typeof item.value === 'string') {
        result[fullKey.slice('aetheria:'.length)] = item.value;
      }
    }
  } catch {
    // Ignore
  }
  return result;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function sanitizeExportFilename(rawName: string, fallbackExt = 'txt'): string {
  const cleaned = (rawName || `aetheria_export.${fallbackExt}`)
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim();
  return cleaned || `aetheria_export.${fallbackExt}`;
}

export async function shareOrDownloadFile(
  filename: string,
  content: Blob | string,
  mimeType: string = 'application/octet-stream'
): Promise<void> {
  const safeName = sanitizeExportFilename(filename);
  const blob =
    content instanceof Blob ? content : new Blob([content], { type: mimeType });

  if (isCapacitorNative()) {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const base64Data = arrayBufferToBase64(arrayBuffer);
      const path = `exports/${Date.now()}_${safeName}`;

      await Filesystem.writeFile({
        path,
        data: base64Data,
        directory: Directory.Cache,
        recursive: true
      });

      const uriResult = await Filesystem.getUri({
        path,
        directory: Directory.Cache
      });

      await Share.share({
        title: safeName,
        url: uriResult.uri,
        dialogTitle: `Xuất tệp ${safeName}`
      });
      return;
    } catch (err: any) {
      // If user dismissed iOS Share Sheet cleanly, do not treat as fatal error
      const msg = String(err?.message || err || '').toLowerCase();
      if (msg.includes('cancel') || msg.includes('dismiss')) {
        return;
      }
      console.warn('[iosNativeBridge] Native share failed, falling back to browser download:', err);
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
