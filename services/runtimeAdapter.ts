/**
 * Runtime Adapter (Isomorphic KV + Dual-Mode Sync Bridge)
 *
 * Supports 3 execution modes cleanly:
 * 1. Node.js Server (`server.ts`): binds directly to `serverVault` for disk-backed persistence.
 * 2. Browser Remote Control UI (`http(s)://...`): communicates with Express `server.ts` over REST + WebSocket (`/ws`).
 * 3. Standalone On-Device Mode (iOS `.ipa` / Capacitor / Offline SPA): executes all AI & storage directly in-process
 *    backed by IndexedDB + Web Crypto AES-GCM + Capacitor Preferences, with zero server required.
 */

import { Story } from '../types.ts';
import type { PlotDebugLogItem } from './plotDebugLogger.ts';
import type { ThrottleState, QueueMode } from './requestThrottleService.ts';
import type {
  AIProviderType,
  ConnectionTestResult,
  ExternalProviderProfile,
  ModelDiscoveryResult,
  ProviderAuthScheme,
  ProviderDraftInput,
  ProviderRoutingConfig
} from './providerTypes.ts';
import { isCapacitorNative, isStandaloneBuildFlag } from './iosNativeBridge.ts';
import { localIndexedDbVault } from './localIndexedDbVault.ts';

export type ServerJobType =
  | 'generate_continue'
  | 'refine_chapter'
  | 'refine_selection'
  | 'generate_from_plot'
  | 'summarize_chapter'
  | 'summarize_all_sequential'
  | 'translate_chapter'
  | 'balance_chapter_length'
  | 'suggest_outline'
  | 'suggest_new_chapter'
  | 'analyze_plot_arc'
  | 'scan_story_entities'
  | 'extract_knowledge'
  | 'audit_story'
  | 'audit_chapter'
  | 'analyze_vocabulary'
  | 'chat_planning'
  | 'chat_plot'
  | 'learn_writing_dna'
  | 'learn_style_from_text'
  | 'learn_from_interaction'
  | 'fetch_web_inspiration'
  | 'generate_video';

export type ServerJobStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface ServerJobState {
  id: string;
  type: ServerJobType;
  storyId: string;
  chapterId?: string;
  title: string;
  status: ServerJobStatus;
  progress: number;
  statusText: string;
  subProgress?: { current: number; total: number; label: string } | null;
  streamPreview?: string;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  error?: string;
  result?: {
    pendingEdit?: { chapterId: string; original: string; modified: string; isTranslation?: boolean };
    consistencyReport?: any;
    auditReport?: any;
    chapterAuditReport?: any;
    vocabularyInsights?: any;
    plotArcAnalysis?: any;
    chapterSuggestion?: any;
    webInspiration?: any;
    generatedVideoUrl?: string;
    generatedText?: string;
  };
  acknowledged?: boolean;
}

export interface ServerBootstrapPayload {
  authenticated: boolean;
  passwordEnabled: boolean;
  envForcedPassword: boolean;
  standaloneMode?: boolean;
  dataDir?: string;
  settings: Record<string, string>;
  geminiApiKeyRaw: string;
  providers: ExternalProviderProfile[];
  providerRouting: ProviderRoutingConfig;
  storiesList: Story[];
  jobs: ServerJobState[];
  debugLogs: PlotDebugLogItem[];
  throttleState: ThrottleState;
  coolingGeminiKeys: Array<{ key: string; remainingMs: number }>;
  coolingProviderIds: string[];
  tokenUsage: any[];
}

export interface RuntimeKVBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StandaloneHandlers {
  bootstrap: () => Promise<ServerBootstrapPayload>;
  startJob: (type: ServerJobType, payload: any) => Promise<ServerJobState>;
  cancelJob: (jobId: string) => Promise<void>;
  cancelAllJobs: () => Promise<void>;
  cancelDebugLog: (logId: string) => Promise<void>;
  ackJob: (jobId: string) => Promise<void>;
  listJobs: () => Promise<ServerJobState[]>;
  runAiUtility: <T = any>(action: string, payload: any) => Promise<T>;
  discoverModels: (params: any) => Promise<ModelDiscoveryResult>;
  testCustomProvider: (profile: ExternalProviderProfile, timeoutMs?: number) => Promise<ConnectionTestResult>;
  testGeminiKey: (params: any) => Promise<any>;
  resetAllCooldowns: () => Promise<void>;
  updateThrottle: (partial: { mode?: QueueMode; interRequestDelayMs?: number }) => Promise<void>;
  clearDebugLogs: () => Promise<void>;
  saveGeminiKeys: (keys: string[]) => Promise<void>;
  listProviders: () => Promise<ExternalProviderProfile[]>;
  createProvider: (draft: ProviderDraftInput, activateRouting?: boolean) => Promise<ExternalProviderProfile>;
  updateProvider: (id: string, draft: Partial<ProviderDraftInput>) => Promise<ExternalProviderProfile>;
  duplicateProvider: (id: string) => Promise<ExternalProviderProfile>;
  deleteProvider: (id: string) => Promise<void>;
  setDefaultProvider: (id: string, activateExternalRouting?: boolean) => Promise<ExternalProviderProfile | undefined>;
  saveProviderRouting: (routing: ProviderRoutingConfig) => Promise<void>;
  importProviders: (rawJson: any, replaceExisting?: boolean) => Promise<{ importedCount: number; needsApiKeyCount: number }>;
  restoreProvidersFromDrive: (entries: any[]) => Promise<void>;
  saveAllProviders: (profiles: ExternalProviderProfile[]) => Promise<void>;
  recordProviderTestResult: (id: string, result: { success: boolean; message: string }) => Promise<void>;
}

const isNodeRuntime =
  typeof process !== 'undefined' &&
  Boolean(process.versions?.node) &&
  typeof window === 'undefined';

let customServerKV: RuntimeKVBackend | null = null;
let standaloneMode = !isNodeRuntime && (isCapacitorNative() || isStandaloneBuildFlag());
let standaloneHandlers: StandaloneHandlers | null = null;

const clientKVStore = new Map<string, string>();
let isClientBootstrapped = false;

export function bindServerKV(backend: RuntimeKVBackend): void {
  customServerKV = backend;
}

export function registerStandaloneHandlers(handlers: StandaloneHandlers): void {
  standaloneHandlers = handlers;
}

export function setStandaloneMode(enabled: boolean): void {
  standaloneMode = !isNodeRuntime && enabled;
}

export function isServerRuntime(): boolean {
  return isNodeRuntime || customServerKV !== null;
}

export function isStandaloneMode(): boolean {
  return !isServerRuntime() && standaloneMode;
}

export function isRemoteServerClient(): boolean {
  return typeof window !== 'undefined' && !isServerRuntime() && !standaloneMode;
}

export function setClientKVSnapshot(settings: Record<string, string>, geminiApiKeyRaw?: string): void {
  clientKVStore.clear();
  for (const [k, v] of Object.entries(settings || {})) {
    if (typeof v === 'string') {
      clientKVStore.set(k, v);
    }
  }
  if (typeof geminiApiKeyRaw === 'string' && geminiApiKeyRaw.length > 0) {
    clientKVStore.set('aetheria_api_key', geminiApiKeyRaw);
  }
  isClientBootstrapped = true;
}

export function isBootstrapReady(): boolean {
  return isClientBootstrapped;
}

export const CREDENTIAL_KV_KEYS = new Set<string>(['aetheria_api_key']);

function pushClientSettingMutation(key: string, value: string | null): void {
  if (typeof window === 'undefined' || isServerRuntime()) return;

  if (standaloneMode) {
    if (value === null) {
      localIndexedDbVault.removeKV(key);
    } else {
      localIndexedDbVault.setKV(key, value);
    }
    return;
  }

  if (CREDENTIAL_KV_KEYS.has(key)) {
    void apiFetch('/api/credentials/gemini', {
      method: 'PUT',
      body: JSON.stringify({ rawValue: value || '' })
    }).catch(err => console.error('[runtimeKV] Failed syncing credentials:', err));
    return;
  }

  void apiFetch('/api/settings', {
    method: 'PUT',
    body: JSON.stringify({ key, value })
  }).catch(err => console.error('[runtimeKV] Failed syncing setting:', err));
}

export const runtimeKV = {
  getItem(key: string): string | null {
    if (customServerKV) {
      return customServerKV.getItem(key);
    }
    if (typeof window === 'undefined') {
      return clientKVStore.get(key) ?? null;
    }
    if (clientKVStore.has(key)) {
      return clientKVStore.get(key) ?? null;
    }
    if (standaloneMode) {
      const val = localIndexedDbVault.getKV(key);
      if (val !== null) {
        clientKVStore.set(key, val);
      }
      return val;
    }
    return null;
  },

  setItem(key: string, value: string): void {
    if (customServerKV) {
      customServerKV.setItem(key, value);
      return;
    }
    clientKVStore.set(key, value);
    pushClientSettingMutation(key, value);
  },

  removeItem(key: string): void {
    if (customServerKV) {
      customServerKV.removeItem(key);
      return;
    }
    clientKVStore.delete(key);
    pushClientSettingMutation(key, null);
  },

  setLocalOnly(key: string, value: string | null): void {
    if (value === null) {
      clientKVStore.delete(key);
      if (standaloneMode) localIndexedDbVault.removeKV(key);
    } else {
      clientKVStore.set(key, value);
      if (standaloneMode) localIndexedDbVault.setKV(key, value);
    }
  }
};

export async function apiFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (!headers.has('Content-Type') && init.body && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('X-Requested-With', 'AetheriaRemote');

  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers
  });

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('aetheria_auth_required'));
  }

  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { error: text || `HTTP ${res.status}` };
  }

  if (!res.ok) {
    throw new Error(parsed?.error || parsed?.message || `HTTP ${res.status}`);
  }
  return parsed as T;
}

type EventCallback = (payload: any) => void;
const wsListeners = new Map<string, Set<EventCallback>>();
let wsInstance: WebSocket | null = null;
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;

export function emitRuntimeEvent(event: string, data: any): void {
  const listeners = wsListeners.get(event);
  if (!listeners) return;
  for (const cb of listeners) {
    try {
      cb(data);
    } catch (err) {
      console.error(`[serverSyncClient] Listener error for ${event}:`, err);
    }
  }
}

export const serverSyncClient = {
  subscribe(event: string, cb: EventCallback): () => void {
    let set = wsListeners.get(event);
    if (!set) {
      set = new Set();
      wsListeners.set(event, set);
    }
    set.add(cb);
    return () => {
      set?.delete(cb);
    };
  },

  async getAuthStatus(): Promise<{
    authenticated: boolean;
    passwordEnabled: boolean;
    envForcedPassword: boolean;
  }> {
    if (standaloneMode) {
      return {
        authenticated: true,
        passwordEnabled: false,
        envForcedPassword: false
      };
    }
    return apiFetch('/api/auth/status');
  },

  async login(password: string): Promise<{ ok: boolean }> {
    if (standaloneMode) return { ok: true };
    return apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password })
    });
  },

  async logout(): Promise<void> {
    if (standaloneMode) return;
    await apiFetch('/api/auth/logout', { method: 'POST' });
    this.disconnectWebSocket();
  },

  async updateServerPassword(newPassword: string | null): Promise<{
    passwordEnabled: boolean;
    envForcedPassword: boolean;
  }> {
    if (standaloneMode) {
      return { passwordEnabled: false, envForcedPassword: false };
    }
    return apiFetch('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ password: newPassword })
    });
  },

  async bootstrap(): Promise<ServerBootstrapPayload> {
    if (standaloneMode && standaloneHandlers) {
      const data = await standaloneHandlers.bootstrap();
      setClientKVSnapshot(data.settings, data.geminiApiKeyRaw);
      emitRuntimeEvent('bootstrap:loaded', data);
      return data;
    }
    const data = await apiFetch<ServerBootstrapPayload>('/api/bootstrap');
    setClientKVSnapshot(data.settings, data.geminiApiKeyRaw);
    emitRuntimeEvent('bootstrap:loaded', data);
    return data;
  },

  connectWebSocket(onReconnectSync?: () => void): void {
    if (typeof window === 'undefined') return;
    if (standaloneMode) {
      emitRuntimeEvent('ws:status', { connected: true });
      return;
    }
    if (wsInstance && (wsInstance.readyState === WebSocket.OPEN || wsInstance.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/ws`;

    try {
      const ws = new WebSocket(url);
      wsInstance = ws;

      ws.onopen = () => {
        const wasReconnect = reconnectAttempts > 0;
        reconnectAttempts = 0;
        emitRuntimeEvent('ws:status', { connected: true });
        if (wasReconnect && onReconnectSync) {
          onReconnectSync();
        }
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(String(evt.data || '{}'));
          if (!msg?.event) return;

          if (msg.event === 'settings:updated' && msg.data) {
            if (typeof msg.data.key === 'string') {
              runtimeKV.setLocalOnly(msg.data.key, msg.data.value ?? null);
            }
          } else if (msg.event === 'credentials:gemini_updated' && msg.data) {
            runtimeKV.setLocalOnly('aetheria_api_key', msg.data.rawValue || null);
          }

          emitRuntimeEvent(msg.event, msg.data);
        } catch {
          // ignore malformed WS frames
        }
      };

      ws.onclose = (evt) => {
        wsInstance = null;
        emitRuntimeEvent('ws:status', { connected: false });
        if (evt.code === 4401) {
          window.dispatchEvent(new CustomEvent('aetheria_auth_required'));
          return;
        }
        if (wsReconnectTimer) clearTimeout(wsReconnectTimer);
        const delay = Math.min(8000, 800 * Math.pow(1.5, reconnectAttempts++));
        wsReconnectTimer = setTimeout(() => {
          this.connectWebSocket(onReconnectSync);
        }, delay);
      };

      ws.onerror = () => {
        // handled by onclose
      };
    } catch {
      // ignore constructor errors
    }
  },

  disconnectWebSocket(): void {
    if (wsReconnectTimer) {
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = null;
    }
    if (wsInstance) {
      try {
        wsInstance.close();
      } catch {
        // ignore
      }
      wsInstance = null;
    }
  },

  // --- Background Jobs API ---
  async startJob(type: ServerJobType, payload: any): Promise<ServerJobState> {
    if (standaloneMode && standaloneHandlers) {
      return standaloneHandlers.startJob(type, payload);
    }
    const res = await apiFetch<{ job: ServerJobState }>('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ type, payload })
    });
    return res.job;
  },

  async cancelJob(jobId: string): Promise<void> {
    if (standaloneMode && standaloneHandlers) {
      await standaloneHandlers.cancelJob(jobId);
      return;
    }
    await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
  },

  async cancelAllJobs(): Promise<void> {
    if (standaloneMode && standaloneHandlers) {
      await standaloneHandlers.cancelAllJobs();
      return;
    }
    await apiFetch('/api/jobs/cancel-all', { method: 'POST' });
  },

  async cancelDebugLog(logId: string): Promise<void> {
    if (standaloneMode && standaloneHandlers) {
      await standaloneHandlers.cancelDebugLog(logId);
      return;
    }
    await apiFetch(`/api/debug/logs/${encodeURIComponent(logId)}/cancel`, { method: 'POST' });
  },

  async ackJob(jobId: string): Promise<void> {
    if (standaloneMode && standaloneHandlers) {
      await standaloneHandlers.ackJob(jobId);
      return;
    }
    await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/ack`, { method: 'POST' });
  },

  async listJobs(): Promise<ServerJobState[]> {
    if (standaloneMode && standaloneHandlers) {
      return standaloneHandlers.listJobs();
    }
    const res = await apiFetch<{ jobs: ServerJobState[] }>('/api/jobs');
    return res.jobs || [];
  },

  // --- Utility AI Calls ---
  async runAiUtility<T = any>(action: string, payload: any): Promise<T> {
    if (standaloneMode && standaloneHandlers) {
      return standaloneHandlers.runAiUtility<T>(action, payload);
    }
    const res = await apiFetch<{ result: T }>('/api/ai/utility', {
      method: 'POST',
      body: JSON.stringify({ action, payload })
    });
    return res.result;
  },

  // --- Provider / Key Operations ---
  async discoverModels(params: {
    providerType: AIProviderType;
    baseUrl: string;
    apiKey: string;
    authScheme?: ProviderAuthScheme;
    authHeaderName?: string;
    customHeaders?: Record<string, string>;
    forceRefresh?: boolean;
  }): Promise<ModelDiscoveryResult> {
    if (standaloneMode && standaloneHandlers) {
      return standaloneHandlers.discoverModels(params);
    }
    return apiFetch('/api/providers/discover-models', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  },

  async testCustomProvider(profile: ExternalProviderProfile, timeoutMs = 15000): Promise<ConnectionTestResult> {
    if (standaloneMode && standaloneHandlers) {
      return standaloneHandlers.testCustomProvider(profile, timeoutMs);
    }
    return apiFetch('/api/providers/test', {
      method: 'POST',
      body: JSON.stringify({ profile, timeoutMs })
    });
  },

  async testGeminiKey(params: {
    apiKey: string;
    model?: string;
    mode?: 'simple' | 'direct';
    timeoutMs?: number;
  }): Promise<any> {
    if (standaloneMode && standaloneHandlers) {
      return standaloneHandlers.testGeminiKey(params);
    }
    return apiFetch('/api/keys/test', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  },

  async resetAllCooldowns(): Promise<void> {
    if (standaloneMode && standaloneHandlers) {
      await standaloneHandlers.resetAllCooldowns();
      return;
    }
    await apiFetch('/api/cooldowns/reset', { method: 'POST' });
  },

  async updateThrottle(partial: { mode?: QueueMode; interRequestDelayMs?: number }): Promise<void> {
    if (standaloneMode && standaloneHandlers) {
      await standaloneHandlers.updateThrottle(partial);
      return;
    }
    await apiFetch('/api/throttle', {
      method: 'PUT',
      body: JSON.stringify(partial)
    });
  },

  async clearDebugLogs(): Promise<void> {
    if (standaloneMode && standaloneHandlers) {
      await standaloneHandlers.clearDebugLogs();
      return;
    }
    await apiFetch('/api/debug/clear', { method: 'POST' });
  },

  async saveGeminiKeys(keys: string[]): Promise<void> {
    const cleaned = keys.map(k => k.trim()).filter(Boolean);
    const rawValue = cleaned.length > 0 ? JSON.stringify(cleaned) : '';
    runtimeKV.setLocalOnly('aetheria_api_key', rawValue || null);
    if (standaloneMode && standaloneHandlers) {
      await standaloneHandlers.saveGeminiKeys(cleaned);
      return;
    }
    await apiFetch('/api/credentials/gemini', {
      method: 'PUT',
      body: JSON.stringify({ rawValue })
    });
  },

  // --- Provider CRUD ---
  async listProviders(): Promise<ExternalProviderProfile[]> {
    if (standaloneMode && standaloneHandlers) {
      return standaloneHandlers.listProviders();
    }
    const res = await apiFetch<{ providers: ExternalProviderProfile[] }>('/api/providers');
    return res.providers || [];
  },

  async createProvider(draft: ProviderDraftInput, activateRouting = true): Promise<ExternalProviderProfile> {
    if (standaloneMode && standaloneHandlers) {
      return standaloneHandlers.createProvider(draft, activateRouting);
    }
    const res = await apiFetch<{ provider: ExternalProviderProfile }>('/api/providers', {
      method: 'POST',
      body: JSON.stringify({ draft, activateRouting })
    });
    return res.provider;
  },

  async updateProvider(id: string, draft: Partial<ProviderDraftInput>): Promise<ExternalProviderProfile> {
    if (standaloneMode && standaloneHandlers) {
      return standaloneHandlers.updateProvider(id, draft);
    }
    const res = await apiFetch<{ provider: ExternalProviderProfile }>(`/api/providers/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ draft })
    });
    return res.provider;
  },

  async duplicateProvider(id: string): Promise<ExternalProviderProfile> {
    if (standaloneMode && standaloneHandlers) {
      return standaloneHandlers.duplicateProvider(id);
    }
    const res = await apiFetch<{ provider: ExternalProviderProfile }>(
      `/api/providers/${encodeURIComponent(id)}/duplicate`,
      { method: 'POST' }
    );
    return res.provider;
  },

  async deleteProvider(id: string): Promise<void> {
    if (standaloneMode && standaloneHandlers) {
      await standaloneHandlers.deleteProvider(id);
      return;
    }
    await apiFetch(`/api/providers/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async setDefaultProvider(id: string, activateExternalRouting = true): Promise<ExternalProviderProfile | undefined> {
    if (standaloneMode && standaloneHandlers) {
      return standaloneHandlers.setDefaultProvider(id, activateExternalRouting);
    }
    const res = await apiFetch<{ provider?: ExternalProviderProfile }>(
      `/api/providers/${encodeURIComponent(id)}/default`,
      {
        method: 'POST',
        body: JSON.stringify({ activateExternalRouting })
      }
    );
    return res.provider;
  },

  async saveProviderRouting(routing: ProviderRoutingConfig): Promise<void> {
    if (standaloneMode && standaloneHandlers) {
      await standaloneHandlers.saveProviderRouting(routing);
      return;
    }
    await apiFetch('/api/providers/routing', {
      method: 'PUT',
      body: JSON.stringify(routing)
    });
  },

  async importProviders(rawJson: any, replaceExisting = false): Promise<{ importedCount: number; needsApiKeyCount: number }> {
    if (standaloneMode && standaloneHandlers) {
      return standaloneHandlers.importProviders(rawJson, replaceExisting);
    }
    return apiFetch('/api/providers/import', {
      method: 'POST',
      body: JSON.stringify({ rawJson, replaceExisting })
    });
  },

  async restoreProvidersFromDrive(entries: any[]): Promise<void> {
    if (standaloneMode && standaloneHandlers) {
      await standaloneHandlers.restoreProvidersFromDrive(entries);
      return;
    }
    await apiFetch('/api/providers/restore-drive', {
      method: 'POST',
      body: JSON.stringify({ entries })
    });
  },

  async saveAllProviders(profiles: ExternalProviderProfile[]): Promise<void> {
    if (standaloneMode && standaloneHandlers) {
      await standaloneHandlers.saveAllProviders(profiles);
      return;
    }
    await apiFetch('/api/providers/bulk', {
      method: 'PUT',
      body: JSON.stringify({ profiles })
    });
  },

  async recordProviderTestResult(id: string, result: { success: boolean; message: string }): Promise<void> {
    if (standaloneMode && standaloneHandlers) {
      await standaloneHandlers.recordProviderTestResult(id, result);
      return;
    }
    await apiFetch(`/api/providers/${encodeURIComponent(id)}/test-result`, {
      method: 'POST',
      body: JSON.stringify(result)
    });
  }
};
