import {
  AIProviderType,
  ExternalProviderProfile,
  ProviderDraftInput,
  ProviderExportBundle,
  ProviderExportEntry,
  ProviderMetadataRecord,
  ProviderRoutingConfig,
  ProviderTaskRole
} from './providerTypes.ts';
import {
  getPresetForProviderType,
  normalizeBaseUrl
} from './modelDiscoveryService.ts';
import { secureCredentialStorage } from './secureCredentialStorage.ts';
import { isRemoteServerClient, isServerRuntime, isStandaloneMode, runtimeKV, serverSyncClient } from './runtimeAdapter.ts';

export const PROVIDER_METADATA_STORAGE_KEY = 'aetheria_provider_metadata_v2';
export const LEGACY_EXTERNAL_PROVIDERS_STORAGE_KEY = 'aetheria_external_providers_v1';
export const PROVIDER_ROUTING_STORAGE_KEY = 'aetheria_provider_routing_v1';

export interface ServerProviderVaultBackend {
  getProviderMetadataList(): ProviderMetadataRecord[];
  setProviderMetadataList(records: ProviderMetadataRecord[]): void;
  getProviderSecret(id: string): string;
  hasProviderSecret(id: string): boolean;
  setProviderSecret(id: string, apiKey: string): void;
  deleteProviderSecret(id: string): void;
}

let serverVaultBackend: ServerProviderVaultBackend | null = null;

export function setServerProviderVaultBackend(backend: ServerProviderVaultBackend): void {
  serverVaultBackend = backend;
}

// Browser thin-client in-memory mirrors hydrated from /api/bootstrap & WebSocket
let clientProvidersMirror: ExternalProviderProfile[] = [];
let clientRoutingMirror: ProviderRoutingConfig = {
  activeProBackend: 'gemini',
  activeFlashBackend: 'gemini',
  fallbackToGemini: false
};

const changeListeners = new Set<() => void>();
let initialized = false;

function notifyChange(): void {
  for (const listener of changeListeners) {
    try {
      listener();
    } catch {
      // ignore listener errors
    }
  }
}

function getDefaultRouting(): ProviderRoutingConfig {
  return {
    activeProBackend: 'gemini',
    activeFlashBackend: 'gemini',
    fallbackToGemini: false
  };
}

function makeProviderId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `prov_${crypto.randomUUID()}`;
    }
  } catch {
    // ignore
  }
  return `prov_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeProviderType(raw: any): AIProviderType {
  if (raw === 'custom') return 'openai_compatible';
  const valid: AIProviderType[] = [
    'openai_compatible',
    'openai',
    'openrouter',
    'deepseek',
    'groq',
    'xai',
    'anthropic',
    'gemini_native'
  ];
  return valid.includes(raw) ? raw : 'openai_compatible';
}

function sanitizeCustomHeaders(raw: any): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const cleanKey = String(k || '').trim();
    const cleanVal = typeof v === 'string' ? v.trim() : '';
    if (cleanKey && cleanVal) {
      cleaned[cleanKey] = cleanVal;
    }
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined;
}

function normalizeMetadataRecord(raw: any, index: number = 0): ProviderMetadataRecord {
  const providerType = normalizeProviderType(raw?.providerType || raw?.provider_type);
  const preset = getPresetForProviderType(providerType);
  const baseUrl = normalizeBaseUrl(raw?.baseUrl || raw?.base_url || preset.defaultBaseUrl, preset.defaultBaseUrl);
  const temp =
    typeof raw?.temperature === 'number' && !Number.isNaN(raw.temperature)
      ? Math.min(2, Math.max(0, raw.temperature))
      : undefined;
  const maxTok =
    typeof raw?.maxTokens === 'number' && !Number.isNaN(raw.maxTokens) && raw.maxTokens > 0
      ? Math.floor(raw.maxTokens)
      : typeof raw?.max_tokens === 'number' && !Number.isNaN(raw.max_tokens) && raw.max_tokens > 0
      ? Math.floor(raw.max_tokens)
      : undefined;

  return {
    id: String(raw?.id || makeProviderId()),
    name: String(raw?.name || raw?.provider_name || `${preset.shortLabel} Provider`).trim(),
    providerType,
    baseUrl,
    model: String(raw?.model || '').trim(),
    temperature: temp,
    maxTokens: maxTok,
    customHeaders: sanitizeCustomHeaders(raw?.customHeaders || raw?.custom_headers),
    authScheme: raw?.authScheme || raw?.auth_scheme || preset.defaultAuthScheme,
    authHeaderName: raw?.authHeaderName || raw?.auth_header_name || undefined,
    role: (raw?.role === 'pro' || raw?.role === 'flash' ? raw.role : 'all') as ProviderTaskRole,
    enabled: raw?.enabled !== undefined ? Boolean(raw.enabled) : true,
    isDefault: Boolean(raw?.isDefault ?? raw?.is_default),
    priority: typeof raw?.priority === 'number' ? raw.priority : index,
    hasStoredApiKey: Boolean(raw?.hasStoredApiKey),
    createdAt: typeof raw?.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw?.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    lastTestedAt: typeof raw?.lastTestedAt === 'number' ? raw.lastTestedAt : undefined,
    lastTestSuccess: typeof raw?.lastTestSuccess === 'boolean' ? raw.lastTestSuccess : undefined,
    lastTestMessage: typeof raw?.lastTestMessage === 'string' ? raw.lastTestMessage : undefined
  };
}

function readMetadataSync(): ProviderMetadataRecord[] {
  if (serverVaultBackend && isServerRuntime()) {
    return serverVaultBackend.getProviderMetadataList().map((item, idx) => normalizeMetadataRecord(item, idx));
  }
  if (isStandaloneMode()) {
    try {
      const raw = runtimeKV.getItem(PROVIDER_METADATA_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((item, idx) => normalizeMetadataRecord(item, idx)) : [];
    } catch {
      return [];
    }
  }
  return clientProvidersMirror.map((p, idx) => normalizeMetadataRecord(p, idx));
}

function writeMetadataSync(records: ProviderMetadataRecord[]): void {
  const sanitized: ProviderMetadataRecord[] = records.map((rec, idx) => ({
    id: rec.id,
    name: rec.name,
    providerType: normalizeProviderType(rec.providerType),
    baseUrl: normalizeBaseUrl(rec.baseUrl),
    model: (rec.model || '').trim(),
    temperature: rec.temperature,
    maxTokens: rec.maxTokens,
    customHeaders: sanitizeCustomHeaders(rec.customHeaders),
    authScheme: rec.authScheme,
    authHeaderName: rec.authHeaderName?.trim() || undefined,
    role: rec.role || 'all',
    enabled: Boolean(rec.enabled),
    isDefault: Boolean(rec.isDefault),
    priority: typeof rec.priority === 'number' ? rec.priority : idx,
    hasStoredApiKey: Boolean(
      rec.hasStoredApiKey ||
        (serverVaultBackend && isServerRuntime()
          ? serverVaultBackend.hasProviderSecret(rec.id)
          : secureCredentialStorage.hasSecretRecord(rec.id))
    ),
    createdAt: rec.createdAt || Date.now(),
    updatedAt: Date.now(),
    lastTestedAt: rec.lastTestedAt,
    lastTestSuccess: rec.lastTestSuccess,
    lastTestMessage: rec.lastTestMessage
  }));

  if (serverVaultBackend && isServerRuntime()) {
    serverVaultBackend.setProviderMetadataList(sanitized);
    return;
  }
  if (isStandaloneMode()) {
    runtimeKV.setItem(PROVIDER_METADATA_STORAGE_KEY, JSON.stringify(sanitized));
  }
}

function getSecretSync(id: string): string {
  if (serverVaultBackend && isServerRuntime()) {
    return serverVaultBackend.getProviderSecret(id);
  }
  if (isStandaloneMode()) {
    return secureCredentialStorage.getSecretSync(id);
  }
  return clientProvidersMirror.find(p => p.id === id)?.apiKey || '';
}

function hasSecretSync(id: string): boolean {
  if (serverVaultBackend && isServerRuntime()) {
    return serverVaultBackend.hasProviderSecret(id);
  }
  if (isStandaloneMode()) {
    return secureCredentialStorage.hasSecretRecord(id);
  }
  const found = clientProvidersMirror.find(p => p.id === id);
  return Boolean(found?.apiKey || found?.hasStoredApiKey);
}

async function setSecretValue(id: string, key: string): Promise<void> {
  if (serverVaultBackend && isServerRuntime()) {
    serverVaultBackend.setProviderSecret(id, key);
    return;
  }
  await secureCredentialStorage.setSecret(id, key);
}

async function deleteSecretValue(id: string): Promise<void> {
  if (serverVaultBackend && isServerRuntime()) {
    serverVaultBackend.deleteProviderSecret(id);
    return;
  }
  await secureCredentialStorage.deleteSecret(id);
}

function hydrateProfileSync(meta: ProviderMetadataRecord): ExternalProviderProfile {
  const apiKey = getSecretSync(meta.id);
  return {
    ...meta,
    hasStoredApiKey: Boolean(apiKey || meta.hasStoredApiKey || hasSecretSync(meta.id)),
    apiKey
  };
}

function isRemoteClient(): boolean {
  return isRemoteServerClient();
}

export const providerManagerService = {
  subscribe(listener: () => void): () => void {
    changeListeners.add(listener);
    return () => {
      changeListeners.delete(listener);
    };
  },

  hydrateFromServer(providers: ExternalProviderProfile[], routing?: ProviderRoutingConfig): void {
    if (Array.isArray(providers)) {
      clientProvidersMirror = [...providers];
    }
    if (routing) {
      clientRoutingMirror = {
        ...getDefaultRouting(),
        ...routing
      };
      runtimeKV.setLocalOnly(PROVIDER_ROUTING_STORAGE_KEY, JSON.stringify(clientRoutingMirror));
    }
    initialized = true;
    notifyChange();
  },

  async initialize(): Promise<void> {
    if (isRemoteClient()) {
      if (!initialized) {
        try {
          const list = await serverSyncClient.listProviders();
          clientProvidersMirror = list;
          initialized = true;
          notifyChange();
        } catch {
          // ignore if called pre-bootstrap
        }
      }
      return;
    }
    if (isStandaloneMode()) {
      await secureCredentialStorage.hydrate();
    }
    initialized = true;
  },

  async listProvidersAsync(): Promise<ExternalProviderProfile[]> {
    if (isRemoteClient()) {
      const list = await serverSyncClient.listProviders();
      clientProvidersMirror = list;
      initialized = true;
      notifyChange();
      return this.listProviders();
    }
    return this.listProviders();
  },

  listProviders(): ExternalProviderProfile[] {
    if (isRemoteClient()) {
      return [...clientProvidersMirror].sort((a, b) => {
        if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
        return (a.priority ?? 0) - (b.priority ?? 0);
      });
    }
    const metadata = readMetadataSync();
    return metadata.map(hydrateProfileSync).sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return (a.priority ?? 0) - (b.priority ?? 0);
    });
  },

  getProvider(id: string): ExternalProviderProfile | undefined {
    return this.listProviders().find(p => p.id === id);
  },

  isConfiguredProvider(profile: ExternalProviderProfile): boolean {
    const preset = getPresetForProviderType(profile.providerType);
    const scheme = profile.authScheme || preset.defaultAuthScheme;
    const hasKey = scheme === 'none' || Boolean(profile.apiKey?.trim() || profile.hasStoredApiKey);
    return Boolean(profile.baseUrl?.trim() && profile.model?.trim() && hasKey);
  },

  getDefaultProvider(tier?: 'pro' | 'flash'): ExternalProviderProfile | undefined {
    const all = this.listProviders().filter(p => p.enabled && this.isConfiguredProvider(p));
    if (all.length === 0) return undefined;
    if (!tier) {
      return all.find(p => p.isDefault) || all[0];
    }
    const matching = all.filter(p => p.role === tier || p.role === 'all');
    if (matching.length === 0) return undefined;
    return matching.find(p => p.isDefault) || matching[0];
  },

  getRoutingConfig(): ProviderRoutingConfig {
    if (isRemoteClient()) {
      const rawKv = runtimeKV.getItem(PROVIDER_ROUTING_STORAGE_KEY);
      if (rawKv) {
        try {
          return { ...getDefaultRouting(), ...(JSON.parse(rawKv) || {}) };
        } catch {
          // fallback to mirror
        }
      }
      return { ...clientRoutingMirror };
    }
    try {
      const raw = runtimeKV.getItem(PROVIDER_ROUTING_STORAGE_KEY);
      if (!raw) return getDefaultRouting();
      return {
        ...getDefaultRouting(),
        ...(JSON.parse(raw) || {})
      };
    } catch {
      return getDefaultRouting();
    }
  },

  saveRoutingConfig(config: ProviderRoutingConfig): void {
    const normalized = { ...getDefaultRouting(), ...config };
    if (isRemoteClient()) {
      clientRoutingMirror = normalized;
      runtimeKV.setLocalOnly(PROVIDER_ROUTING_STORAGE_KEY, JSON.stringify(normalized));
      notifyChange();
      void serverSyncClient.saveProviderRouting(normalized).catch(err =>
        console.error('[providerManagerService] Failed saving routing config on server:', err)
      );
      return;
    }
    runtimeKV.setItem(PROVIDER_ROUTING_STORAGE_KEY, JSON.stringify(normalized));
    notifyChange();
  },

  async saveAllProfiles(profiles: ExternalProviderProfile[]): Promise<void> {
    if (isRemoteClient()) {
      await serverSyncClient.saveAllProviders(profiles);
      await this.listProvidersAsync();
      return;
    }

    const metaList: ProviderMetadataRecord[] = [];
    for (let i = 0; i < profiles.length; i++) {
      const p = profiles[i];
      const existingSecret = getSecretSync(p.id);
      const providedKey = typeof p.apiKey === 'string' ? p.apiKey.trim() : '';

      if (providedKey) {
        await setSecretValue(p.id, providedKey);
      }

      const norm = normalizeMetadataRecord(
        {
          ...p,
          priority: i,
          hasStoredApiKey: Boolean(providedKey || existingSecret || hasSecretSync(p.id))
        },
        i
      );
      metaList.push(norm);
    }

    writeMetadataSync(metaList);
    notifyChange();
  },

  async createProvider(
    draft: ProviderDraftInput,
    options: { activateRouting?: boolean } = {}
  ): Promise<ExternalProviderProfile> {
    if (isRemoteClient()) {
      const created = await serverSyncClient.createProvider(draft, options.activateRouting !== false);
      await this.listProvidersAsync();
      return created;
    }

    const existing = readMetadataSync();
    const providerType = normalizeProviderType(draft.providerType);
    const preset = getPresetForProviderType(providerType);
    const id = draft.id || makeProviderId();
    const cleanKey = (draft.apiKey || '').trim();

    if (cleanKey) {
      await setSecretValue(id, cleanKey);
    }

    const shouldBeDefault = draft.isDefault ?? (existing.length === 0 || existing.every(p => !p.isDefault));
    const updatedMeta = shouldBeDefault
      ? existing.map(p => ({ ...p, isDefault: false }))
      : [...existing];

    const record = normalizeMetadataRecord(
      {
        id,
        name: draft.name?.trim() || `${preset.shortLabel} · ${draft.model?.trim() || 'Provider'}`,
        providerType,
        baseUrl: draft.baseUrl?.trim() || preset.defaultBaseUrl,
        model: draft.model?.trim() || '',
        temperature: draft.temperature,
        maxTokens: draft.maxTokens,
        customHeaders: draft.customHeaders,
        authScheme: draft.authScheme || preset.defaultAuthScheme,
        authHeaderName: draft.authHeaderName,
        role: draft.role || 'all',
        enabled: draft.enabled ?? true,
        isDefault: shouldBeDefault,
        priority: draft.priority ?? updatedMeta.length,
        hasStoredApiKey: Boolean(cleanKey),
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      updatedMeta.length
    );

    updatedMeta.push(record);
    writeMetadataSync(updatedMeta);

    if (options.activateRouting !== false && record.enabled && (cleanKey || record.authScheme === 'none')) {
      const routing = this.getRoutingConfig();
      const nextRouting: ProviderRoutingConfig = {
        ...routing,
        activeProBackend: record.role === 'all' || record.role === 'pro' ? 'external' : routing.activeProBackend,
        activeFlashBackend: record.role === 'all' || record.role === 'flash' ? 'external' : routing.activeFlashBackend
      };
      this.saveRoutingConfig(nextRouting);
    } else {
      notifyChange();
    }

    return hydrateProfileSync(record);
  },

  async updateProvider(id: string, draft: Partial<ProviderDraftInput>): Promise<ExternalProviderProfile> {
    if (isRemoteClient()) {
      const updated = await serverSyncClient.updateProvider(id, draft);
      await this.listProvidersAsync();
      return updated;
    }

    const existingList = readMetadataSync();
    const targetIdx = existingList.findIndex(p => p.id === id);
    if (targetIdx === -1) {
      throw new Error('Không tìm thấy cấu hình provider cần cập nhật.');
    }

    const current = existingList[targetIdx];
    const nextType = draft.providerType ? normalizeProviderType(draft.providerType) : current.providerType;
    const preset = getPresetForProviderType(nextType);

    if (draft.clearApiKey) {
      await deleteSecretValue(id);
    } else if (typeof draft.apiKey === 'string' && draft.apiKey.trim().length > 0) {
      await setSecretValue(id, draft.apiKey.trim());
    }

    const hasKeyNow = draft.clearApiKey
      ? false
      : Boolean(
          (typeof draft.apiKey === 'string' && draft.apiKey.trim()) ||
            getSecretSync(id) ||
            hasSecretSync(id)
        );

    const settingDefault = draft.isDefault === true;
    const updatedList = existingList.map((item, idx) => {
      if (idx !== targetIdx) {
        return settingDefault ? { ...item, isDefault: false } : item;
      }
      return normalizeMetadataRecord(
        {
          ...item,
          name: draft.name !== undefined ? draft.name.trim() || item.name : item.name,
          providerType: nextType,
          baseUrl: draft.baseUrl !== undefined ? draft.baseUrl : item.baseUrl || preset.defaultBaseUrl,
          model: draft.model !== undefined ? draft.model.trim() : item.model,
          temperature: 'temperature' in draft ? draft.temperature : item.temperature,
          maxTokens: 'maxTokens' in draft ? draft.maxTokens : item.maxTokens,
          customHeaders: 'customHeaders' in draft ? draft.customHeaders : item.customHeaders,
          authScheme: draft.authScheme !== undefined ? draft.authScheme : item.authScheme,
          authHeaderName: 'authHeaderName' in draft ? draft.authHeaderName : item.authHeaderName,
          role: draft.role !== undefined ? draft.role : item.role,
          enabled: draft.enabled !== undefined ? draft.enabled : item.enabled,
          isDefault: draft.isDefault !== undefined ? draft.isDefault : item.isDefault,
          priority: draft.priority !== undefined ? draft.priority : item.priority,
          hasStoredApiKey: hasKeyNow,
          updatedAt: Date.now()
        },
        idx
      );
    });

    writeMetadataSync(updatedList);
    notifyChange();
    return hydrateProfileSync(updatedList[targetIdx]);
  },

  async recordTestResult(id: string, result: { success: boolean; message: string }): Promise<void> {
    if (isRemoteClient()) {
      await serverSyncClient.recordProviderTestResult(id, result);
      await this.listProvidersAsync();
      return;
    }

    const existingList = readMetadataSync();
    const updated = existingList.map(item =>
      item.id === id
        ? {
            ...item,
            lastTestedAt: Date.now(),
            lastTestSuccess: result.success,
            lastTestMessage: result.message
          }
        : item
    );
    writeMetadataSync(updated);
    notifyChange();
  },

  async duplicateProvider(id: string): Promise<ExternalProviderProfile> {
    if (isRemoteClient()) {
      const cloned = await serverSyncClient.duplicateProvider(id);
      await this.listProvidersAsync();
      return cloned;
    }

    const source = this.getProvider(id);
    if (!source) {
      throw new Error('Không tìm thấy provider để nhân bản.');
    }

    const cloneId = makeProviderId();
    const existingKey = source.apiKey?.trim();
    if (existingKey) {
      await setSecretValue(cloneId, existingKey);
    }

    const existingList = readMetadataSync();
    const cloneRecord = normalizeMetadataRecord(
      {
        ...source,
        id: cloneId,
        name: `${source.name} (Bản sao)`,
        isDefault: false,
        priority: existingList.length,
        hasStoredApiKey: Boolean(existingKey),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastTestedAt: undefined,
        lastTestSuccess: undefined,
        lastTestMessage: undefined
      },
      existingList.length
    );

    const updated = [...existingList, cloneRecord];
    writeMetadataSync(updated);
    notifyChange();
    return hydrateProfileSync(cloneRecord);
  },

  async deleteProvider(id: string): Promise<void> {
    if (isRemoteClient()) {
      await serverSyncClient.deleteProvider(id);
      await this.listProvidersAsync();
      return;
    }

    await deleteSecretValue(id);

    const existingList = readMetadataSync();
    const remaining = existingList.filter(p => p.id !== id);
    if (remaining.length > 0 && !remaining.some(p => p.isDefault)) {
      const nextDefault = remaining.find(p => p.enabled) || remaining[0];
      nextDefault.isDefault = true;
    }

    writeMetadataSync(remaining);

    if (remaining.filter(p => p.enabled).length === 0) {
      const routing = this.getRoutingConfig();
      this.saveRoutingConfig({
        ...routing,
        activeProBackend: 'gemini',
        activeFlashBackend: 'gemini'
      });
    } else {
      notifyChange();
    }
  },

  async toggleProviderEnabled(id: string): Promise<ExternalProviderProfile | undefined> {
    const existing = this.getProvider(id);
    if (!existing) return undefined;
    return this.updateProvider(id, { enabled: !existing.enabled });
  },

  async setDefaultProvider(
    id: string,
    activateExternalRouting: boolean = true
  ): Promise<ExternalProviderProfile | undefined> {
    if (isRemoteClient()) {
      const updated = await serverSyncClient.setDefaultProvider(id, activateExternalRouting);
      await this.listProvidersAsync();
      return updated;
    }

    const existingList = readMetadataSync();
    const target = existingList.find(p => p.id === id);
    if (!target) return undefined;

    let priorityCursor = 1;
    const updated = existingList.map(item => {
      if (item.id === id) {
        return {
          ...item,
          isDefault: true,
          enabled: true,
          priority: 0,
          updatedAt: Date.now()
        };
      }
      return {
        ...item,
        isDefault: false,
        priority: priorityCursor++
      };
    });

    writeMetadataSync(updated);

    if (activateExternalRouting) {
      const routing = this.getRoutingConfig();
      const nextRouting: ProviderRoutingConfig = {
        ...routing,
        activeProBackend: target.role === 'all' || target.role === 'pro' ? 'external' : routing.activeProBackend,
        activeFlashBackend: target.role === 'all' || target.role === 'flash' ? 'external' : routing.activeFlashBackend
      };
      this.saveRoutingConfig(nextRouting);
    } else {
      notifyChange();
    }

    return this.getProvider(id);
  },

  exportProvidersBundle(options: { includeApiKeys?: boolean } = {}): ProviderExportBundle {
    const includeApiKeys = Boolean(options.includeApiKeys);
    const profiles = this.listProviders();

    const entries: ProviderExportEntry[] = profiles.map(p => ({
      id: p.id,
      provider_name: p.name,
      provider_type: p.providerType,
      base_url: p.baseUrl,
      model: p.model,
      ...(typeof p.temperature === 'number' ? { temperature: p.temperature } : {}),
      ...(typeof p.maxTokens === 'number' ? { max_tokens: p.maxTokens } : {}),
      ...(p.customHeaders && Object.keys(p.customHeaders).length > 0 ? { custom_headers: p.customHeaders } : {}),
      auth_scheme: p.authScheme,
      ...(p.authHeaderName ? { auth_header_name: p.authHeaderName } : {}),
      role: p.role,
      enabled: p.enabled,
      is_default: p.isDefault,
      priority: p.priority,
      ...(includeApiKeys && p.apiKey ? { api_key: p.apiKey } : {}),
      api_key_included: Boolean(includeApiKeys && p.apiKey)
    }));

    return {
      schema: 'aetheria-providers-v2',
      exportedAt: Date.now(),
      includesApiKeys: includeApiKeys,
      providers: entries,
      routing: this.getRoutingConfig()
    };
  },

  async importProvidersBundle(
    rawJson: string | object,
    options: { replaceExisting?: boolean } = {}
  ): Promise<{ importedCount: number; needsApiKeyCount: number }> {
    if (isRemoteClient()) {
      const result = await serverSyncClient.importProviders(rawJson, Boolean(options.replaceExisting));
      await this.listProvidersAsync();
      return result;
    }

    let parsed: any;
    try {
      parsed = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
    } catch {
      throw new Error('Tệp cấu hình không phải JSON hợp lệ.');
    }

    const rawList: any[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.providers)
      ? parsed.providers
      : parsed && (parsed.base_url || parsed.baseUrl || parsed.provider_name || parsed.name)
      ? [parsed]
      : [];

    if (rawList.length === 0) {
      throw new Error('Không tìm thấy cấu hình provider nào trong dữ liệu nhập.');
    }

    const existing = options.replaceExisting ? [] : readMetadataSync();
    const byId = new Map<string, ProviderMetadataRecord>();
    for (const item of existing) {
      byId.set(item.id, item);
    }

    let importedCount = 0;
    let needsApiKeyCount = 0;

    for (let i = 0; i < rawList.length; i++) {
      const rawEntry = rawList[i];
      if (!rawEntry || typeof rawEntry !== 'object') continue;

      const norm = normalizeMetadataRecord(rawEntry, existing.length + i);
      const rawKey = typeof (rawEntry.api_key ?? rawEntry.apiKey) === 'string'
        ? String(rawEntry.api_key ?? rawEntry.apiKey).trim()
        : '';

      if (rawKey) {
        await setSecretValue(norm.id, rawKey);
        norm.hasStoredApiKey = true;
      } else {
        const alreadyHasKey = Boolean(getSecretSync(norm.id) || hasSecretSync(norm.id));
        norm.hasStoredApiKey = alreadyHasKey;
        if (!alreadyHasKey && norm.authScheme !== 'none') {
          needsApiKeyCount++;
        }
      }

      if (norm.isDefault) {
        for (const prev of byId.values()) {
          prev.isDefault = false;
        }
      }

      byId.set(norm.id, norm);
      importedCount++;
    }

    const merged = Array.from(byId.values());
    if (merged.length > 0 && !merged.some(m => m.isDefault)) {
      merged[0].isDefault = true;
    }
    writeMetadataSync(merged);

    if (parsed?.routing && typeof parsed.routing === 'object') {
      this.saveRoutingConfig({
        ...getDefaultRouting(),
        ...parsed.routing
      });
    } else {
      notifyChange();
    }

    return { importedCount, needsApiKeyCount };
  },

  async restoreFromDriveBackup(entries: any[]): Promise<void> {
    if (!Array.isArray(entries) || entries.length === 0) return;
    if (isRemoteClient()) {
      await serverSyncClient.restoreProvidersFromDrive(entries);
      await this.listProvidersAsync();
      return;
    }
    await this.importProvidersBundle({ providers: entries }, { replaceExisting: false });
  }
};
