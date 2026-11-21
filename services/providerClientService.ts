import {
  ConnectionTestResult,
  ExternalProviderProfile
} from './providerTypes.ts';
import {
  buildEndpointUrl,
  buildProviderAuthHeaders,
  getPresetForProviderType,
  getProtocolFormat,
  validateBaseUrl
} from './modelDiscoveryService.ts';
import { redactSecrets } from './secureCredentialStorage.ts';
import { isServerRuntime, serverSyncClient } from './runtimeAdapter.ts';

export class ProviderClientError extends Error {
  public readonly status?: number;
  public readonly isQuota: boolean;
  public readonly errorCode: NonNullable<ConnectionTestResult['errorCode']>;

  constructor(
    message: string,
    options: {
      status?: number;
      isQuota?: boolean;
      errorCode?: NonNullable<ConnectionTestResult['errorCode']>;
    } = {}
  ) {
    super(message);
    this.name = 'ProviderClientError';
    this.status = options.status;
    this.isQuota = Boolean(options.isQuota);
    this.errorCode = options.errorCode || 'UNKNOWN';
  }
}

export interface NormalizedChatPayload {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  wantsJson: boolean;
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

export function normalizeToChatMessages(params: any, sendParams?: any): NormalizedChatPayload {
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

export function buildGeminiCompatibleResponse(
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

export function isQuotaOrRateError(status: number, errText: string): boolean {
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

export function isTransientProviderError(err: any): boolean {
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

function classifyHttpError(
  profileName: string,
  status: number,
  rawErrText: string,
  apiKey: string
): ProviderClientError {
  const safeBody = redactSecrets(rawErrText, [apiKey]).slice(0, 260);
  const lower = safeBody.toLowerCase();
  const isQuota = isQuotaOrRateError(status, safeBody);

  if (status === 401 || status === 403) {
    return new ProviderClientError(
      `[${profileName}] Xác thực thất bại (HTTP ${status}): API Key sai, hết hạn hoặc thiếu quyền.${safeBody ? ` (${safeBody})` : ''}`,
      { status, isQuota: false, errorCode: 'AUTH_FAILED' }
    );
  }
  if (status === 429 || isQuota) {
    return new ProviderClientError(
      `[${profileName}] Chạm giới hạn tần suất / hết hạn mức (HTTP ${status}).${safeBody ? ` (${safeBody})` : ''}`,
      { status, isQuota: true, errorCode: 'RATE_LIMITED' }
    );
  }
  if (
    status === 404 ||
    (status === 400 && (lower.includes('model') && (lower.includes('not found') || lower.includes('does not exist') || lower.includes('invalid'))))
  ) {
    return new ProviderClientError(
      `[${profileName}] Model không tồn tại hoặc không được hỗ trợ (HTTP ${status}).${safeBody ? ` (${safeBody})` : ''}`,
      { status, isQuota: false, errorCode: 'MODEL_NOT_FOUND' }
    );
  }
  if (status >= 500) {
    return new ProviderClientError(
      `[${profileName}] Lỗi máy chủ provider (HTTP ${status}).${safeBody ? ` (${safeBody})` : ''}`,
      { status, isQuota: false, errorCode: 'SERVER_ERROR' }
    );
  }
  return new ProviderClientError(
    `[${profileName}] Yêu cầu thất bại (HTTP ${status})${safeBody ? `: ${safeBody}` : ''}`,
    { status, isQuota: false, errorCode: 'UNKNOWN' }
  );
}

/**
 * Inspects a 400/422 error message to determine which optional parameters the remote API rejected.
 */
export function detectUnsupportedParamsFromError(errText: string): Array<'temperature' | 'max_tokens' | 'max_completion_tokens' | 'response_format'> {
  const lower = (errText || '').toLowerCase();
  const unsupported: Array<'temperature' | 'max_tokens' | 'max_completion_tokens' | 'response_format'> = [];
  if (lower.includes('response_format')) unsupported.push('response_format');
  if (lower.includes('temperature')) unsupported.push('temperature');
  if (lower.includes('max_tokens') && !lower.includes('max_completion_tokens')) {
    unsupported.push('max_tokens');
  }
  if (lower.includes('max_completion_tokens')) {
    unsupported.push('max_completion_tokens');
  }
  return unsupported;
}

function resolveEffectiveTemperature(profile: ExternalProviderProfile, params: any): number | undefined {
  if (typeof profile.temperature === 'number' && !Number.isNaN(profile.temperature)) {
    return Math.min(2, Math.max(0, profile.temperature));
  }
  if (typeof params?.config?.temperature === 'number' && !Number.isNaN(params.config.temperature)) {
    return Math.min(2, Math.max(0, params.config.temperature));
  }
  return undefined;
}

function resolveEffectiveMaxTokens(profile: ExternalProviderProfile, params: any): number | undefined {
  if (typeof profile.maxTokens === 'number' && profile.maxTokens > 0) {
    return Math.floor(profile.maxTokens);
  }
  if (typeof params?.config?.maxOutputTokens === 'number' && params.config.maxOutputTokens > 0) {
    return Math.min(Math.floor(params.config.maxOutputTokens), 32768);
  }
  return undefined;
}

export function validateProviderBeforeRequest(profile: ExternalProviderProfile): string | null {
  const preset = getPresetForProviderType(profile.providerType);
  const scheme = profile.authScheme || preset.defaultAuthScheme;
  const effectiveBase = profile.baseUrl || preset.defaultBaseUrl;

  const urlCheck = validateBaseUrl(effectiveBase);
  if (!urlCheck.valid) {
    return urlCheck.error || 'Base URL không hợp lệ.';
  }
  if (scheme !== 'none' && !profile.apiKey?.trim()) {
    return 'API Key chưa được cấu hình cho provider này.';
  }
  if (!profile.model?.trim()) {
    return 'Tên Model không được để trống.';
  }
  if (
    typeof profile.temperature === 'number' &&
    (Number.isNaN(profile.temperature) || profile.temperature < 0 || profile.temperature > 2)
  ) {
    return 'Temperature phải nằm trong khoảng 0.0 – 2.0.';
  }
  if (typeof profile.maxTokens === 'number' && (Number.isNaN(profile.maxTokens) || profile.maxTokens < 1)) {
    return 'Max Output Tokens phải là số nguyên dương.';
  }
  return null;
}

export const providerClientService = {
  async invokeGenerate(
    profile: ExternalProviderProfile,
    params: any,
    sendParams?: any,
    signal?: AbortSignal
  ): Promise<any> {
    const validationErr = validateProviderBeforeRequest(profile);
    if (validationErr) {
      throw new ProviderClientError(`[${profile.name}] ${validationErr}`, {
        errorCode: validationErr.includes('Base URL') ? 'INVALID_URL' : 'VALIDATION_ERROR'
      });
    }

    const preset = getPresetForProviderType(profile.providerType);
    const format = getProtocolFormat(profile.providerType);
    const baseUrl = validateBaseUrl(profile.baseUrl || preset.defaultBaseUrl).normalized;
    const { system, messages, wantsJson } = normalizeToChatMessages(params, sendParams);
    const headers = buildProviderAuthHeaders({
      providerType: profile.providerType,
      apiKey: profile.apiKey,
      authScheme: profile.authScheme,
      authHeaderName: profile.authHeaderName,
      customHeaders: profile.customHeaders
    });

    const temperature = resolveEffectiveTemperature(profile, params);
    const maxTokens = resolveEffectiveMaxTokens(profile, params);

    try {
      if (format === 'anthropic') {
        const anthropicMsgs = mergeConsecutiveMessagesForAnthropic(messages);
        const endpoint = buildEndpointUrl(baseUrl, '/messages');

        const sendAnthropic = async (omitTemp: boolean) => {
          const body: Record<string, any> = {
            model: profile.model.trim(),
            max_tokens: maxTokens || 4096,
            ...(system ? { system } : {}),
            messages: anthropicMsgs
          };
          if (!omitTemp && typeof temperature === 'number') {
            body.temperature = temperature;
          }
          return fetch(endpoint, {
            method: 'POST',
            signal,
            headers,
            body: JSON.stringify(body)
          });
        };

        let res = await sendAnthropic(false);
        if ((res.status === 400 || res.status === 422) && typeof temperature === 'number') {
          const preview = await res.clone().text().catch(() => '');
          if (preview.toLowerCase().includes('temperature')) {
            res = await sendAnthropic(true);
          }
        }

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw classifyHttpError(profile.name, res.status, errText, profile.apiKey);
        }

        const rawText = await res.text();
        let data: any;
        try {
          data = JSON.parse(rawText);
        } catch {
          throw new ProviderClientError(`[${profile.name}] Phản hồi JSON từ Anthropic không hợp lệ.`, {
            errorCode: 'INVALID_RESPONSE'
          });
        }
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

      if (format === 'gemini') {
        const cleanModel = profile.model.trim().replace(/^models\//, '');
        const endpoint = buildEndpointUrl(baseUrl, `/models/${encodeURIComponent(cleanModel)}:generateContent`);
        const contents = messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));

        const sendGemini = async (omitTemp: boolean, omitMaxTokens: boolean) => {
          const generationConfig: Record<string, any> = {};
          if (!omitTemp && typeof temperature === 'number') generationConfig.temperature = temperature;
          if (!omitMaxTokens && typeof maxTokens === 'number') generationConfig.maxOutputTokens = maxTokens;
          if (wantsJson) generationConfig.responseMimeType = 'application/json';

          const body: Record<string, any> = {
            contents,
            ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
            ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {})
          };

          return fetch(endpoint, {
            method: 'POST',
            signal,
            headers,
            body: JSON.stringify(body)
          });
        };

        let res = await sendGemini(false, false);
        if (res.status === 400) {
          const preview = await res.clone().text().catch(() => '');
          const lower = preview.toLowerCase();
          if (lower.includes('temperature') || lower.includes('maxoutputtokens')) {
            res = await sendGemini(lower.includes('temperature'), lower.includes('maxoutputtokens'));
          }
        }

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw classifyHttpError(profile.name, res.status, errText, profile.apiKey);
        }

        const rawText = await res.text();
        let data: any;
        try {
          data = JSON.parse(rawText);
        } catch {
          throw new ProviderClientError(`[${profile.name}] Phản hồi JSON từ Gemini endpoint không hợp lệ.`, {
            errorCode: 'INVALID_RESPONSE'
          });
        }
        const text =
          data?.candidates?.[0]?.content?.parts
            ?.map((p: any) => p?.text || '')
            .join('') || '';
        return buildGeminiCompatibleResponse(text, {
          promptTokens: data?.usageMetadata?.promptTokenCount || 0,
          completionTokens: data?.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: data?.usageMetadata?.totalTokenCount || 0
        });
      }

      // OpenAI-compatible path
      const openAiMessages = [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...messages
      ];
      const endpoint = buildEndpointUrl(baseUrl, '/chat/completions');

      const sendOpenAI = async (opts: {
        omitResponseFormat: boolean;
        omitTemperature: boolean;
        omitMaxTokens: boolean;
        useMaxCompletionTokens: boolean;
      }) => {
        const payload: Record<string, any> = {
          model: profile.model.trim(),
          messages: openAiMessages
        };
        if (!opts.omitTemperature && typeof temperature === 'number') {
          payload.temperature = temperature;
        }
        if (!opts.omitMaxTokens && typeof maxTokens === 'number') {
          if (opts.useMaxCompletionTokens) {
            payload.max_completion_tokens = maxTokens;
          } else {
            payload.max_tokens = maxTokens;
          }
        }
        if (
          !opts.omitResponseFormat &&
          wantsJson &&
          profile.providerType !== 'openai_compatible' &&
          profile.providerType !== 'custom'
        ) {
          payload.response_format = { type: 'json_object' };
        }

        return fetch(endpoint, {
          method: 'POST',
          signal,
          headers,
          body: JSON.stringify(payload)
        });
      };

      let retryOpts = {
        omitResponseFormat: false,
        omitTemperature: false,
        omitMaxTokens: false,
        useMaxCompletionTokens: false
      };

      let res = await sendOpenAI(retryOpts);
      if (res.status === 400 || res.status === 422) {
        const preview = await res.clone().text().catch(() => '');
        const unsupported = detectUnsupportedParamsFromError(preview);
        const wantsMaxCompletion = preview.toLowerCase().includes('max_completion_tokens');
        if (unsupported.length > 0 || wantsMaxCompletion) {
          retryOpts = {
            omitResponseFormat: unsupported.includes('response_format'),
            omitTemperature: unsupported.includes('temperature'),
            omitMaxTokens: unsupported.includes('max_completion_tokens') || (unsupported.includes('max_tokens') && !wantsMaxCompletion),
            useMaxCompletionTokens: wantsMaxCompletion && !unsupported.includes('max_completion_tokens')
          };
          res = await sendOpenAI(retryOpts);
        }
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw classifyHttpError(profile.name, res.status, errText, profile.apiKey);
      }

      const rawText = await res.text();
      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new ProviderClientError(
          `[${profile.name}] Phản hồi không đúng định dạng JSON OpenAI (có thể sai Base URL endpoint).`,
          { errorCode: 'INVALID_RESPONSE' }
        );
      }

      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' && !Array.isArray(content)) {
        throw new ProviderClientError(
          `[${profile.name}] Phản hồi JSON thiếu trường choices[0].message.content hợp lệ.`,
          { errorCode: 'INVALID_RESPONSE' }
        );
      }
      const text = Array.isArray(content)
        ? content.map((part: any) => (typeof part?.text === 'string' ? part.text : '')).join('')
        : content;

      return buildGeminiCompatibleResponse(text, {
        promptTokens: data?.usage?.prompt_tokens || 0,
        completionTokens: data?.usage?.completion_tokens || 0,
        totalTokens: data?.usage?.total_tokens || 0
      });
    } catch (err: any) {
      if (err instanceof ProviderClientError) throw err;
      if (err?.name === 'AbortError' || signal?.aborted) {
        throw new ProviderClientError(`[${profile.name}] Yêu cầu hết thời gian chờ hoặc bị hủy.`, {
          errorCode: 'TIMEOUT'
        });
      }
      const safeMsg = redactSecrets(String(err?.message || err || 'Lỗi kết nối'), [profile.apiKey]);
      const isNet =
        safeMsg.toLowerCase().includes('failed to fetch') ||
        safeMsg.toLowerCase().includes('network') ||
        safeMsg.toLowerCase().includes('load failed');
      throw new ProviderClientError(
        isNet
          ? `[${profile.name}] Lỗi kết nối mạng hoặc CORS bị chặn từ ${baseUrl}.`
          : `[${profile.name}] ${safeMsg}`,
        { errorCode: isNet ? 'NETWORK_ERROR' : 'UNKNOWN' }
      );
    }
  },

  async *invokeStream(
    profile: ExternalProviderProfile,
    params: any,
    sendParams?: any,
    onChunk?: (text: string) => void,
    signal?: AbortSignal
  ): AsyncGenerator<any, void, unknown> {
    const validationErr = validateProviderBeforeRequest(profile);
    if (validationErr) {
      throw new ProviderClientError(`[${profile.name}] ${validationErr}`, {
        errorCode: validationErr.includes('Base URL') ? 'INVALID_URL' : 'VALIDATION_ERROR'
      });
    }

    const preset = getPresetForProviderType(profile.providerType);
    const format = getProtocolFormat(profile.providerType);
    const baseUrl = validateBaseUrl(profile.baseUrl || preset.defaultBaseUrl).normalized;
    const { system, messages, wantsJson } = normalizeToChatMessages(params, sendParams);
    const headers = buildProviderAuthHeaders({
      providerType: profile.providerType,
      apiKey: profile.apiKey,
      authScheme: profile.authScheme,
      authHeaderName: profile.authHeaderName,
      customHeaders: profile.customHeaders
    });

    const temperature = resolveEffectiveTemperature(profile, params);
    const maxTokens = resolveEffectiveMaxTokens(profile, params);

    let res: Response;
    if (format === 'anthropic') {
      const anthropicMsgs = mergeConsecutiveMessagesForAnthropic(messages);
      const endpoint = buildEndpointUrl(baseUrl, '/messages');
      const body: Record<string, any> = {
        model: profile.model.trim(),
        max_tokens: maxTokens || 4096,
        stream: true,
        ...(typeof temperature === 'number' ? { temperature } : {}),
        ...(system ? { system } : {}),
        messages: anthropicMsgs
      };
      res = await fetch(endpoint, {
        method: 'POST',
        signal,
        headers,
        body: JSON.stringify(body)
      });
    } else if (format === 'gemini') {
      const cleanModel = profile.model.trim().replace(/^models\//, '');
      const endpoint = buildEndpointUrl(
        baseUrl,
        `/models/${encodeURIComponent(cleanModel)}:streamGenerateContent?alt=sse`
      );
      const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));
      const generationConfig: Record<string, any> = {};
      if (typeof temperature === 'number') generationConfig.temperature = temperature;
      if (typeof maxTokens === 'number') generationConfig.maxOutputTokens = maxTokens;
      if (wantsJson) generationConfig.responseMimeType = 'application/json';

      res = await fetch(endpoint, {
        method: 'POST',
        signal,
        headers,
        body: JSON.stringify({
          contents,
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {})
        })
      });
    } else {
      const openAiMessages = [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...messages
      ];
      const endpoint = buildEndpointUrl(baseUrl, '/chat/completions');

      const sendStreamOpenAI = async (opts: {
        omitResponseFormat: boolean;
        omitTemperature: boolean;
        omitMaxTokens: boolean;
        useMaxCompletionTokens: boolean;
      }) => {
        const payload: Record<string, any> = {
          model: profile.model.trim(),
          messages: openAiMessages,
          stream: true
        };
        if (!opts.omitTemperature && typeof temperature === 'number') {
          payload.temperature = temperature;
        }
        if (!opts.omitMaxTokens && typeof maxTokens === 'number') {
          if (opts.useMaxCompletionTokens) {
            payload.max_completion_tokens = maxTokens;
          } else {
            payload.max_tokens = maxTokens;
          }
        }
        if (
          !opts.omitResponseFormat &&
          wantsJson &&
          profile.providerType !== 'openai_compatible' &&
          profile.providerType !== 'custom'
        ) {
          payload.response_format = { type: 'json_object' };
        }
        return fetch(endpoint, {
          method: 'POST',
          signal,
          headers,
          body: JSON.stringify(payload)
        });
      };

      res = await sendStreamOpenAI({
        omitResponseFormat: false,
        omitTemperature: false,
        omitMaxTokens: false,
        useMaxCompletionTokens: false
      });

      if (res.status === 400 || res.status === 422) {
        const preview = await res.clone().text().catch(() => '');
        const unsupported = detectUnsupportedParamsFromError(preview);
        const wantsMaxCompletion = preview.toLowerCase().includes('max_completion_tokens');
        if (unsupported.length > 0 || wantsMaxCompletion) {
          res = await sendStreamOpenAI({
            omitResponseFormat: unsupported.includes('response_format'),
            omitTemperature: unsupported.includes('temperature'),
            omitMaxTokens:
              unsupported.includes('max_completion_tokens') ||
              (unsupported.includes('max_tokens') && !wantsMaxCompletion),
            useMaxCompletionTokens: wantsMaxCompletion && !unsupported.includes('max_completion_tokens')
          });
        }
      }
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw classifyHttpError(profile.name, res.status, errText, profile.apiKey);
    }

    if (!res.body) {
      throw new ProviderClientError(`[${profile.name}] Trình duyệt không nhận được luồng stream.`, {
        errorCode: 'INVALID_RESPONSE'
      });
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

          if (format === 'anthropic') {
            if (parsed.type === 'message_start' && parsed.message?.usage) {
              promptTokens = parsed.message.usage.input_tokens || 0;
            } else if (parsed.type === 'message_delta' && parsed.usage) {
              completionTokens = parsed.usage.output_tokens || completionTokens;
            } else if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              const txt = parsed.delta.text;
              onChunk?.(txt);
              yield buildGeminiCompatibleResponse(txt);
            }
          } else if (format === 'gemini') {
            if (parsed.usageMetadata) {
              promptTokens = parsed.usageMetadata.promptTokenCount || promptTokens;
              completionTokens = parsed.usageMetadata.candidatesTokenCount || completionTokens;
            }
            const partsText = parsed?.candidates?.[0]?.content?.parts
              ?.map((p: any) => p?.text || '')
              .join('');
            if (typeof partsText === 'string' && partsText.length > 0) {
              onChunk?.(partsText);
              yield buildGeminiCompatibleResponse(partsText);
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
          // Ignore partial SSE chunk JSON
        }
      }
    }

    if (promptTokens > 0 || completionTokens > 0) {
      yield buildGeminiCompatibleResponse('', { promptTokens, completionTokens });
    }
  },

  async testConnection(
    profile: ExternalProviderProfile,
    timeoutMs: number = 15000
  ): Promise<ConnectionTestResult> {
    const start = Date.now();
    const validationErr = validateProviderBeforeRequest(profile);
    if (validationErr) {
      return {
        success: false,
        latencyMs: 0,
        errorCode: validationErr.includes('Base URL') ? 'INVALID_URL' : 'VALIDATION_ERROR',
        message: validationErr
      };
    }

    if (typeof window !== 'undefined' && !isServerRuntime()) {
      return serverSyncClient.testCustomProvider(profile, timeoutMs);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const testProfile: ExternalProviderProfile = {
        ...profile,
        maxTokens: 16
      };
      const res = await this.invokeGenerate(
        testProfile,
        {
          contents: [{ parts: [{ text: 'Ping. Reply OK.' }] }],
          config: { maxOutputTokens: 16 }
        },
        undefined,
        controller.signal
      );

      const latencyMs = Math.max(1, Date.now() - start);
      const reply = redactSecrets(String(res?.text || 'OK').trim(), [profile.apiKey]).slice(0, 50);
      return {
        success: true,
        latencyMs,
        statusCode: 200,
        message: `Kết nối thành công (${latencyMs}ms · "${reply || 'OK'}")`
      };
    } catch (err: any) {
      const latencyMs = Math.max(1, Date.now() - start);
      if (controller.signal.aborted || err?.errorCode === 'TIMEOUT') {
        return {
          success: false,
          latencyMs,
          errorCode: 'TIMEOUT',
          message: `Quá thời gian chờ (${Math.round(timeoutMs / 1000)}s) khi gọi model "${profile.model}".`
        };
      }
      const safeMessage = redactSecrets(String(err?.message || err || 'Lỗi kết nối'), [profile.apiKey]);
      return {
        success: false,
        latencyMs,
        statusCode: err?.status,
        errorCode: err?.errorCode || 'UNKNOWN',
        message: safeMessage
      };
    } finally {
      clearTimeout(timer);
    }
  }
};
