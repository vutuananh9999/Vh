import { plotDebugLogger, PlotDebugLogItem } from './plotDebugLogger.ts';
import { tokenTracker } from './tokenTracker.ts';

export type AIProviderType =
  | 'openai'
  | 'openrouter'
  | 'deepseek'
  | 'groq'
  | 'xai'
  | 'anthropic'
  | 'custom';

export type ProviderTaskRole = 'all' | 'pro' | 'flash';

export interface ExternalProviderProfile {
  id: string;
  name: string;
  providerType: AIProviderType;
  apiKey: string;
  baseUrl: string;
  model: string;
  role: ProviderTaskRole;
  enabled: boolean;
  priority: number;
}

export interface ProviderRoutingConfig {
  activeProBackend: 'gemini' | 'external';
  activeFlashBackend: 'gemini' | 'external';
  fallbackToGemini: boolean;
}

export interface ProviderPreset {
  type: AIProviderType;
  label: string;
  defaultBaseUrl: string;
  keyPlaceholder: string;
  suggestedModels: string[];
  format: 'openai' | 'anthropic';
  note: string;
}

export const EXTERNAL_PROVIDERS_STORAGE_KEY = 'aetheria_external_providers_v1';
export const PROVIDER_ROUTING_STORAGE_KEY = 'aetheria_provider_routing_v1';

export const PROVIDER_PRESETS: Record<AIProviderType, ProviderPreset> = {
  openrouter: {
    type: 'openrouter',
    label: 'OpenRouter (Claude, DeepSeek, GPT, Gemini...)',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    keyPlaceholder: 'sk-or-v1-...',
    suggestedModels: [
      'anthropic/claude-sonnet-4',
      'deepseek/deepseek-chat-v3-0324',
      'deepseek/deepseek-r1',
      'openai/gpt-4.1',
      'google/gemini-2.5-pro'
    ],
    format: 'openai',
    note: 'Hỗ trợ gọi trực tiếp từ trình duyệt (Netlify/Safari), dùng 1 Key cho hàng trăm model.'
  },
  openai: {
    type: 'openai',
    label: 'OpenAI (GPT-4.1, GPT-4o, o3-mini)',
    defaultBaseUrl: 'https://api.openai.com/v1',
    keyPlaceholder: 'sk-proj-...',
    suggestedModels: ['gpt-4.1', 'gpt-4o', 'gpt-4o-mini', 'o4-mini', 'o3-mini'],
    format: 'openai',
    note: 'Kết nối trực tiếp OpenAI API chính thức.'
  },
  deepseek: {
    type: 'deepseek',
    label: 'DeepSeek (V3 / R1 Reasoner)',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    keyPlaceholder: 'sk-...',
    suggestedModels: ['deepseek-chat', 'deepseek-reasoner'],
    format: 'openai',
    note: 'Chi phí rất thấp, viết văn & suy luận mạch truyện mượt.'
  },
  anthropic: {
    type: 'anthropic',
    label: 'Anthropic Claude (Trực tiếp)',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    keyPlaceholder: 'sk-ant-...',
    suggestedModels: [
      'claude-sonnet-4-20250514',
      'claude-3-7-sonnet-20250219',
      'claude-3-5-haiku-20241022'
    ],
    format: 'anthropic',
    note: 'Gọi trực tiếp Anthropic Messages API (hỗ trợ trình duyệt BYOK).'
  },
  groq: {
    type: 'groq',
    label: 'Groq (Llama 3.3 / DeepSeek tốc độ siêu nhanh)',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    keyPlaceholder: 'gsk_...',
    suggestedModels: [
      'llama-3.3-70b-versatile',
      'deepseek-r1-distill-llama-70b',
      'qwen-qwq-32b'
    ],
    format: 'openai',
    note: 'Tốc độ phản hồi cực nhanh, có gói miễn phí.'
  },
  xai: {
    type: 'xai',
    label: 'xAI Grok',
    defaultBaseUrl: 'https://api.x.ai/v1',
    keyPlaceholder: 'xai-...',
    suggestedModels: ['grok-3', 'grok-3-mini'],
    format: 'openai',
    note: 'Kết nối trực tiếp API Grok của xAI.'
  },
  custom: {
    type: 'custom',
    label: 'Custom OpenAI-Compatible (Proxy / Together / Local...)',
    defaultBaseUrl: 'https://api.together.xyz/v1',
    keyPlaceholder: 'sk-... hoặc API Token bất kỳ',
    suggestedModels: ['meta-llama/Llama-3.3-70B-Instruct-Turbo'],
    format: 'openai',
    note: 'Dùng bất kỳ nhà cung cấp hoặc Reverse Proxy chuẩn OpenAI (/chat/completions).'
  }
};

const externalCooldowns = new Map<string, number>();
let lastExternalPoolIndex = 0;

function cleanBaseUrl(url: string, fallback: string): string {
  const trimmed = (url || fallback || '').trim().replace(/\/+$/, '');
  return trimmed
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/messages$/i, '');
}

function getDefaultRouting(): ProviderRoutingConfig {
  return {
    activeProBackend: 'gemini',
    activeFlashBackend: 'gemini',
    fallbackToGemini: true
  };
}

function extractTextFromGeminiContent(payload: any): string {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (Array.isArray(payload)) {
    return payload.map(item => extractTextFromGeminiContent(item)).filter(Boolean).join('\n');
  }
  if (typeof payload === 'object') {
    if (typeof payload.text === 'string') return payload.text;
    if (Array.isArray(payload.parts)) return extractTextFromGeminiContent(payload.parts);
    if (payload.contents) return extractTextFromGeminiContent(payload.contents);
  }
  return '';
}

function schemaToDescription(schema: any, depth: number = 0): any {
  if (!schema || typeof schema !== 'object' || depth > 5) return 'any';
  const rawType = String(schema.type || '').toLowerCase();
  if (rawType === 'object' || schema.properties) {
    const props: Record<string, any> = {};
    for (const [k, v] of Object.entries(schema.properties || {})) {
      props[k] = schemaToDescription(v, depth + 1);
    }
    return props;
  }
  if (rawType === 'array' || schema.items) {
    return [schemaToDescription(schema.items, depth + 1)];
  }
  const desc = schema.description ? ` (${schema.description})` : '';
  return `<${rawType || 'string'}${desc}>`;
}

function normalizeToChatMessages(
  params: any,
  sendParams?: any
): { system: string; messages: Array<{ role: 'user' | 'assistant'; content: string }>; wantsJson: boolean } {
  let system = extractTextFromGeminiContent(params?.config?.systemInstruction);
  const wantsJson =
    params?.config?.responseMimeType === 'application/json' || Boolean(params?.config?.responseSchema);

  if (wantsJson) {
    let schemaHint = '';
    if (params?.config?.responseSchema) {
      try {
        schemaHint = `\nCấu trúc JSON bắt buộc (chỉ trả về JSON thuần hợp lệ, không bọc markdown \`\`\`json nếu không cần thiết):\n${JSON.stringify(
          schemaToDescription(params.config.responseSchema),
          null,
          2
        )}`;
      } catch {
        schemaHint = '\nBẮT BUỘC chỉ trả về JSON hợp lệ.';
      }
    } else {
      schemaHint = '\nBẮT BUỘC chỉ trả về JSON thuần hợp lệ.';
    }
    system = system ? `${system}\n\n[JSON OUTPUT PROTOCOL]${schemaHint}` : `[JSON OUTPUT PROTOCOL]${schemaHint}`;
  }

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  if (Array.isArray(params?.history)) {
    for (const turn of params.history) {
      const text = extractTextFromGeminiContent(turn?.parts ?? turn);
      if (!text) continue;
      messages.push({
        role: turn?.role === 'model' || turn?.role === 'assistant' ? 'assistant' : 'user',
        content: text
      });
    }
  }

  if (sendParams !== undefined) {
    const userText = extractTextFromGeminiContent(sendParams?.message ?? sendParams);
    if (userText) {
      messages.push({ role: 'user', content: userText });
    }
  } else if (Array.isArray(params?.contents)) {
    for (const item of params.contents) {
      const role = item?.role === 'model' || item?.role === 'assistant' ? 'assistant' : 'user';
      const text = extractTextFromGeminiContent(item?.parts ?? item);
      if (text) {
        messages.push({ role, content: text });
      }
    }
  } else {
    const text = extractTextFromGeminiContent(params?.contents);
    if (text) {
      messages.push({ role: 'user', content: text });
    }
  }

  if (messages.length === 0) {
    messages.push({ role: 'user', content: 'Hãy thực hiện yêu cầu trên.' });
  }

  return { system, messages, wantsJson };
}

function buildGeminiCompatibleResponse(
  text: string,
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number }
) {
  const promptTokenCount = usage?.promptTokens || 0;
  const candidatesTokenCount = usage?.completionTokens || 0;
  const totalTokenCount = usage?.totalTokens || promptTokenCount + candidatesTokenCount;
  return {
    text,
    candidates: [
      {
        content: {
          role: 'model',
          parts: [{ text }]
        }
      }
    ],
    usageMetadata:
      totalTokenCount > 0 || promptTokenCount > 0 || candidatesTokenCount > 0
        ? {
            promptTokenCount,
            candidatesTokenCount,
            totalTokenCount
          }
        : undefined
  };
}

function mergeConsecutiveMessagesForAnthropic(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const merged: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const m of messages) {
    if (merged.length === 0) {
      if (m.role === 'assistant') {
        merged.push({ role: 'user', content: 'Tiếp tục.' });
      }
      merged.push({ ...m });
      continue;
    }
    const last = merged[merged.length - 1];
    if (last.role === m.role) {
      last.content += `\n\n${m.content}`;
    } else {
      merged.push({ ...m });
    }
  }
  return merged;
}

function isExternalQuotaOrRateError(status: number, errText: string): boolean {
  if (status === 429) return true;
  const lower = errText.toLowerCase();
  return (
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('quota') ||
    lower.includes('insufficient_quota') ||
    lower.includes('credit balance')
  );
}

function isExternalTransientError(err: any): boolean {
  const status = err?.status;
  if (status === 503 || status === 502 || status === 504 || status === 500) {
    return true;
  }
  const lower = String(err?.message || err || '').toLowerCase();
  return (
    lower.includes('503') ||
    lower.includes('502') ||
    lower.includes('504') ||
    lower.includes('500') ||
    lower.includes('overloaded') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('failed to fetch') ||
    lower.includes('network') ||
    lower.includes('timeout')
  );
}

export const externalProviderService = {
  getProfiles(): ExternalProviderProfile[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(EXTERNAL_PROVIDERS_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  saveProfiles(profiles: ExternalProviderProfile[]): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(EXTERNAL_PROVIDERS_STORAGE_KEY, JSON.stringify(profiles));
  },

  getRoutingConfig(): ProviderRoutingConfig {
    if (typeof localStorage === 'undefined') return getDefaultRouting();
    try {
      const raw = localStorage.getItem(PROVIDER_ROUTING_STORAGE_KEY);
      if (!raw) return getDefaultRouting();
      const parsed = JSON.parse(raw);
      return {
        ...getDefaultRouting(),
        ...(parsed || {})
      };
    } catch {
      return getDefaultRouting();
    }
  },

  saveRoutingConfig(config: ProviderRoutingConfig): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(PROVIDER_ROUTING_STORAGE_KEY, JSON.stringify(config));
  },

  isProfileCoolingDown(id: string): boolean {
    const exp = externalCooldowns.get(id);
    if (!exp) return false;
    if (Date.now() >= exp) {
      externalCooldowns.delete(id);
      return false;
    }
    return true;
  },

  markProfileRateLimited(id: string, cooldownMs: number = 25000): void {
    externalCooldowns.set(id, Date.now() + cooldownMs);
  },

  clearProfileCooldown(id: string): void {
    externalCooldowns.delete(id);
  },

  clearAllCooldowns(): void {
    externalCooldowns.clear();
  },

  getCandidateProfilesForTask(tier: 'pro' | 'flash'): ExternalProviderProfile[] {
    const routing = this.getRoutingConfig();
    const backend = tier === 'pro' ? routing.activeProBackend : routing.activeFlashBackend;
    if (backend !== 'external') return [];

    const all = this.getProfiles().filter(
      p => p.enabled && p.apiKey?.trim() && p.model?.trim()
    );
    const matching = all.filter(p => p.role === tier || p.role === 'all');
    // Specific role first, then 'all', then priority order
    matching.sort((a, b) => {
      const aExact = a.role === tier ? 0 : 1;
      const bExact = b.role === tier ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return (a.priority || 0) - (b.priority || 0);
    });
    return matching;
  },

  async invokeGenerateSingle(
    profile: ExternalProviderProfile,
    params: any,
    sendParams?: any,
    signal?: AbortSignal
  ): Promise<any> {
    const preset = PROVIDER_PRESETS[profile.providerType] || PROVIDER_PRESETS.custom;
    const baseUrl = cleanBaseUrl(profile.baseUrl, preset.defaultBaseUrl);
    const { system, messages, wantsJson } = normalizeToChatMessages(params, sendParams);
    const temperature = typeof params?.config?.temperature === 'number' ? params.config.temperature : 0.7;
    const maxTokens =
      typeof params?.config?.maxOutputTokens === 'number'
        ? Math.min(params.config.maxOutputTokens, 16384)
        : 4096;

    if (preset.format === 'anthropic') {
      const anthropicMsgs = mergeConsecutiveMessagesForAnthropic(messages);
      const res = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': profile.apiKey.trim(),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: profile.model.trim(),
          max_tokens: maxTokens,
          temperature,
          ...(system ? { system } : {}),
          messages: anthropicMsgs
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        const err: any = new Error(`[${preset.label}] HTTP ${res.status}: ${errText.slice(0, 300)}`);
        err.status = res.status;
        err.isQuota = isExternalQuotaOrRateError(res.status, errText);
        throw err;
      }

      const data = await res.json();
      const text = Array.isArray(data?.content)
        ? data.content
            .filter((b: any) => b?.type === 'text' && typeof b?.text === 'string')
            .map((b: any) => b.text)
            .join('')
        : '';
      return buildGeminiCompatibleResponse(text, {
        promptTokens: data?.usage?.input_tokens || 0,
        completionTokens: data?.usage?.output_tokens || 0
      });
    }

    // OpenAI-compatible path (OpenAI, OpenRouter, DeepSeek, Groq, xAI, Custom)
    const openAiMessages = [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...messages
    ];

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${profile.apiKey.trim()}`
    };
    if (profile.providerType === 'openrouter') {
      headers['HTTP-Referer'] = typeof window !== 'undefined' ? window.location.origin : 'https://aetheria.app';
      headers['X-Title'] = 'Aetheria Studio';
    }

    const doRequest = async (includeResponseFormat: boolean) => {
      const bodyPayload: any = {
        model: profile.model.trim(),
        messages: openAiMessages,
        temperature,
        max_tokens: maxTokens
      };
      if (includeResponseFormat && wantsJson && profile.providerType !== 'custom') {
        bodyPayload.response_format = { type: 'json_object' };
      }
      return fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        signal,
        headers,
        body: JSON.stringify(bodyPayload)
      });
    };

    let res = await doRequest(true);
    if (res.status === 400 && wantsJson) {
      const firstErrText = await res.clone().text();
      if (firstErrText.toLowerCase().includes('response_format')) {
        res = await doRequest(false);
      }
    }

    if (!res.ok) {
      const errText = await res.text();
      const err: any = new Error(`[${profile.name}] HTTP ${res.status}: ${errText.slice(0, 300)}`);
      err.status = res.status;
      err.isQuota = isExternalQuotaOrRateError(res.status, errText);
      throw err;
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? '';
    return buildGeminiCompatibleResponse(text, {
      promptTokens: data?.usage?.prompt_tokens || 0,
      completionTokens: data?.usage?.completion_tokens || 0,
      totalTokens: data?.usage?.total_tokens || 0
    });
  },

  async *invokeStreamSingle(
    profile: ExternalProviderProfile,
    params: any,
    sendParams?: any,
    onChunk?: (text: string) => void
  ): AsyncGenerator<any, void, unknown> {
    const preset = PROVIDER_PRESETS[profile.providerType] || PROVIDER_PRESETS.custom;
    const baseUrl = cleanBaseUrl(profile.baseUrl, preset.defaultBaseUrl);
    const { system, messages, wantsJson } = normalizeToChatMessages(params, sendParams);
    const temperature = typeof params?.config?.temperature === 'number' ? params.config.temperature : 0.7;
    const maxTokens =
      typeof params?.config?.maxOutputTokens === 'number'
        ? Math.min(params.config.maxOutputTokens, 16384)
        : 4096;

    let res: Response;
    if (preset.format === 'anthropic') {
      const anthropicMsgs = mergeConsecutiveMessagesForAnthropic(messages);
      res = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': profile.apiKey.trim(),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: profile.model.trim(),
          max_tokens: maxTokens,
          temperature,
          stream: true,
          ...(system ? { system } : {}),
          messages: anthropicMsgs
        })
      });
    } else {
      const openAiMessages = [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...messages
      ];
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${profile.apiKey.trim()}`
      };
      if (profile.providerType === 'openrouter') {
        headers['HTTP-Referer'] = typeof window !== 'undefined' ? window.location.origin : 'https://aetheria.app';
        headers['X-Title'] = 'Aetheria Studio';
      }

      const payload: any = {
        model: profile.model.trim(),
        messages: openAiMessages,
        temperature,
        max_tokens: maxTokens,
        stream: true
      };
      if (wantsJson && profile.providerType !== 'custom') {
        payload.response_format = { type: 'json_object' };
      }

      res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
    }

    if (!res.ok) {
      const errText = await res.text();
      const err: any = new Error(`[${profile.name}] HTTP ${res.status}: ${errText.slice(0, 300)}`);
      err.status = res.status;
      err.isQuota = isExternalQuotaOrRateError(res.status, errText);
      throw err;
    }

    if (!res.body) {
      throw new Error(`[${profile.name}] Trình duyệt không nhận được luồng stream.`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let promptTokens = 0;
    let completionTokens = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || !line.startsWith('data:')) continue;
        const jsonStr = line.slice(5).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(jsonStr);

          if (preset.format === 'anthropic') {
            if (parsed.type === 'message_start' && parsed.message?.usage) {
              promptTokens = parsed.message.usage.input_tokens || 0;
            } else if (parsed.type === 'message_delta' && parsed.usage) {
              completionTokens = parsed.usage.output_tokens || completionTokens;
            } else if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              const txt = parsed.delta.text;
              onChunk?.(txt);
              yield buildGeminiCompatibleResponse(txt);
            }
          } else {
            if (parsed.usage) {
              promptTokens = parsed.usage.prompt_tokens || promptTokens;
              completionTokens = parsed.usage.completion_tokens || completionTokens;
            }
            const deltaText = parsed?.choices?.[0]?.delta?.content;
            if (typeof deltaText === 'string' && deltaText.length > 0) {
              onChunk?.(deltaText);
              yield buildGeminiCompatibleResponse(deltaText);
            }
          }
        } catch {
          // ignore partial SSE JSON
        }
      }
    }

    if (promptTokens > 0 || completionTokens > 0) {
      yield buildGeminiCompatibleResponse('', { promptTokens, completionTokens });
    }
  },

  async executeWithPool(
    profiles: ExternalProviderProfile[],
    params: any,
    ctx: {
      logId: string;
      ownsLog: boolean;
      sendParams?: any;
      extractText: (res: any) => string;
    }
  ): Promise<any> {
    if (profiles.length === 0) {
      throw new Error('Không có Key ngoài nào được bật.');
    }

    let lastErr: any = null;
    const startCursor = lastExternalPoolIndex % profiles.length;
    let triedAny = false;
    let attemptNum = 0;

    for (let i = 0; i < profiles.length; i++) {
      const idx = (startCursor + i) % profiles.length;
      const profile = profiles[idx];
      const cooling = this.isProfileCoolingDown(profile.id);
      if (cooling && !(!triedAny && i === profiles.length - 1)) continue;

      triedAny = true;
      lastExternalPoolIndex = (idx + 1) % profiles.length;
      attemptNum++;

      const label = `${profile.providerType.toUpperCase()} · ${profile.model}`;
      plotDebugLogger.updateAttempt(ctx.logId, {
        model: label,
        apiKey: profile.apiKey,
        keyIndex: idx + 1,
        totalKeys: profiles.length,
        status: 'pending',
        attemptCount: attemptNum,
        phase: `Đang gọi ${profile.name} (${profile.model}) [Key #${idx + 1}/${profiles.length}]...`
      });

      const reqId = tokenTracker.recordRequestStart(label, 1000, profile.apiKey);
      try {
        const res = await this.invokeGenerateSingle(profile, params, ctx.sendParams);
        tokenTracker.recordRequestSuccess(
          reqId,
          res?.usageMetadata?.promptTokenCount || 0,
          res?.usageMetadata?.candidatesTokenCount || 0,
          res?.usageMetadata?.totalTokenCount || 0
        );
        if (ctx.ownsLog) {
          plotDebugLogger.completeSuccess(ctx.logId, {
            fullResponse: ctx.extractText(res),
            usageMetadata: res?.usageMetadata
          });
        }
        return res;
      } catch (err: any) {
        tokenTracker.recordRequestFailure(reqId);
        lastErr = err;
        if (err?.isQuota || err?.status === 429) {
          this.markProfileRateLimited(profile.id, 25000);
          plotDebugLogger.updateAttempt(ctx.logId, {
            status: 'rate_limit_429',
            phase: `${profile.name} (#${idx + 1}/${profiles.length}) chạm 429 — xoay key tiếp theo...`
          });
          continue;
        }
        if (isExternalTransientError(err)) {
          this.markProfileRateLimited(profile.id, 12000);
          plotDebugLogger.updateAttempt(ctx.logId, {
            phase: `${profile.name} (#${idx + 1}/${profiles.length}) gặp ${err?.status || 503}/quá tải — xoay key tiếp theo...`
          });
          continue;
        }
        this.markProfileRateLimited(profile.id, 10000);
        plotDebugLogger.updateAttempt(ctx.logId, {
          phase: `${profile.name} (#${idx + 1}/${profiles.length}) gặp lỗi — thử key dự phòng...`
        });
      }
    }
    throw lastErr || new Error('Tất cả Key ngoài đang tạm khóa hoặc không khả dụng.');
  },

  async *executeStreamWithPool(
    profiles: ExternalProviderProfile[],
    params: any,
    ctx: {
      logId: string;
      ownsLog: boolean;
      sendParams?: any;
    }
  ): AsyncGenerator<any, void, unknown> {
    if (profiles.length === 0) {
      throw new Error('Không có Key ngoài nào được bật.');
    }

    let lastErr: any = null;
    const startCursor = lastExternalPoolIndex % profiles.length;
    let triedAny = false;
    let attemptNum = 0;

    for (let i = 0; i < profiles.length; i++) {
      const idx = (startCursor + i) % profiles.length;
      const profile = profiles[idx];
      const cooling = this.isProfileCoolingDown(profile.id);
      if (cooling && !(!triedAny && i === profiles.length - 1)) continue;

      triedAny = true;
      lastExternalPoolIndex = (idx + 1) % profiles.length;
      attemptNum++;

      const label = `${profile.providerType.toUpperCase()} · ${profile.model}`;
      plotDebugLogger.updateAttempt(ctx.logId, {
        model: label,
        apiKey: profile.apiKey,
        keyIndex: idx + 1,
        totalKeys: profiles.length,
        status: 'pending',
        attemptCount: attemptNum,
        phase: `Đang mở Stream ${profile.name} (${profile.model}) [Key #${idx + 1}/${profiles.length}]...`
      });

      const reqId = tokenTracker.recordRequestStart(label, 1000, profile.apiKey);
      let yieldedAny = false;
      let fullText = '';
      let finalUsage: any = undefined;

      try {
        for await (const chunk of this.invokeStreamSingle(profile, params, ctx.sendParams, (txt) => {
          fullText += txt;
          if (ctx.ownsLog) {
            plotDebugLogger.updateStreaming(ctx.logId, txt);
          }
        })) {
          if (chunk?.usageMetadata) {
            finalUsage = chunk.usageMetadata;
          }
          if (chunk?.text) {
            yieldedAny = true;
            yield chunk;
          }
        }

        tokenTracker.recordRequestSuccess(
          reqId,
          finalUsage?.promptTokenCount || 0,
          finalUsage?.candidatesTokenCount || 0,
          finalUsage?.totalTokenCount || 0
        );
        if (ctx.ownsLog) {
          plotDebugLogger.completeSuccess(ctx.logId, {
            fullResponse: fullText,
            usageMetadata: finalUsage
          });
        }
        return;
      } catch (err: any) {
        tokenTracker.recordRequestFailure(reqId);
        lastErr = err;
        if (!yieldedAny && (err?.isQuota || err?.status === 429)) {
          this.markProfileRateLimited(profile.id, 25000);
          plotDebugLogger.updateAttempt(ctx.logId, {
            status: 'rate_limit_429',
            phase: `Stream ${profile.name} (#${idx + 1}/${profiles.length}) chạm 429 — xoay key...`
          });
          continue;
        }
        if (!yieldedAny && isExternalTransientError(err)) {
          this.markProfileRateLimited(profile.id, 12000);
          plotDebugLogger.updateAttempt(ctx.logId, {
            phase: `Stream ${profile.name} (#${idx + 1}/${profiles.length}) gặp ${err?.status || 503}/quá tải — xoay key...`
          });
          continue;
        }
        if (!yieldedAny) {
          this.markProfileRateLimited(profile.id, 10000);
          continue;
        }
        throw err;
      }
    }
    throw lastErr || new Error('Tất cả Key ngoài đang tạm khóa hoặc gặp lỗi stream.');
  },

  async testProfile(
    profile: ExternalProviderProfile,
    timeoutMs: number = 15000
  ): Promise<{ success: boolean; message: string; latencyMs: number }> {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await this.invokeGenerateSingle(
        profile,
        {
          contents: [{ parts: [{ text: 'Ping. Reply OK.' }] }],
          config: { temperature: 0.1, maxOutputTokens: 16 }
        },
        undefined,
        controller.signal
      );
      const latencyMs = Math.max(1, Date.now() - start);
      const reply = String(res?.text || 'OK').trim().slice(0, 40);
      return {
        success: true,
        latencyMs,
        message: `Kết nối thành công (${latencyMs}ms · "${reply}")`
      };
    } catch (err: any) {
      const latencyMs = Math.max(1, Date.now() - start);
      const msg = String(err?.message || err || 'Lỗi kết nối');
      if (controller.signal.aborted || msg.toLowerCase().includes('abort')) {
        return {
          success: false,
          latencyMs,
          message: `Quá thời gian chờ (${Math.round(timeoutMs / 1000)}s) khi gọi ${profile.model}.`
        };
      }
      return {
        success: false,
        latencyMs,
        message: msg
      };
    } finally {
      clearTimeout(timer);
    }
  }
};
