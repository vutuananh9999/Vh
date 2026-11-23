/**
 * Runtime Adapter (Isomorphic KV + Client-Server WebSocket/REST Sync Bridge)
 *
 * - On Node.js Server (`server.ts`): binds directly to `serverVault` for zero-latency
 *   disk-backed persistence of settings, encrypted credentials, and real-time broadcasts.
 * - On Browser (`Remote Control UI`): holds an in-memory hydrated mirror from `/api/bootstrap`
 *   and synchronizes mutations & live server events over REST + WebSocket (`/ws`).
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

const isNodeRuntime =
  typeof process !== 'undefined' &&
  Boolean(process.versions?.node) &&
  typeof window === 'undefined';

let customServerKV: RuntimeKVBackend | null = null;
const clientKVStore = new Map<string, string>();
let isClientBootstrapped = false;

export function bindServerKV(backend: RuntimeKVBackend): void {
  customServerKV = backend;
}

export function isServerRuntime(): boolean {
  return isNodeRuntime || customServerKV !== null;
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
    } else {
      clientKVStore.set(key, value);
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

function emitLocalEvent(event: string, data: any): void {
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
    return apiFetch('/api/auth/status');
  },

  async login(password: string): Promise<{ ok: boolean }> {
    return apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password })
    });
  },

  async logout(): Promise<void> {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    this.disconnectWebSocket();
  },

  async updateServerPassword(newPassword: string | null): Promise<{
    passwordEnabled: boolean;
    envForcedPassword: boolean;
  }> {
    return apiFetch('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ password: newPassword })
    });
  },

  async bootstrap(): Promise<ServerBootstrapPayload> {
    const data = await apiFetch<ServerBootstrapPayload>('/api/bootstrap');
    setClientKVSnapshot(data.settings, data.geminiApiKeyRaw);
    emitLocalEvent('bootstrap:loaded', data);
    return data;
  },

  connectWebSocket(onReconnectSync?: () => void): void {
    if (typeof window === 'undefined') return;
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
        emitLocalEvent('ws:status', { connected: true });
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

          emitLocalEvent(msg.event, msg.data);
        } catch {
          // ignore malformed WS frames
        }
      };

      ws.onclose = (evt) => {
        wsInstance = null;
        emitLocalEvent('ws:status', { connected: false });
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

  // --- Server Background Jobs API ---
  async startJob(type: ServerJobType, payload: any): Promise<ServerJobState> {
    const res = await apiFetch<{ job: ServerJobState }>('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ type, payload })
    });
    return res.job;
  },

  async cancelJob(jobId: string): Promise<void> {
    await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
  },

  async cancelAllJobs(): Promise<void> {
    await apiFetch('/api/jobs/cancel-all', { method: 'POST' });
  },

  async cancelDebugLog(logId: string): Promise<void> {
    await apiFetch(`/api/debug/logs/${encodeURIComponent(logId)}/cancel`, { method: 'POST' });
  },

  async ackJob(jobId: string): Promise<void> {
    await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/ack`, { method: 'POST' });
  },

  async listJobs(): Promise<ServerJobState[]> {
    const res = await apiFetch<{ jobs: ServerJobState[] }>('/api/jobs');
    return res.jobs || [];
  },

  // --- Utility AI Calls ---
  async runAiUtility<T = any>(action: string, payload: any): Promise<T> {
    const res = await apiFetch<{ result: T }>('/api/ai/utility', {
      method: 'POST',
      body: JSON.stringify({ action, payload })
    });
    return res.result;
  },

  // --- Provider / Key Server Operations ---
  async discoverModels(params: {
    providerType: AIProviderType;
    baseUrl: string;
    apiKey: string;
    authScheme?: ProviderAuthScheme;
    authHeaderName?: string;
    customHeaders?: Record<string, string>;
    forceRefresh?: boolean;
  }): Promise<ModelDiscoveryResult> {
    return apiFetch('/api/providers/discover-models', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  },

  async testCustomProvider(profile: ExternalProviderProfile, timeoutMs = 15000): Promise<ConnectionTestResult> {
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
    return apiFetch('/api/keys/test', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  },

  async resetAllCooldowns(): Promise<void> {
    await apiFetch('/api/cooldowns/reset', { method: 'POST' });
  },

  async updateThrottle(partial: { mode?: QueueMode; interRequestDelayMs?: number }): Promise<void> {
    await apiFetch('/api/throttle', {
      method: 'PUT',
      body: JSON.stringify(partial)
    });
  },

  async clearDebugLogs(): Promise<void> {
    await apiFetch('/api/debug/clear', { method: 'POST' });
  },

  async saveGeminiKeys(keys: string[]): Promise<void> {
    const cleaned = keys.map(k => k.trim()).filter(Boolean);
    const rawValue = cleaned.length > 0 ? JSON.stringify(cleaned) : '';
    runtimeKV.setLocalOnly('aetheria_api_key', rawValue || null);
    await apiFetch('/api/credentials/gemini', {
      method: 'PUT',
      body: JSON.stringify({ rawValue })
    });
  },

  // --- Provider CRUD on Server ---
  async listProviders(): Promise<ExternalProviderProfile[]> {
    const res = await apiFetch<{ providers: ExternalProviderProfile[] }>('/api/providers');
    return res.providers || [];
  },

  async createProvider(draft: ProviderDraftInput, activateRouting = true): Promise<ExternalProviderProfile> {
    const res = await apiFetch<{ provider: ExternalProviderProfile }>('/api/providers', {
      method: 'POST',
      body: JSON.stringify({ draft, activateRouting })
    });
    return res.provider;
  },

  async updateProvider(id: string, draft: Partial<ProviderDraftInput>): Promise<ExternalProviderProfile> {
    const res = await apiFetch<{ provider: ExternalProviderProfile }>(`/api/providers/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ draft })
    });
    return res.provider;
  },

  async duplicateProvider(id: string): Promise<ExternalProviderProfile> {
    const res = await apiFetch<{ provider: ExternalProviderProfile }>(
      `/api/providers/${encodeURIComponent(id)}/duplicate`,
      { method: 'POST' }
    );
    return res.provider;
  },

  async deleteProvider(id: string): Promise<void> {
    await apiFetch(`/api/providers/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async setDefaultProvider(id: string, activateExternalRouting = true): Promise<ExternalProviderProfile | undefined> {
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
    await apiFetch('/api/providers/routing', {
      method: 'PUT',
      body: JSON.stringify(routing)
    });
  },

  async importProviders(rawJson: any, replaceExisting = false): Promise<{ importedCount: number; needsApiKeyCount: number }> {
    return apiFetch('/api/providers/import', {
      method: 'POST',
      body: JSON.stringify({ rawJson, replaceExisting })
    });
  },

  async restoreProvidersFromDrive(entries: any[]): Promise<void> {
    await apiFetch('/api/providers/restore-drive', {
      method: 'POST',
      body: JSON.stringify({ entries })
    });
  },

  async saveAllProviders(profiles: ExternalProviderProfile[]): Promise<void> {
    await apiFetch('/api/providers/bulk', {
      method: 'PUT',
      body: JSON.stringify({ profiles })
    });
  },

  async recordProviderTestResult(id: string, result: { success: boolean; message: string }): Promise<void> {
    await apiFetch(`/api/providers/${encodeURIComponent(id)}/test-result`, {
      method: 'POST',
      body: JSON.stringify(result)
    });
  }
};
