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

export const PROVIDER_METADATA_STORAGE_KEY = 'aetheria_provider_metadata_v2';
export const LEGACY_EXTERNAL_PROVIDERS_STORAGE_KEY = 'aetheria_external_providers_v1';
export const PROVIDER_ROUTING_STORAGE_KEY = 'aetheria_provider_routing_v1';

const changeListeners = new Set<() => void>();
let migrationChecked = false;
let migrationInProgress: Promise<void> | null = null;

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
    fallbackToGemini: true
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
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PROVIDER_METADATA_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((item, idx) => normalizeMetadataRecord(item, idx));
      }
    }

    // Read legacy storage non-destructively in sync path if async migration hasn't completed yet
    const legacyRaw = localStorage.getItem(LEGACY_EXTERNAL_PROVIDERS_STORAGE_KEY);
    if (legacyRaw) {
      const parsedLegacy = JSON.parse(legacyRaw);
      if (Array.isArray(parsedLegacy)) {
        return parsedLegacy.map((item, idx) => ({
          ...normalizeMetadataRecord(item, idx),
          hasStoredApiKey: Boolean(item?.apiKey?.trim())
        }));
      }
    }
    return [];
  } catch {
    return [];
  }
}

function writeMetadataSync(records: ProviderMetadataRecord[]): void {
  if (typeof localStorage === 'undefined') return;
  const sanitized: ProviderMetadataRecord[] = records.map((rec, idx) => {
    const clean: ProviderMetadataRecord = {
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
      hasStoredApiKey: Boolean(rec.hasStoredApiKey || secureCredentialStorage.hasSecretRecord(rec.id)),
      createdAt: rec.createdAt || Date.now(),
      updatedAt: Date.now(),
      lastTestedAt: rec.lastTestedAt,
      lastTestSuccess: rec.lastTestSuccess,
      lastTestMessage: rec.lastTestMessage
    };
    return clean;
  });
  localStorage.setItem(PROVIDER_METADATA_STORAGE_KEY, JSON.stringify(sanitized));
}

async function migrateLegacyPlaintextStorageIfNeeded(): Promise<void> {
  if (migrationChecked || typeof localStorage === 'undefined') return;
  if (migrationInProgress) return migrationInProgress;

  migrationInProgress = (async () => {
    try {
      await secureCredentialStorage.hydrate();

      const legacyRaw = localStorage.getItem(LEGACY_EXTERNAL_PROVIDERS_STORAGE_KEY);
      if (!legacyRaw) {
        migrationChecked = true;
        return;
      }

      const parsed = JSON.parse(legacyRaw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const existingMeta = readMetadataSync();
        const existingIds = new Set(existingMeta.map(m => m.id));
        const mergedMeta = [...existingMeta];

        for (let i = 0; i < parsed.length; i++) {
          const leg = parsed[i];
          const norm = normalizeMetadataRecord(leg, i);
          const legKey = typeof leg?.apiKey === 'string' ? leg.apiKey.trim() : '';
          if (legKey) {
            await secureCredentialStorage.setSecret(norm.id, legKey);
            norm.hasStoredApiKey = true;
          }
          if (!existingIds.has(norm.id)) {
            mergedMeta.push(norm);
            existingIds.add(norm.id);
          }
        }

        // Ensure at least one enabled profile is default if none flagged
        if (!mergedMeta.some(m => m.isDefault) && mergedMeta.length > 0) {
          const firstEnabled = mergedMeta.find(m => m.enabled) || mergedMeta[0];
          firstEnabled.isDefault = true;
        }

        writeMetadataSync(mergedMeta);
      }

      // Remove plaintext key store once safely encrypted into the vault
      if (secureCredentialStorage.isPersistentVaultSupported()) {
        localStorage.removeItem(LEGACY_EXTERNAL_PROVIDERS_STORAGE_KEY);
      }
      migrationChecked = true;
    } catch {
      migrationChecked = true;
    } finally {
      migrationInProgress = null;
    }
  })();

  return migrationInProgress;
}

function hydrateProfileSync(meta: ProviderMetadataRecord): ExternalProviderProfile {
  let apiKey = secureCredentialStorage.getSecretSync(meta.id);

  // If synchronous caller runs before async migration finished, peek legacy memory once safely
  if (!apiKey && typeof localStorage !== 'undefined') {
    try {
      const legacyRaw = localStorage.getItem(LEGACY_EXTERNAL_PROVIDERS_STORAGE_KEY);
      if (legacyRaw) {
        const parsed = JSON.parse(legacyRaw);
        if (Array.isArray(parsed)) {
          const match = parsed.find((p: any) => p?.id === meta.id);
          if (match?.apiKey) {
            apiKey = String(match.apiKey).trim();
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return {
    ...meta,
    hasStoredApiKey: Boolean(apiKey || meta.hasStoredApiKey || secureCredentialStorage.hasSecretRecord(meta.id)),
    apiKey
  };
}

export const providerManagerService = {
  subscribe(listener: () => void): () => void {
    changeListeners.add(listener);
    return () => {
      changeListeners.delete(listener);
    };
  },

  async initialize(): Promise<void> {
    await migrateLegacyPlaintextStorageIfNeeded();
  },

  async listProvidersAsync(): Promise<ExternalProviderProfile[]> {
    await migrateLegacyPlaintextStorageIfNeeded();
    return this.listProviders();
  },

  listProviders(): ExternalProviderProfile[] {
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
    if (typeof localStorage === 'undefined') return getDefaultRouting();
    try {
      const raw = localStorage.getItem(PROVIDER_ROUTING_STORAGE_KEY);
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
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PROVIDER_ROUTING_STORAGE_KEY, JSON.stringify(config));
    }
    notifyChange();
  },

  async saveAllProfiles(profiles: ExternalProviderProfile[]): Promise<void> {
    await migrateLegacyPlaintextStorageIfNeeded();

    const metaList: ProviderMetadataRecord[] = [];
    for (let i = 0; i < profiles.length; i++) {
      const p = profiles[i];
      const existingSecret = secureCredentialStorage.getSecretSync(p.id);
      const providedKey = typeof p.apiKey === 'string' ? p.apiKey.trim() : '';

      if (providedKey) {
        await secureCredentialStorage.setSecret(p.id, providedKey);
      }

      const norm = normalizeMetadataRecord(
        {
          ...p,
          priority: i,
          hasStoredApiKey: Boolean(providedKey || existingSecret || secureCredentialStorage.hasSecretRecord(p.id))
        },
        i
      );
      metaList.push(norm);
    }

    writeMetadataSync(metaList);
    notifyChange();
  },

  async createProvider(draft: ProviderDraftInput, options: { activateRouting?: boolean } = {}): Promise<ExternalProviderProfile> {
    await migrateLegacyPlaintextStorageIfNeeded();
    const existing = readMetadataSync();
    const providerType = normalizeProviderType(draft.providerType);
    const preset = getPresetForProviderType(providerType);
    const id = draft.id || makeProviderId();
    const cleanKey = (draft.apiKey || '').trim();

    if (cleanKey) {
      await secureCredentialStorage.setSecret(id, cleanKey);
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

  /**
   * Updates an existing provider.
   * CRITICAL SECURITY & PERSISTENCE RULE:
   * Passing an empty or omitted `apiKey` preserves the existing encrypted key unless
   * `draft.clearApiKey === true` is explicitly set.
   */
  async updateProvider(id: string, draft: Partial<ProviderDraftInput>): Promise<ExternalProviderProfile> {
    await migrateLegacyPlaintextStorageIfNeeded();
    const existingList = readMetadataSync();
    const targetIdx = existingList.findIndex(p => p.id === id);
    if (targetIdx === -1) {
      throw new Error('Không tìm thấy cấu hình provider cần cập nhật.');
    }

    const current = existingList[targetIdx];
    const nextType = draft.providerType ? normalizeProviderType(draft.providerType) : current.providerType;
    const preset = getPresetForProviderType(nextType);

    if (draft.clearApiKey) {
      await secureCredentialStorage.deleteSecret(id);
    } else if (typeof draft.apiKey === 'string' && draft.apiKey.trim().length > 0) {
      await secureCredentialStorage.setSecret(id, draft.apiKey.trim());
    }

    const hasKeyNow = draft.clearApiKey
      ? false
      : Boolean(
          (typeof draft.apiKey === 'string' && draft.apiKey.trim()) ||
            secureCredentialStorage.getSecretSync(id) ||
            secureCredentialStorage.hasSecretRecord(id)
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

  async recordTestResult(
    id: string,
    result: { success: boolean; message: string }
  ): Promise<void> {
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
    await migrateLegacyPlaintextStorageIfNeeded();
    const source = this.getProvider(id);
    if (!source) {
      throw new Error('Không tìm thấy provider để nhân bản.');
    }

    const cloneId = makeProviderId();
    const existingKey = source.apiKey?.trim();
    if (existingKey) {
      await secureCredentialStorage.setSecret(cloneId, existingKey);
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
    await migrateLegacyPlaintextStorageIfNeeded();
    await secureCredentialStorage.deleteSecret(id);

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

  async setDefaultProvider(id: string, activateExternalRouting: boolean = true): Promise<ExternalProviderProfile | undefined> {
    await migrateLegacyPlaintextStorageIfNeeded();
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

  /**
   * Exports provider metadata cleanly. Excludes API keys by default per Section 7 & 8.
   */
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
    await migrateLegacyPlaintextStorageIfNeeded();

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
        await secureCredentialStorage.setSecret(norm.id, rawKey);
        norm.hasStoredApiKey = true;
      } else {
        const alreadyHasKey = Boolean(
          secureCredentialStorage.getSecretSync(norm.id) || secureCredentialStorage.hasSecretRecord(norm.id)
        );
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

  /**
   * Restores provider entries from Google Drive backup securely into encrypted vault + metadata.
   */
  async restoreFromDriveBackup(entries: any[]): Promise<void> {
    if (!Array.isArray(entries) || entries.length === 0) return;
    await this.importProvidersBundle({ providers: entries }, { replaceExisting: false });
  }
};
