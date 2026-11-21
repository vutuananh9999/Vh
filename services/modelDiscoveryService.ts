import {
  AIProviderType,
  DiscoveredModel,
  ModelDiscoveryResult,
  ProviderAuthScheme,
  ProviderPreset,
  ProviderProtocolFormat
} from './providerTypes.ts';
import { redactSecrets } from './secureCredentialStorage.ts';
import { isServerRuntime, serverSyncClient } from './runtimeAdapter.ts';

export const PROVIDER_PRESETS: Record<AIProviderType, ProviderPreset> = {
  openai_compatible: {
    type: 'openai_compatible',
    label: 'OpenAI-Compatible (Base URL tùy chỉnh / Proxy / Local)',
    shortLabel: 'OpenAI-Compatible',
    defaultBaseUrl: 'https://api.openai.com/v1',
    keyPlaceholder: 'sk-... hoặc API Token bất kỳ',
    format: 'openai',
    defaultAuthScheme: 'bearer',
    supportsModelDiscovery: true,
    note: 'Hỗ trợ mọi nhà cung cấp hoặc Reverse Proxy chuẩn OpenAI (/models & /chat/completions).'
  },
  openrouter: {
    type: 'openrouter',
    label: 'OpenRouter (Đa model từ nhiều hãng)',
    shortLabel: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    keyPlaceholder: 'sk-or-v1-...',
    format: 'openai',
    defaultAuthScheme: 'bearer',
    supportsModelDiscovery: true,
    note: 'Tự động tải toàn bộ danh sách model OpenRouter kèm thông tin context & tên hiển thị.'
  },
  openai: {
    type: 'openai',
    label: 'OpenAI (Chính thức)',
    shortLabel: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    keyPlaceholder: 'sk-proj-...',
    format: 'openai',
    defaultAuthScheme: 'bearer',
    supportsModelDiscovery: true,
    note: 'Kết nối trực tiếp OpenAI API chính thức (/v1/models & /v1/chat/completions).'
  },
  deepseek: {
    type: 'deepseek',
    label: 'DeepSeek API',
    shortLabel: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    keyPlaceholder: 'sk-...',
    format: 'openai',
    defaultAuthScheme: 'bearer',
    supportsModelDiscovery: true,
    note: 'Kết nối trực tiếp DeepSeek API chuẩn OpenAI.'
  },
  anthropic: {
    type: 'anthropic',
    label: 'Anthropic Claude (Native)',
    shortLabel: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    keyPlaceholder: 'sk-ant-...',
    format: 'anthropic',
    defaultAuthScheme: 'x-api-key',
    supportsModelDiscovery: true,
    note: 'Gọi trực tiếp Anthropic Messages API (BYOK) và tự động quét /v1/models.'
  },
  groq: {
    type: 'groq',
    label: 'Groq Cloud',
    shortLabel: 'Groq',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    keyPlaceholder: 'gsk_...',
    format: 'openai',
    defaultAuthScheme: 'bearer',
    supportsModelDiscovery: true,
    note: 'Tốc độ phản hồi cực nhanh, hỗ trợ tự động tải danh sách model.'
  },
  xai: {
    type: 'xai',
    label: 'xAI (Grok)',
    shortLabel: 'xAI',
    defaultBaseUrl: 'https://api.x.ai/v1',
    keyPlaceholder: 'xai-...',
    format: 'openai',
    defaultAuthScheme: 'bearer',
    supportsModelDiscovery: true,
    note: 'Kết nối trực tiếp API Grok của xAI.'
  },
  gemini_native: {
    type: 'gemini_native',
    label: 'Google Gemini (Custom Endpoint / Native REST)',
    shortLabel: 'Gemini Native',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    keyPlaceholder: 'AIza...',
    format: 'gemini',
    defaultAuthScheme: 'x-goog-api-key',
    supportsModelDiscovery: true,
    note: 'Kết nối Gemini REST API bằng Base URL và Key riêng (tự quét /v1beta/models).'
  },
  custom: {
    type: 'custom',
    label: 'Custom OpenAI-Compatible (Legacy Alias)',
    shortLabel: 'Custom',
    defaultBaseUrl: 'https://api.openai.com/v1',
    keyPlaceholder: 'sk-...',
    format: 'openai',
    defaultAuthScheme: 'bearer',
    supportsModelDiscovery: true,
    note: 'Tương thích chuẩn OpenAI với Base URL tùy biến.'
  }
};

export function getPresetForProviderType(type: AIProviderType): ProviderPreset {
  return PROVIDER_PRESETS[type] || PROVIDER_PRESETS.openai_compatible;
}

export function getProtocolFormat(type: AIProviderType): ProviderProtocolFormat {
  return getPresetForProviderType(type).format;
}

export function normalizeBaseUrl(rawUrl: string, fallback: string = ''): string {
  const input = (rawUrl || fallback || '').trim();
  if (!input) return '';

  let cleaned = input.replace(/\/+$/, '');
  // Strip known leaf endpoints so base URL never causes /v1/v1/chat/completions or /models/models
  cleaned = cleaned
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/completions$/i, '')
    .replace(/\/messages$/i, '')
    .replace(/\/models$/i, '')
    .replace(/\/+$/, '');

  // Collapse accidental consecutive duplicate /v1/v1
  cleaned = cleaned.replace(/\/v1\/v1(\/|$)/gi, '/v1$1');
  return cleaned;
}

export function validateBaseUrl(rawUrl: string): { valid: boolean; normalized: string; error?: string } {
  const normalized = normalizeBaseUrl(rawUrl);
  if (!normalized) {
    return { valid: false, normalized: '', error: 'Base URL không được để trống.' };
  }
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        valid: false,
        normalized,
        error: 'Base URL phải bắt đầu bằng http:// hoặc https://.'
      };
    }
    if (!parsed.hostname) {
      return { valid: false, normalized, error: 'Base URL thiếu tên miền (hostname) hợp lệ.' };
    }
    return { valid: true, normalized };
  } catch {
    return {
      valid: false,
      normalized,
      error: 'Định dạng Base URL không hợp lệ (ví dụ: https://api.example.com/v1).'
    };
  }
}

/**
 * Joins a normalized baseUrl and relative path without duplicating slashes or /v1 prefixes.
 */
export function buildEndpointUrl(baseUrl: string, suffixPath: string): string {
  const cleanBase = normalizeBaseUrl(baseUrl);
  let cleanSuffix = suffixPath.startsWith('/') ? suffixPath : `/${suffixPath}`;

  if (cleanBase.toLowerCase().endsWith('/v1') && cleanSuffix.toLowerCase().startsWith('/v1/')) {
    cleanSuffix = cleanSuffix.slice(3);
  }
  return `${cleanBase}${cleanSuffix}`;
}

export function detectProviderType(
  baseUrl: string,
  apiKey?: string,
  fallbackType: AIProviderType = 'openai_compatible'
): AIProviderType {
  const lowerUrl = (baseUrl || '').toLowerCase();
  const trimmedKey = (apiKey || '').trim();

  if (lowerUrl.includes('openrouter.ai')) return 'openrouter';
  if (lowerUrl.includes('api.openai.com')) return 'openai';
  if (lowerUrl.includes('api.deepseek.com')) return 'deepseek';
  if (lowerUrl.includes('api.anthropic.com')) return 'anthropic';
  if (lowerUrl.includes('api.groq.com')) return 'groq';
  if (lowerUrl.includes('api.x.ai')) return 'xai';
  if (lowerUrl.includes('generativelanguage.googleapis.com')) return 'gemini_native';

  // Heuristic from API key prefix only when URL is blank or generic custom
  if (!lowerUrl || fallbackType === 'openai_compatible' || fallbackType === 'custom') {
    if (trimmedKey.startsWith('sk-or-')) return 'openrouter';
    if (trimmedKey.startsWith('sk-ant-')) return 'anthropic';
    if (trimmedKey.startsWith('gsk_')) return 'groq';
    if (trimmedKey.startsWith('xai-')) return 'xai';
    if (trimmedKey.startsWith('AIza')) return 'gemini_native';
  }

  return fallbackType === 'custom' ? 'openai_compatible' : fallbackType;
}

export function buildProviderAuthHeaders(options: {
  providerType: AIProviderType;
  apiKey: string;
  authScheme?: ProviderAuthScheme;
  authHeaderName?: string;
  customHeaders?: Record<string, string>;
}): Record<string, string> {
  const preset = getPresetForProviderType(options.providerType);
  const scheme = options.authScheme || preset.defaultAuthScheme || 'bearer';
  const key = (options.apiKey || '').trim();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (key && scheme !== 'none') {
    if (scheme === 'x-api-key') {
      headers['x-api-key'] = key;
    } else if (scheme === 'x-goog-api-key') {
      headers['x-goog-api-key'] = key;
    } else if (scheme === 'custom_header') {
      const headerName = (options.authHeaderName || 'Authorization').trim();
      if (headerName) {
        headers[headerName] = key;
      }
    } else {
      headers['Authorization'] = `Bearer ${key}`;
    }
  }

  if (options.providerType === 'anthropic' || preset.format === 'anthropic') {
    headers['anthropic-version'] = headers['anthropic-version'] || '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  }

  if (options.providerType === 'openrouter') {
    headers['HTTP-Referer'] =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://aetheria.app';
    headers['X-Title'] = 'Aetheria Studio';
  }

  if (options.customHeaders) {
    for (const [rawK, rawV] of Object.entries(options.customHeaders)) {
      const k = rawK.trim();
      const v = typeof rawV === 'string' ? rawV.trim() : '';
      if (k && v) {
        headers[k] = v;
      }
    }
  }

  return headers;
}

function hashFingerprint(input: string): string {
  // Non-reversible short FNV-1a digest solely for cache keying (never stores raw secret)
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

interface DiscoveryCacheEntry {
  expiresAt: number;
  result: ModelDiscoveryResult;
}

const DISCOVERY_CACHE_TTL_MS = 5 * 60 * 1000;
const discoveryCache = new Map<string, DiscoveryCacheEntry>();
const inFlightRequests = new Map<string, Promise<ModelDiscoveryResult>>();

export interface DiscoveryRequestParams {
  providerType: AIProviderType;
  baseUrl: string;
  apiKey: string;
  authScheme?: ProviderAuthScheme;
  authHeaderName?: string;
  customHeaders?: Record<string, string>;
  forceRefresh?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

interface ProviderDiscoveryAdapter {
  parseResponse: (json: any, providerLabel: string) => DiscoveredModel[];
  buildCandidateEndpoints: (normalizedBaseUrl: string) => string[];
}

function normalizeModelItem(raw: any, providerLabel: string): DiscoveredModel | null {
  if (typeof raw === 'string') {
    const id = raw.trim();
    return id ? { id, name: id, providerName: providerLabel } : null;
  }
  if (!raw || typeof raw !== 'object') return null;

  const rawId = raw.id || raw.model || raw.name;
  if (typeof rawId !== 'string' || !rawId.trim()) return null;

  // Strip Gemini REST "models/" prefix cleanly if present
  const cleanId = rawId.trim().replace(/^models\//, '');
  const displayName =
    typeof raw.displayName === 'string' && raw.displayName.trim()
      ? raw.displayName.trim()
      : typeof raw.display_name === 'string' && raw.display_name.trim()
      ? raw.display_name.trim()
      : typeof raw.name === 'string' && raw.name.trim() && raw.name !== rawId
      ? raw.name.trim()
      : cleanId;

  const contextLength =
    typeof raw.context_length === 'number'
      ? raw.context_length
      : typeof raw.context_window === 'number'
      ? raw.context_window
      : typeof raw.inputTokenLimit === 'number'
      ? raw.inputTokenLimit
      : undefined;

  const maxOutputTokens =
    typeof raw.max_output_tokens === 'number'
      ? raw.max_output_tokens
      : typeof raw.outputTokenLimit === 'number'
      ? raw.outputTokenLimit
      : typeof raw.top_provider?.max_completion_tokens === 'number'
      ? raw.top_provider.max_completion_tokens
      : undefined;

  return {
    id: cleanId,
    name: displayName,
    providerName: providerLabel,
    ownedBy: typeof raw.owned_by === 'string' ? raw.owned_by : undefined,
    contextLength,
    maxOutputTokens,
    description: typeof raw.description === 'string' ? raw.description.slice(0, 180) : undefined,
    pricingPrompt: raw.pricing?.prompt ? String(raw.pricing.prompt) : undefined,
    pricingCompletion: raw.pricing?.completion ? String(raw.pricing.completion) : undefined
  };
}

function parseGenericModelPayload(payload: any, providerLabel: string): DiscoveredModel[] {
  let rawList: any[] = [];
  if (Array.isArray(payload)) {
    rawList = payload;
  } else if (Array.isArray(payload?.data)) {
    rawList = payload.data;
  } else if (Array.isArray(payload?.models)) {
    rawList = payload.models;
  } else if (Array.isArray(payload?.data?.models)) {
    rawList = payload.data.models;
  }

  const seen = new Set<string>();
  const models: DiscoveredModel[] = [];

  for (const item of rawList) {
    // For Gemini native, optionally skip pure embedding/aqa/imagen models if supportedGenerationMethods excludes generateContent
    if (
      Array.isArray(item?.supportedGenerationMethods) &&
      !item.supportedGenerationMethods.includes('generateContent')
    ) {
      continue;
    }

    const normalized = normalizeModelItem(item, providerLabel);
    if (!normalized) continue;
    if (seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    models.push(normalized);
  }

  models.sort((a, b) => a.id.localeCompare(b.id));
  return models;
}

const openAiCompatibleAdapter: ProviderDiscoveryAdapter = {
  buildCandidateEndpoints: (normalizedBaseUrl: string) => {
    const primary = buildEndpointUrl(normalizedBaseUrl, '/models');
    try {
      const parsed = new URL(normalizedBaseUrl);
      if (parsed.pathname === '' || parsed.pathname === '/') {
        return [primary, buildEndpointUrl(normalizedBaseUrl, '/v1/models')];
      }
    } catch {
      // ignore
    }
    return [primary];
  },
  parseResponse: (json, providerLabel) => parseGenericModelPayload(json, providerLabel)
};

const anthropicAdapter: ProviderDiscoveryAdapter = {
  buildCandidateEndpoints: (normalizedBaseUrl: string) => {
    return [buildEndpointUrl(normalizedBaseUrl, '/models')];
  },
  parseResponse: (json, providerLabel) => parseGenericModelPayload(json, providerLabel)
};

const geminiNativeAdapter: ProviderDiscoveryAdapter = {
  buildCandidateEndpoints: (normalizedBaseUrl: string) => {
    return [buildEndpointUrl(normalizedBaseUrl, '/models?pageSize=100')];
  },
  parseResponse: (json, providerLabel) => parseGenericModelPayload(json, providerLabel)
};

function getDiscoveryAdapter(providerType: AIProviderType): ProviderDiscoveryAdapter {
  const format = getProtocolFormat(providerType);
  if (format === 'anthropic') return anthropicAdapter;
  if (format === 'gemini') return geminiNativeAdapter;
  return openAiCompatibleAdapter;
}

function formatDiscoveryHttpError(status: number, bodyText: string, apiKey: string): string {
  const safeBody = redactSecrets(bodyText, [apiKey]).slice(0, 220);
  if (status === 401 || status === 403) {
    return `Xác thực thất bại (HTTP ${status}): API Key không hợp lệ hoặc không có quyền đọc danh sách model.${safeBody ? ` (${safeBody})` : ''}`;
  }
  if (status === 404 || status === 405 || status === 501) {
    return `Endpoint /models không được hỗ trợ trên Base URL này (HTTP ${status}). Bạn có thể chuyển sang nhập tên Model thủ công.`;
  }
  if (status === 429) {
    return `Chạm giới hạn tần suất (HTTP 429) khi lấy danh sách model. Vui lòng thử lại sau giây lát.`;
  }
  if (status >= 500) {
    return `Máy chủ provider đang gặp lỗi (HTTP ${status}).${safeBody ? ` (${safeBody})` : ''}`;
  }
  return `Không thể tải danh sách model (HTTP ${status}).${safeBody ? ` (${safeBody})` : ''}`;
}

export const modelDiscoveryService = {
  clearCache(): void {
    discoveryCache.clear();
  },

  invalidateEntry(baseUrl: string, apiKey: string): void {
    const cleanBase = normalizeBaseUrl(baseUrl);
    const keyHash = hashFingerprint((apiKey || '').trim());
    for (const key of discoveryCache.keys()) {
      if (key.includes(`|${cleanBase}|${keyHash}|`)) {
        discoveryCache.delete(key);
      }
    }
  },

  async discoverModels(params: DiscoveryRequestParams): Promise<ModelDiscoveryResult> {
    const effectiveType = detectProviderType(params.baseUrl, params.apiKey, params.providerType);
    const preset = getPresetForProviderType(effectiveType);
    const urlCheck = validateBaseUrl(params.baseUrl);

    if (!urlCheck.valid) {
      return {
        status: 'error',
        models: [],
        detectedProviderType: effectiveType,
        errorMessage: urlCheck.error || 'Base URL không hợp lệ.',
        fromCache: false,
        fetchedAt: Date.now()
      };
    }

    const cleanKey = (params.apiKey || '').trim();
    const scheme = params.authScheme || preset.defaultAuthScheme;
    if (!cleanKey && scheme !== 'none') {
      return {
        status: 'error',
        models: [],
        detectedProviderType: effectiveType,
        errorMessage: 'Cần nhập API Key để tự động quét danh sách model.',
        fromCache: false,
        fetchedAt: Date.now()
      };
    }

    if (typeof window !== 'undefined' && !isServerRuntime()) {
      return serverSyncClient.discoverModels({
        providerType: params.providerType,
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        authScheme: params.authScheme,
        authHeaderName: params.authHeaderName,
        customHeaders: params.customHeaders,
        forceRefresh: params.forceRefresh
      });
    }

    const headersHash = hashFingerprint(JSON.stringify(params.customHeaders || {}));
    const cacheKey = `${effectiveType}|${urlCheck.normalized}|${hashFingerprint(cleanKey)}|${scheme}|${headersHash}`;

    if (!params.forceRefresh) {
      const cached = discoveryCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return {
          ...cached.result,
          fromCache: true
        };
      }
    }

    if (!params.signal && !params.forceRefresh && inFlightRequests.has(cacheKey)) {
      return inFlightRequests.get(cacheKey)!;
    }

    const runDiscovery = async (): Promise<ModelDiscoveryResult> => {
      const adapter = getDiscoveryAdapter(effectiveType);
      const candidateUrls = adapter.buildCandidateEndpoints(urlCheck.normalized);
      const headers = buildProviderAuthHeaders({
        providerType: effectiveType,
        apiKey: cleanKey,
        authScheme: scheme,
        authHeaderName: params.authHeaderName,
        customHeaders: params.customHeaders
      });

      const timeoutMs = params.timeoutMs || 15000;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const onExternalAbort = () => controller.abort();
      if (params.signal) {
        if (params.signal.aborted) {
          clearTimeout(timer);
          throw new DOMException('Aborted', 'AbortError');
        }
        params.signal.addEventListener('abort', onExternalAbort, { once: true });
      }

      try {
        let lastStatusCode: number | undefined;
        let lastErrorMessage = '';
        let endpointUsed = candidateUrls[0];

        for (let idx = 0; idx < candidateUrls.length; idx++) {
          const url = candidateUrls[idx];
          endpointUsed = url;

          const res = await fetch(url, {
            method: 'GET',
            headers,
            signal: controller.signal
          });

          lastStatusCode = res.status;

          if (!res.ok) {
            const rawErr = await res.text().catch(() => '');
            lastErrorMessage = formatDiscoveryHttpError(res.status, rawErr, cleanKey);
            // Retry fallback candidate URL only on 404 when there is another endpoint to probe
            if (res.status === 404 && idx < candidateUrls.length - 1) {
              continue;
            }
            const isUnsupported = res.status === 404 || res.status === 405 || res.status === 501;
            return {
              status: isUnsupported ? 'unsupported' : 'error',
              models: [],
              detectedProviderType: effectiveType,
              endpointUsed,
              statusCode: res.status,
              errorMessage: lastErrorMessage,
              fromCache: false,
              fetchedAt: Date.now()
            };
          }

          let json: any;
          const contentType = res.headers.get('content-type') || '';
          const rawText = await res.text();
          try {
            json = JSON.parse(rawText);
          } catch {
            return {
              status: 'error',
              models: [],
              detectedProviderType: effectiveType,
              endpointUsed,
              statusCode: res.status,
              errorMessage: `Phản hồi từ ${endpointUsed} không phải JSON hợp lệ (${contentType || 'unknown'}). Vui lòng kiểm tra lại Base URL hoặc nhập Model thủ công.`,
              fromCache: false,
              fetchedAt: Date.now()
            };
          }

          const models = adapter.parseResponse(json, preset.shortLabel);
          const result: ModelDiscoveryResult = {
            status: models.length > 0 ? 'success' : 'empty',
            models,
            detectedProviderType: effectiveType,
            endpointUsed,
            statusCode: res.status,
            errorMessage:
              models.length === 0
                ? 'API trả về thành công nhưng không có model nào khả dụng cho API Key này.'
                : undefined,
            fromCache: false,
            fetchedAt: Date.now()
          };

          discoveryCache.set(cacheKey, {
            expiresAt: Date.now() + DISCOVERY_CACHE_TTL_MS,
            result
          });
          return result;
        }

        return {
          status: 'error',
          models: [],
          detectedProviderType: effectiveType,
          endpointUsed,
          statusCode: lastStatusCode,
          errorMessage: lastErrorMessage || 'Không thể tải danh sách model từ provider.',
          fromCache: false,
          fetchedAt: Date.now()
        };
      } catch (err: any) {
        if (err?.name === 'AbortError' || controller.signal.aborted) {
          if (params.signal?.aborted) {
            throw err;
          }
          return {
            status: 'error',
            models: [],
            detectedProviderType: effectiveType,
            errorMessage: `Quá thời gian chờ (${Math.round(timeoutMs / 1000)}s) khi tải danh sách model.`,
            fromCache: false,
            fetchedAt: Date.now()
          };
        }

        const safeErr = redactSecrets(String(err?.message || err || 'Lỗi kết nối'), [cleanKey]);
        const isNetwork =
          safeErr.toLowerCase().includes('failed to fetch') ||
          safeErr.toLowerCase().includes('network') ||
          safeErr.toLowerCase().includes('load failed');

        return {
          status: 'error',
          models: [],
          detectedProviderType: effectiveType,
          errorMessage: isNetwork
            ? `Không thể kết nối tới ${urlCheck.normalized} (CORS bị chặn trên trình duyệt hoặc sai địa chỉ mạng). Bạn vẫn có thể nhập tên Model thủ công.`
            : `Lỗi tải danh sách model: ${safeErr}`,
          fromCache: false,
          fetchedAt: Date.now()
        };
      } finally {
        clearTimeout(timer);
        if (params.signal) {
          params.signal.removeEventListener('abort', onExternalAbort);
        }
      }
    };

    const promise = runDiscovery();
    if (!params.signal) {
      inFlightRequests.set(cacheKey, promise);
      promise.finally(() => {
        if (inFlightRequests.get(cacheKey) === promise) {
          inFlightRequests.delete(cacheKey);
        }
      });
    }
    return promise;
  }
};
