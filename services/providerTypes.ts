export type AIProviderType =
  | 'openai_compatible'
  | 'openai'
  | 'openrouter'
  | 'deepseek'
  | 'groq'
  | 'xai'
  | 'anthropic'
  | 'gemini_native'
  | 'custom';

export type ProviderProtocolFormat = 'openai' | 'anthropic' | 'gemini';

export type ProviderAuthScheme = 'bearer' | 'x-api-key' | 'x-goog-api-key' | 'custom_header' | 'none';

export type ProviderTaskRole = 'all' | 'pro' | 'flash';

export interface ProviderCustomHeader {
  key: string;
  value: string;
}

/**
 * Non-secret provider metadata stored separately from encrypted credentials.
 */
export interface ProviderMetadataRecord {
  id: string;
  name: string;
  providerType: AIProviderType;
  baseUrl: string;
  model: string;
  temperature?: number; // 0.0 - 2.0 (undefined = use model/task default)
  maxTokens?: number;   // Max output tokens (undefined = use task default)
  customHeaders?: Record<string, string>;
  authScheme?: ProviderAuthScheme;
  authHeaderName?: string;
  role: ProviderTaskRole;
  enabled: boolean;
  isDefault: boolean;
  priority: number;
  hasStoredApiKey?: boolean;
  createdAt?: number;
  updatedAt?: number;
  lastTestedAt?: number;
  lastTestSuccess?: boolean;
  lastTestMessage?: string;
}

/**
 * Runtime/resolved profile combining metadata + decrypted credential (in-memory only).
 */
export interface ExternalProviderProfile extends ProviderMetadataRecord {
  apiKey: string;
}

export interface ProviderDraftInput {
  id?: string;
  name: string;
  providerType: AIProviderType;
  baseUrl: string;
  apiKey?: string;
  clearApiKey?: boolean;
  model: string;
  temperature?: number;
  maxTokens?: number;
  customHeaders?: Record<string, string>;
  authScheme?: ProviderAuthScheme;
  authHeaderName?: string;
  role?: ProviderTaskRole;
  enabled?: boolean;
  isDefault?: boolean;
  priority?: number;
}

export interface ProviderRoutingConfig {
  activeProBackend: 'gemini' | 'external';
  activeFlashBackend: 'gemini' | 'external';
  fallbackToGemini: boolean;
}

export interface ProviderPreset {
  type: AIProviderType;
  label: string;
  shortLabel: string;
  defaultBaseUrl: string;
  keyPlaceholder: string;
  format: ProviderProtocolFormat;
  defaultAuthScheme: ProviderAuthScheme;
  supportsModelDiscovery: boolean;
  note: string;
}

export interface DiscoveredModel {
  id: string;
  name: string;
  providerName: string;
  ownedBy?: string;
  contextLength?: number;
  maxOutputTokens?: number;
  description?: string;
  pricingPrompt?: string;
  pricingCompletion?: string;
}

export type ModelDiscoveryStatus = 'idle' | 'loading' | 'success' | 'empty' | 'unsupported' | 'error';

export interface ModelDiscoveryResult {
  status: ModelDiscoveryStatus;
  models: DiscoveredModel[];
  detectedProviderType?: AIProviderType;
  endpointUsed?: string;
  errorMessage?: string;
  statusCode?: number;
  fromCache: boolean;
  fetchedAt: number;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  latencyMs: number;
  statusCode?: number;
  errorCode?:
    | 'VALIDATION_ERROR'
    | 'INVALID_URL'
    | 'AUTH_FAILED'
    | 'MODEL_NOT_FOUND'
    | 'RATE_LIMITED'
    | 'SERVER_ERROR'
    | 'TIMEOUT'
    | 'NETWORK_ERROR'
    | 'INVALID_RESPONSE'
    | 'UNSUPPORTED_PARAM'
    | 'UNKNOWN';
  omittedParams?: string[];
}

export interface ProviderExportEntry {
  id: string;
  provider_name: string;
  provider_type: AIProviderType;
  base_url: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
  custom_headers?: Record<string, string>;
  auth_scheme?: ProviderAuthScheme;
  auth_header_name?: string;
  role: ProviderTaskRole;
  enabled: boolean;
  is_default: boolean;
  priority: number;
  api_key?: string;
  api_key_included: boolean;
}

export interface ProviderExportBundle {
  schema: 'aetheria-providers-v2';
  exportedAt: number;
  includesApiKeys: boolean;
  providers: ProviderExportEntry[];
  routing?: ProviderRoutingConfig;
}
